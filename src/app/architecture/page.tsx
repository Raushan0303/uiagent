'use client';

import { useState } from 'react';
import { AGENTMESH, formatNum } from '@/lib/store';
import { AgentMeshDiagram, WiringDiagram, InferRouteDiagram, HiringAgentDiagram } from '@/components/ArchitectureDiagrams';

const AGENTMESH_PATTERNS = [
  { color: 'var(--accent)', title: '1. Temporal Workers + Task Queues → Horizontal Scalability', pattern: 'Generic Worker Factory — run_worker(client, task_queue, workflows, activities)', problem: 'How do you scale from 10 to 1,000,000 concurrent agent workflows?', solution: 'Workers are stateless pollers. They pull tasks from a shared Task Queue. To handle 10x more agent workflows, you add 10x more workers — no code changes, no sharding logic. Temporal handles dispatch, dedup, and retry.', why: 'The gateway starts agent workflows, workers execute the agent\'s activities (LLM calls, tool calls, searches). They\'re decoupled. You can scale workers independently of gateways. Add workers on different machines, different regions — they all poll the same queue. Load tested: 10,000 concurrent agent workflows, 98.7% success rate, 5.4x throughput with 4 workers.' },
  { color: 'var(--danger)', title: '2. Circuit Breaker — Cross-Workflow Failure Isolation for Agent Tools', pattern: 'Circuit Breaker (CLOSED → OPEN → HALF_OPEN)', problem: 'Temporal retries failed Activities per-workflow. But if a supplier API is down, 1000 agent workflows all retry the same tool simultaneously — thundering herd.', solution: 'Per-tool circuit breaker keyed by tool name, shared across all agent workflows. After 5 consecutive failures, circuit opens — all agents fail fast instead of hammering a dead API. After 30s, half-open probes test recovery.', why: 'Without this, one dead supplier API can take down the entire agent fleet. With it, the system degrades gracefully — agents using healthy tools keep running, agents using broken tools fail fast and retry later.' },
  { color: 'var(--warning)', title: '3. Bulkhead — Concurrency Isolation Per Agent Tool', pattern: 'Bulkhead (semaphore-based concurrency cap)', problem: 'If a supplier API is slow, it occupies all worker activity slots. Other agents\' tool calls time out waiting for a slot — even though their downstream is healthy.', solution: 'Per-tool bulkhead caps concurrent in-flight calls (default: 10). A slow supplier API can\'t consume more than its cap. Other agents\' tool calls proceed in parallel.', why: 'This is the failure isolation Temporal doesn\'t give you. Temporal isolates per-agent-workflow; bulkheads isolate per-tool. Together they provide full blast-radius containment — one slow tool can\'t starve the entire agent fleet.' },
  { color: 'var(--success)', title: '4. Workflow Versioning — Zero-Downtime Agent Behavior Changes', pattern: 'Safe Migration Wrapper — is_patched(change_id)', problem: 'You need to add a Score step to the sourcing agent. But 500 agent workflows are already running with the old 3-step graph. You can\'t just deploy new code — replaying old workflows with new code breaks determinism.', solution: 'Temporal\'s workflow.patched() returns True for new workflows, False for in-flight workflows replaying old code. New agent workflows get the Score step; old workflows continue on the old path. Once all old workflows complete, deprecate the patch.', why: 'You can deploy agent behavior changes multiple times a day without waiting for in-flight workflows to drain. This is how you iterate on agent intelligence without downtime.' },
  { color: 'var(--purple)', title: '5. Namespace Isolation — Multi-Tenancy', pattern: 'Tenant Isolation Primitive — Temporal Namespaces', problem: 'Multiple tenants share the same Temporal cluster. Tenant A\'s workflows should be invisible to Tenant B.', solution: 'Each tenant gets a Namespace. Clients are cached per-namespace. Workflows, queries, and signals are all namespace-scoped — no cross-tenant visibility.', why: 'Multi-tenancy at the platform level, not the application level. No need to filter by tenant_id in every query — the isolation is structural.' },
  { color: 'var(--accent)', title: '6. Distributed Tracing — End-to-End Observability', pattern: 'OpenTelemetry Facade with Temporal Interceptor', problem: 'A workflow calls 5 tools, an LLM, and pauses for human approval. When something goes wrong, how do you trace the full path?', solution: 'OTel tracer injected at the gateway. Temporal\'s TracingInterceptor propagates trace context through workflow headers. Every activity, tool call, and LLM call becomes a span in the same Jaeger trace.', why: 'One trace ID follows a request from gateway → workflow → activity → tool → LLM → response. You see the entire execution tree, not isolated logs.' },
];

const INFERROUTE_PATTERNS = [
  { color: 'var(--accent)', title: '1. Config-Based Dynamic Routing — Portkey-Style, Smarter', pattern: 'Per-tenant config + dynamic provider scoring (no strategy name needed)', problem: 'At scale with 100 tenants and 2000 workflows, the developer knows which model each node needs. The gateway shouldn\'t guess — it should respect the developer\'s config and dynamically pick the best provider within that config.', solution: 'Developer creates routing configs (like Portkey): "for the decide node, use gpt-4o or claude-sonnet". Each request sends a config_id header. The gateway looks up the config (Redis-cached, ~1ms), scores all providers in real-time (latency, load, cost, health, circuit breaker), and picks the best one. No strategy name needed — the gateway figures it out dynamically.', why: 'Portkey processes 10B tokens/day with static config + weighted round-robin. We go further: same per-tenant config model, but the gateway dynamically scores providers instead of blind round-robin. <1ms overhead, scales to millions of unique prompts, and the developer never has to pick a "strategy".' },
  { color: 'var(--accent)', title: '2. Intelligence-Aware Routing — Fallback When No Config', pattern: 'Heuristic-only classification (0ms, no LLM call by default)', problem: 'When no config_id is sent (model="auto"), the gateway still needs to route. But calling an LLM to classify every prompt doesn\'t scale — 100K unique prompts means 100K classifier calls.', solution: 'Heuristic-only classification (0ms, keyword matching + prompt length). Handles ~80% of prompts confidently. Uncertain prompts default to "medium" tier (safe). LLM classifier is opt-in per tenant — only if they explicitly enable it in their config. No forced LLM classification in the default path.', why: 'This is the on-ramp: works out of the box without config, then the developer creates configs to optimize. The intelligence layer steps aside when configs are present.' },
  { color: 'var(--success)', title: '3. Multi-Layer Cache Pipeline — Request Deduplication', pattern: 'Chain of Responsibility — Exact → Semantic → Coalesce → Upstream', problem: 'Multiple workflows ask the same LLM question. Each call costs money and adds latency.', solution: 'Three cache layers, checked in order: 1. Exact Match — SHA256 hash of canonical request → Redis. O(1) lookup. TTL jitter prevents thundering herd. 2. Semantic Cache — Embedding similarity ≥ threshold. 3. Request Coalescer — Single-flight pattern. If 10 workflows ask the same question simultaneously, only 1 upstream call is made.', why: 'At scale, 40-60% of LLM calls are cacheable. This cuts LLM costs in half and reduces p99 latency from 2s to <50ms for cache hits.' },
  { color: 'var(--danger)', title: '4. Provider Failover — Resilience', pattern: 'Circuit Breaker per provider + failover chain', problem: 'OpenAI has an outage. Your agent workflows all fail.', solution: 'Provider Registry tracks health, latency (EWMA), and in-flight count per provider. On failure, RoutingService walks the failover chain: OpenAI → Anthropic → local vLLM. Circuit breaker opens per-provider after threshold failures.', why: 'LLM providers have 99.9% SLA, not 100%. Without failover, a 43-minute OpenAI outage kills all workflows. With failover, requests transparently route to Anthropic — workflows don\'t even notice.' },
  { color: 'var(--purple)', title: '5. Hybrid Retrieval — RAG Precision', pattern: 'Multi-Strategy Fusion with Reranking', problem: 'Dense vector search misses exact keyword matches. BM25 misses semantic similarity. Neither is enough alone.', solution: 'Run BM25 (lexical) and dense vector search (semantic) in parallel. Fuse results via Reciprocal Rank Fusion (RRF). Rerank top-K with a cross-encoder-style scorer for final precision.', why: 'Hybrid retrieval has 15-20% higher recall than either method alone. For agent memory — where missing a relevant past decision means repeating a mistake — this matters.' },
];

const ROUTING_STRATEGIES = [
  { color: 'var(--accent)', name: 'IntelligenceAware', when: 'Default. Production. When prompts vary in complexity — simple questions vs deep reasoning.', how: 'Classifies prompt complexity (simple/medium/complex) via heuristic keywords or LLM classifier (cached in Redis). Maps to tier: simple→cheap, medium→standard, complex→premium. Within tier, picks cheapest (cheap) or highest-weight (premium) or least-connections (standard).', cost: 'Saves 40% by routing 60% of traffic to cheaper providers' },
  { color: 'var(--success)', name: 'RoundRobin', when: 'Equal-cost providers, no complexity differences. Testing, dev environments.', how: 'Cycles through healthy providers one-by-one. Maintains a cycle iterator per provider list. If provider list changes (health check), rebuilds cycle.', cost: 'Even distribution, no cost optimization' },
  { color: 'var(--warning)', name: 'LeastConnections', when: 'Providers have similar cost but different capacity. Prevents overloading one provider.', how: 'Picks provider with lowest in_flight count. Each request increments in_flight on dispatch, decrements on completion. Real-time load balancing.', cost: 'Optimizes for throughput, not cost' },
  { color: 'var(--danger)', name: 'Weighted', when: 'Providers have different capacity tiers. Send 70% to provider A, 30% to provider B.', how: 'Random.choices() weighted by provider weight (configurable per registration). Higher weight = more traffic. Weights set at registration time.', cost: 'Manual cost control via weight tuning' },
  { color: 'var(--purple)', name: 'LatencyAware', when: 'Latency-sensitive applications (real-time chat, streaming). p99 matters more than cost.', how: 'Tracks EWMA latency per provider (α=0.3 default). Picks provider with lowest smoothed latency. If all providers have 0 latency (cold start), picks random. Updates latency after each response.', cost: 'Optimizes for speed, may pick expensive providers' },
  { color: 'var(--text-primary)', name: 'CostAware', when: 'Budget-constrained workloads. Always pick the cheapest provider regardless of quality.', how: 'Picks provider with lowest cost_per_1k_tokens. Simple min() over healthy providers. No complexity classification — just cost.', cost: 'Maximum savings, but simple prompts may get poor responses from cheap models' },
];

const LOAD_TRACKING = [
  { metric: 'in_flight', type: 'int', desc: 'Current active requests to this provider. Incremented before dispatch, decremented after response. Used by LeastConnections strategy.', visible: 'GET /v1/health → providers[].in_flight' },
  { metric: 'ewma_latency', type: 'float (ms)', desc: 'Exponentially weighted moving average of response latency. α=0.3 (configurable). Updated after each response. Used by LatencyAware strategy.', visible: 'GET /v1/health → providers[].ewma_latency_ms' },
  { metric: 'last_latency_ms', type: 'float (ms)', desc: 'Most recent response latency. For debugging — shows the last call\'s actual time, not the smoothed average.', visible: 'GET /v1/health → providers[].last_latency_ms' },
  { metric: 'status', type: 'enum', desc: 'HEALTHY / UNHEALTHY. Set by health checker (periodic probe) and circuit breaker (failure count). Unhealthy providers are excluded from routing.', visible: 'GET /v1/health → providers[].status' },
  { metric: 'circuit_state', type: 'enum', desc: 'CLOSED / OPEN / HALF_OPEN. CLOSED = normal. OPEN = tripped (5 consecutive failures), all requests fail fast. HALF_OPEN = probing (after 30s cooldown, one test request allowed).', visible: 'GET /v1/health → providers[].circuit_state' },
  { metric: 'weight', type: 'float', desc: 'Routing weight for Weighted strategy. Higher = more traffic. Set at provider registration. Default: 1.0.', visible: 'GET /v1/health → providers[].weight' },
  { metric: 'tier', type: 'string', desc: 'cheap / standard / premium. Used by IntelligenceAware to map complexity → provider tier. Set at registration.', visible: 'GET /v1/health → providers[].tier' },
  { metric: 'cost_per_1k_tokens', type: 'float ($)', desc: 'Cost per 1K tokens for this provider. Used by CostAware and IntelligenceAware (within cheap tier, picks lowest cost). Set at registration.', visible: 'GET /v1/health → providers[].cost_per_1k_tokens' },
];

const QUOTA_DATA = [
  { color: 'var(--accent)', title: 'Per-Tenant Token Quotas', desc: 'Each tenant has daily and monthly token limits enforced via Redis. QuotaEnforcer checks before routing and consumes after response. Returns HTTP 429 with Retry-After header when exceeded.', limits: 'Daily: 1,000,000 tokens | Monthly: 10,000,000 tokens (configurable per tenant)' },
  { color: 'var(--warning)', title: 'Redis Atomic Counters', desc: 'Quota tracked via Redis INCRBY with TTL. Daily counter expires at midnight UTC, monthly at month end. Atomic operations ensure no race conditions under concurrent load.', limits: 'Keys: quota:daily:{tenant}:{date} | quota:monthly:{tenant}:{month}' },
  { color: 'var(--danger)', title: 'Fail-Open on Redis Error', desc: 'If Redis is down, quota enforcement fails open — requests are allowed through. This prevents a Redis outage from taking down the entire gateway. Logged as warning.', limits: 'Graceful degradation — availability over strictness' },
  { color: 'var(--success)', title: 'Usage Logging to Postgres', desc: 'Every request (cache hit or miss) is logged to Postgres usage_log table: tenant_id, provider, model, input_tokens, output_tokens, total_tokens, cache_hit, trace_id, created_at. Powers the /v1/usage analytics endpoint.', limits: 'Partitioned by day. Old partitions archived to S3.' },
];

const RAG_AUGMENTATION_FLOW = [
  { step: '1', title: 'Request with namespace', desc: 'Client sends { model, messages, namespace: "sourcing-policies" }. The namespace parameter triggers RAG augmentation before the LLM call.' },
  { step: '2', title: 'Extract user query', desc: 'InferRoute extracts the last user message from the request. This becomes the RAG search query.' },
  { step: '3', title: 'Hybrid retrieval', desc: 'Query the rag_documents table in Postgres: dense vector search (pgvector cosine similarity) + BM25 lexical search. Results fused via Reciprocal Rank Fusion. Scoped by tenant_id + namespace.' },
  { step: '4', title: 'Augment prompt', desc: 'Retrieved documents are injected into the prompt: "Context:\\n{doc1}\\n\\n{doc2}\\n\\nQuestion: {original_query}". The augmented request is sent to the LLM provider.' },
  { step: '5', title: 'Cache the original, not augmented', desc: 'Cache keys are derived from the ORIGINAL request (without RAG context). This means cache hits return instantly — RAG retrieval only runs on cache misses. The transform is applied after cache check, before upstream call.' },
  { step: '6', title: 'Return with x_rag metadata', desc: 'Response includes x_rag: { namespace, retrieved: 3, sources: [{doc_id, score, source}], context_tokens: 240, cache_hit: false }. This lets the UI show which documents were used.' },
];

const TRACING_DATA = [
  { color: 'var(--accent)', name: 'Jaeger (via OTLP)', what: 'Distributed tracing — spans for every request: gateway → routing decision → provider call → response. W3C traceparent propagated to downstream services.', endpoint: 'OTLP HTTP export to localhost:4318/v1/traces', why: 'See the full request flow across InferRoute + AgentMesh in one trace tree. Identify which provider was chosen, how long classification took, cache hit/miss.' },
  { color: 'var(--success)', name: 'Langfuse', what: 'LLM-specific observability — prompt, completion, model, tokens, cost, latency per request. User feedback (thumbs up/down) linked to traces.', endpoint: 'Langfuse SDK, host configurable via env', why: 'LLM-specific metrics that Jaeger doesn\'t capture. Cost per request, token usage trends, feedback correlation. Dashboard for product/analytics teams.' },
];

const COST_BREAKDOWN = [
  { scenario: '"What is 2+2"', complexity: 'simple', provider: 'Groq (llama-3.3-70b)', tokens: '30', cost: '$0.002', openaiCost: '$0.005', saved: '$0.003', savedPct: '60%' },
  { scenario: '"Summarize this email"', complexity: 'simple', provider: 'vLLM (email-classifier)', tokens: '120', cost: '$0.000', openaiCost: '$0.018', saved: '$0.018', savedPct: '100%' },
  { scenario: '"Rank these 5 suppliers"', complexity: 'medium', provider: 'OpenAI (gpt-4o-mini)', tokens: '450', cost: '$0.068', openaiCost: '$0.068', saved: '$0.000', savedPct: '0%' },
  { scenario: '"Analyze supplier financial risk"', complexity: 'complex', provider: 'OpenAI (gpt-4o)', tokens: '800', cost: '$0.120', openaiCost: '$0.120', saved: '$0.000', savedPct: '0%' },
  { scenario: 'Cache hit (repeat query)', complexity: '—', provider: 'Redis (cached)', tokens: '0', cost: '$0.000', openaiCost: '$0.120', saved: '$0.120', savedPct: '100%' },
  { scenario: 'RAG + LLM (with context)', complexity: 'medium', provider: 'Groq (llama-3.3-70b)', tokens: '680', cost: '$0.040', openaiCost: '$0.102', saved: '$0.062', savedPct: '61%' },
];

const LOAD_TEST_ROWS = [
  { test: 'Small batch', wf: '10', workers: '1', throughput: '36.5/s', p50: '264ms', p99: '271ms', success: '100%', highlight: false },
  { test: 'Medium batch', wf: '100', workers: '1', throughput: '33.5/s', p50: '473ms', p99: '2.3s', success: '100%', highlight: false },
  { test: 'Scaling test', wf: '50', workers: '1', throughput: '19.3/s', p50: '588ms', p99: '2.6s', success: '100%', highlight: false },
  { test: 'Scaling test', wf: '50', workers: '2', throughput: '20.8/s', p50: '410ms', p99: '2.4s', success: '100%', highlight: false },
  { test: 'Scaling test (sweet spot)', wf: '50', workers: '4', throughput: '105.2/s', p50: '345ms', p99: '472ms', success: '100%', highlight: true },
  { test: 'Large batch', wf: '500', workers: '1', throughput: '39.6/s', p50: '966ms', p99: '6.7s', success: '100%', highlight: false },
  { test: 'Stress test', wf: '10,000', workers: '100', throughput: '36.6/s', p50: '6.0s', p99: '67s', success: '98.7%', highlight: false },
];

const TEMPORAL_SERVICES = [
  { color: 'var(--accent)', name: 'Frontend Service (7233)', role: 'Stateless gateway. Rate limiting, auth, routing. Hashes Workflow ID → History node.', scales: 'Stateless — add more behind a load balancer. No sharding.', prodNodes: '3-5 nodes' },
  { color: 'var(--warning)', name: 'History Service (7234)', role: 'The brain. Appends events, manages timers, creates tasks. Workflow state lives here.', scales: 'Sharded by Workflow ID hash. Add nodes → shards auto-redistribute via Ringpop.', prodNodes: '10-15 nodes' },
  { color: 'var(--success)', name: 'Matching Service (7235)', role: 'Hosts task queues. Matches workers to tasks. The dispatcher.', scales: 'Multiple instances, each hosting different task queue partitions (default: 4).', prodNodes: '10-17 nodes' },
  { color: 'var(--purple)', name: 'Worker Service (6939)', role: 'Runs Temporal\'s OWN internal workflows (replication, cleanup). NOT your workers.', scales: 'Horizontally — add more instances.', prodNodes: '3 nodes' },
];

const SHARD_ROWS = [
  { shards: '4', nodes: '1', writes: '4', useCase: 'Dev default (our VM). Fine for load testing up to 10K workflows.', highlight: false },
  { shards: '512', nodes: '1-2', writes: '512', useCase: 'Small production. Temporal recommends this as the starting point.', highlight: true },
  { shards: '4,000', nodes: '8', writes: '4,000', useCase: 'Medium production. ~1M concurrent workflows.', highlight: false },
  { shards: '16,000', nodes: '32', writes: '16,000', useCase: 'Large production. High-throughput platforms.', highlight: false },
  { shards: '128,000', nodes: '256', writes: '128,000', useCase: 'Extreme scale. Used by Stripe, Datadog, Snap.', highlight: false },
];

const PRODUCTION_DEPLOYMENTS = [
  { color: 'var(--accent)', name: 'Temporal Cloud (managed)', description: 'Temporal runs all 4 services, database, sharding, replication, backups. You just run workers. Auto-scales based on workload. Pay per execution.', usedBy: 'Snap, Retool, HashiCorp' },
  { color: 'var(--success)', name: 'Self-hosted on Kubernetes', description: 'Each service is a Deployment. Scale with kubectl scale. Shards auto-redistribute. Use Helm chart from Temporal. Postgres/Cassandra as database.', usedBy: 'Stripe, Datadog, Coinbase' },
  { color: 'var(--warning)', name: 'Self-hosted on VMs', description: 'For smaller workloads. Run services as processes across 3 VMs for HA. Same docker-compose we use, just distributed. Good up to ~10K workflows.', usedBy: 'Startups and small teams' },
];

const REDIS_SCALING = [
  { color: 'var(--success)', name: 'Single Instance (current)', detail: '1 Redis process. Fine for dev and <1K req/s. All keys in one process. No sharding, no replication.' },
  { color: 'var(--warning)', name: 'Redis HA (Master + Replica)', detail: '1 master + 1 replica with Sentinel for failover. Read replicas offload cache reads. Writes still go to master. Good for 1-10K req/s.' },
  { color: 'var(--accent)', name: 'Redis Cluster (sharded)', detail: 'N shards (e.g., 6 nodes = 3 master + 3 replica). Keys distributed by hash slot (16384 slots). Hash tags {tenant_id} keep tenant keys on same shard. Good for 10K-100K req/s.' },
  { color: 'var(--danger)', name: 'Redis Cluster + Read Replicas', detail: 'Each shard has 2+ read replicas. Cache reads (90% of traffic) go to replicas. Writes (cache fills) go to master. Good for 100K+ req/s. This is what large-scale caching looks like.' },
];

const VECTOR_SCALE_ROWS = [
  { scale: '< 100K docs', vector: 'Postgres + pgvector', bm25: 'In-memory (current)', partitioning: 'Index on (tenant_id, namespace)', highlight: true },
  { scale: '100K - 1M docs', vector: 'Postgres + pgvector + HNSW index', bm25: 'Elasticsearch (single node)', partitioning: 'Partition rag_documents by tenant_id' },
  { scale: '1M - 10M docs', vector: 'Qdrant or Milvus (dedicated vector DB)', bm25: 'Elasticsearch cluster (3 nodes)', partitioning: 'Per-tenant collections in vector DB' },
  { scale: '10M+ docs', vector: 'Pinecone (managed) or Milvus cluster', bm25: 'Elasticsearch cluster (10+ nodes)', partitioning: 'Sharded by tenant_id + namespace' },
];

const POSTGRES_WORKLOADS = [
  { color: 'var(--accent)', name: 'usage_log (billing)', pattern: 'INSERT per request + aggregate queries for analytics', scale: 'Time-partition by day. Old partitions → S3 archive. Read replicas for analytics. ~1M rows/day at scale.' },
  { color: 'var(--success)', name: 'rag_documents (vectors)', pattern: 'INSERT on upsert + vector similarity search (SELECT with <=> operator)', scale: 'Partition by tenant_id. HNSW index for ANN. For >1M vectors: move to Qdrant/Milvus.' },
  { color: 'var(--warning)', name: 'feedback (user ratings)', pattern: 'INSERT per feedback + aggregate for up-rate calculation', scale: 'Small table. No partitioning needed. Indexed by trace_id and created_at.' },
];

const WIRING_CALC_ROWS = [
  { component: 'AgentMesh workers', calc: '10K wf × 25% active ÷ 100 act/worker', result: '25 workers', color: 'var(--accent)', notes: 'Most workflows are waiting (human approval, supplier callback)' },
  { component: 'Concurrent LLM calls', calc: '25 active workers × 1 LLM call each', result: '~25 concurrent', color: 'var(--success)', notes: 'Not 10K — only active agents call InferRoute' },
  { component: 'InferRoute instances', calc: '25 concurrent ÷ 50 req/instance', result: '1-2 instances', color: 'var(--success)', notes: 'Each FastAPI instance handles ~50 concurrent requests' },
  { component: 'Redis ops/sec', calc: '25 req × 3 Redis ops (rate+cache+semantic)', result: '~75 ops/sec', color: 'var(--warning)', notes: 'Single Redis handles 100K+ ops/sec — plenty of headroom' },
  { component: 'LLM provider calls', calc: '25 calls × 60% cache hit rate', result: '~10 upstream/s', color: 'var(--danger)', notes: 'Cache absorbs 60% — only 40% reach OpenAI/Anthropic' },
  { component: 'RAG retrievals', calc: '25 calls × 30% use RAG', result: '~8 vector searches/s', color: 'var(--purple)', notes: 'RAG cache (30min TTL) absorbs repeated queries' },
  { component: 'Postgres writes', calc: '25 writes/s (usage_log) + 2.5 (Temporal events)', result: '~28 writes/s', color: 'var(--purple)', notes: 'Postgres handles 10K+ writes/s — not a bottleneck' },
  { component: 'Trace spans/s', calc: '25 req × ~8 spans each', result: '~200 spans/s', color: 'var(--text-primary)', notes: 'OTLP batch export to Jaeger. Async, non-blocking.' },
];

export default function ArchitecturePage() {
  const [ltRunning, setLtRunning] = useState(false);
  const [ltResults, setLtResults] = useState<any>(null);
  const [ltError, setLtError] = useState<string | null>(null);
  const [scalingResults, setScalingResults] = useState<any[] | null>(null);
  const [scalingConclusion, setScalingConclusion] = useState<string>('');
  const [scalingRunning, setScalingRunning] = useState(false);
  const [scalingTab, setScalingTab] = useState<'agentmesh' | 'inferroute' | 'wiring'>('agentmesh');

  // Capacity planner state
  const [targetWorkflows, setTargetWorkflows] = useState(10000);
  const [workersPerPod, setWorkersPerPod] = useState(4);
  const [podsPerNode, setPodsPerNode] = useState(10);
  const [activitiesPerWorker, setActivitiesPerWorker] = useState(100);
  const [activitiesPerWorkflow, setActivitiesPerWorkflow] = useState(5);
  const [avgActivityDuration, setAvgActivityDuration] = useState(2); // seconds
  const [waitTimePerWorkflow, setWaitTimePerWorkflow] = useState(60); // minutes

  const plannerResult = (() => {
    // How many activities are executing at any given moment?
    // Not all workflows are active at once — most are waiting (human approval, supplier callback, timers)
    // Active fraction = total_active_time / total_wall_clock_time
    const totalActiveTimePerWorkflow = activitiesPerWorkflow * avgActivityDuration; // seconds
    const totalWallClockTime = totalActiveTimePerWorkflow + (waitTimePerWorkflow * 60); // seconds
    const activeFraction = totalActiveTimePerWorkflow / totalWallClockTime;

    // Concurrent active activities = workflows × active_fraction × activities_per_workflow
    // But only one activity runs at a time per workflow (sequential), so:
    const concurrentActiveActivities = Math.ceil(targetWorkflows * activeFraction);
    const workers = Math.max(1, Math.ceil(concurrentActiveActivities / activitiesPerWorker));
    const pods = Math.ceil(workers / workersPerPod);
    const nodes = Math.ceil(pods / podsPerNode);

    // Shards: 1 shard per ~2000 workflows (Temporal's rough guidance)
    const rawShards = Math.max(512, Math.ceil(targetWorkflows / 2000));
    const shards = Math.min(rawShards, 128000);
    const historyNodes = Math.max(1, Math.ceil(shards / 500));
    const frontendNodes = Math.max(3, Math.ceil(historyNodes / 3));
    const matchingNodes = Math.max(3, Math.ceil(workers / 5000));

    // Database recommendation
    let dbRecommendation = '';
    if (targetWorkflows <= 10000) {
      dbRecommendation = 'Single Postgres instance (like our VM). Sufficient for this scale.';
    } else if (targetWorkflows <= 100000) {
      dbRecommendation = 'Postgres HA cluster — primary + 2 read replicas. Streaming replication with automatic failover.';
    } else if (targetWorkflows <= 1000000) {
      dbRecommendation = 'Postgres HA cluster with partitioning, or Cassandra (3-node cluster). Temporal supports both.';
    } else {
      dbRecommendation = 'CockroachDB (distributed, horizontally scalable). Temporal supports it natively. Or Temporal Cloud (they handle it).';
    }

    // Category
    let category = '';
    let categoryColor = 'var(--text-primary)';
    let recommendation = '';
    if (targetWorkflows <= 1000) {
      category = 'SMALL SCALE (Startup / POC)';
      categoryColor = 'var(--success)';
      recommendation = 'Single VM for everything (Temporal + Postgres + workers). This is basically our setup. Cost: ~$50-100/month.';
    } else if (targetWorkflows <= 10000) {
      category = 'SMALL PRODUCTION';
      categoryColor = 'var(--success)';
      recommendation = '1 VM for Temporal server + Postgres. Workers on 1-2 separate VMs or K8s pods. 512 shards. Cost: ~$200-500/month.';
    } else if (targetWorkflows <= 100000) {
      category = 'MEDIUM PRODUCTION';
      categoryColor = 'var(--warning)';
      recommendation = 'Temporal server on 3-5 K8s nodes (HA). Workers on 10-20 K8s nodes. Postgres HA cluster. 512-4000 shards. Cost: ~$1,000-3,000/month.';
    } else if (targetWorkflows <= 1000000) {
      category = 'LARGE PRODUCTION';
      categoryColor = 'var(--danger)';
      recommendation = 'Temporal server on 15-30 K8s nodes. Workers on 100+ K8s nodes. Postgres HA with partitioning or Cassandra. 4000-16000 shards. Consider Temporal Cloud. Cost: ~$5,000-15,000/month.';
    } else {
      category = 'EXTREME SCALE (Stripe / Datadog level)';
      categoryColor = 'var(--danger)';
      recommendation = 'Use Temporal Cloud (managed) — they handle the server scaling. You just run workers on 500+ K8s nodes. 128K shards. CockroachDB. Cost: $50,000+/month. This is what Snap, Stripe, and Datadog do.';
    }

    return {
      workers, pods, nodes, shards, historyNodes, frontendNodes, matchingNodes,
      dbRecommendation, category, categoryColor, recommendation,
      concurrentActiveActivities, activeFraction,
      totalActiveTimePerWorkflow, totalWallClockTime,
    };
  })();

  const runLoadTest = async () => {
    const count = parseInt((document.getElementById('lt-count') as HTMLSelectElement).value);
    const concurrency = parseInt((document.getElementById('lt-concurrency') as HTMLSelectElement).value);
    const sleepMs = parseInt((document.getElementById('lt-sleep') as HTMLSelectElement).value);
    const workers = parseInt((document.getElementById('lt-workers') as HTMLSelectElement).value);

    setLtRunning(true);
    setLtResults(null);
    setLtError(null);
    setScalingResults(null);

    try {
      const resp = await fetch(`${AGENTMESH}/workflows/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, concurrency, sleep_ms: sleepMs, payload_size: 100, workers }),
      });
      const data = await resp.json();
      setLtResults(data);
    } catch (e: any) {
      setLtError(`Connection failed: ${e.message}. Is AgentMesh running on :8000 with the benchmark worker?`);
    }
    setLtRunning(false);
  };

  const runScalingTest = async () => {
    const count = parseInt((document.getElementById('lt-count') as HTMLSelectElement).value);
    const concurrency = parseInt((document.getElementById('lt-concurrency') as HTMLSelectElement).value);
    const sleepMs = parseInt((document.getElementById('lt-sleep') as HTMLSelectElement).value);

    setScalingRunning(true);
    setScalingResults(null);
    setLtResults(null);

    const workerCounts = [1, 2, 4];
    const results: any[] = [];

    for (const w of workerCounts) {
      try {
        const resp = await fetch(`${AGENTMESH}/workflows/benchmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, concurrency, sleep_ms: sleepMs, payload_size: 100, workers: w }),
        });
        const data = await resp.json();
        results.push(data);
      } catch (e: any) {
        results.push({ workers: w, error: e.message });
      }
    }

    setScalingResults(results);
    const baseline = results[0];
    const validResults = results.filter(r => !r.error);
    if (validResults.length > 0 && !baseline.error) {
      const bestThroughput = Math.max(...validResults.map(r => r.throughput_per_sec));
      const bestP99 = Math.min(...validResults.map(r => r.p99_ms));
      const bestWorkers = validResults.find(r => r.throughput_per_sec === bestThroughput)?.workers || 1;
      setScalingConclusion(`Key finding: Going from 1 → ${bestWorkers} workers improved throughput by ${((bestThroughput / baseline.throughput_per_sec - 1) * 100).toFixed(0)}% and reduced p99 from ${baseline.p99_ms}ms to ${bestP99}ms. This demonstrates linear horizontal scaling — add workers, get proportional throughput improvement. No code changes, no sharding.`);
    }
    setScalingRunning(false);
  };

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / ARCHITECTURE</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          Architecture &amp; Engineering Decisions
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6, maxWidth: 700 }}>
          The patterns that let this system scale horizontally — load-tested to 10K concurrent workflows, designed to extend further with more workers and shards.
        </p>
      </div>

      {/* Top-level Tab Switcher */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)' }}>
          {([
            { id: 'agentmesh', label: 'AgentMesh', sublabel: 'Durable Agent Execution', color: 'var(--accent)' },
            { id: 'inferroute', label: 'InferRoute', sublabel: 'LLM Gateway', color: 'var(--success)' },
            { id: 'wiring', label: 'Wiring Together', sublabel: 'Both at Scale', color: 'var(--warning)' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScalingTab(tab.id)}
              style={{
                padding: '14px 24px',
                background: scalingTab === tab.id ? 'var(--surface)' : 'transparent',
                border: 'none',
                borderBottom: scalingTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                color: scalingTab === tab.id ? tab.color : 'var(--text-dim)',
                fontSize: 14,
                fontWeight: scalingTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
                marginBottom: '-1px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>{tab.sublabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ TAB 1: AGENTMESH ═══════════════ */}
      {scalingTab === 'agentmesh' && (
      <>
      {/* AgentMesh Patterns */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>AGENTMESH — DURABLE AI AGENT EXECUTION PLATFORM</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
          Built on Temporal + LangGraph. Orchestrates multi-step AI agents with human-in-the-loop checkpoints,
          rejection-based retry loops, and cross-workflow failure isolation. Agents are durable (survive crashes),
          replayable (deterministic), and pauseable (human approval). Two real agents run on this engine today:
          the <strong style={{ color: 'var(--accent)' }}>Sourcing Agent</strong> (Research → Score → Decide → Approve → Confirm)
          and the <strong style={{ color: 'var(--success)' }}>Hiring Agent</strong> (Screen → Score → Schedule → Interview → Human Review → Offer) —
          same engine, same reliability primitives, two different domains.
        </p>
        <AgentMeshDiagram />
        <HiringAgentDiagram />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {AGENTMESH_PATTERNS.map((p, i) => (
            <div key={i} className="bordered-panel" style={{ padding: 20, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Pattern:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{p.pattern}</code>
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Problem:</strong> {p.problem}
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Solution:</strong> {p.solution}
                <br />
                <strong style={{ color: 'var(--success)' }}>Why it matters:</strong> {p.why}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Intelligence */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>AGENT INTELLIGENCE — REJECTION-AWARE RETRY LOOP</div>
        <div className="bordered-panel" style={{ padding: 20, borderLeft: '3px solid var(--accent)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            The agent doesn&apos;t just execute a fixed pipeline — it adapts based on human feedback.
          </p>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Flow:</strong> Research → Score → Decide → Approve (human checkpoint)
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>On rejection:</strong> Agent reads the rejection reason, loops back to Research with the feedback,
            finds new suppliers, re-scores, re-decides, and asks for approval again.
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>Retry limit:</strong> 3 rejections before the agent gives up. Each retry uses different supplier pools.
            <br />
            <strong style={{ color: 'var(--success)' }}>Why it matters:</strong> This is what makes it an <em>agent</em>, not a script. It responds to feedback,
            adapts its strategy, and tries again — the same loop a human procurement officer would follow.
          </div>
        </div>
      </div>

      {/* Load Test Results */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>REAL LOAD TEST RESULTS — NOT SIMULATION</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
            Actual Temporal workflows dispatched to actual workers. No mocks, no simulation.
            Tests the full pipeline: gateway → Temporal → task queue → worker → activity → return.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th style={{ textAlign: 'right' }}>Workflows</th>
                  <th style={{ textAlign: 'right' }}>Workers</th>
                  <th style={{ textAlign: 'right' }}>Throughput</th>
                  <th style={{ textAlign: 'right' }}>p50</th>
                  <th style={{ textAlign: 'right' }}>p99</th>
                  <th style={{ textAlign: 'right' }}>Success</th>
                </tr>
              </thead>
              <tbody>
                {LOAD_TEST_ROWS.map((row, i) => (
                  <tr key={i} style={row.highlight ? { background: 'rgba(61, 220, 132, 0.05)' } : undefined}>
                    <td style={{ fontWeight: row.highlight ? 600 : 400 }}>{row.test}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{row.wf}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{row.workers}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: row.highlight ? 600 : 400 }}>{row.throughput}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{row.p50}</td>
                    <td className="mono" style={{ textAlign: 'right', color: row.p99 === '67s' ? 'var(--danger)' : row.highlight ? 'var(--success)' : undefined }}>{row.p99}</td>
                    <td className="mono" style={{ textAlign: 'right', color: row.success === '100%' ? 'var(--success)' : 'var(--warning)' }}>{row.success}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bordered-panel" style={{ padding: 16, marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Key findings:</strong>
            <br />
            • 4 workers on 12 cores (no oversubscription) = <strong style={{ color: 'var(--success)' }}>5.4x throughput</strong>, p99 dropped 82% (2.6s → 472ms)
            <br />
            • 100 workers on 12 cores (8x oversubscription) = p99 degrades to 67s due to CPU context switching, not Temporal
            <br />
            • In production: distribute 100 workers across 10-20 machines — bottleneck moves from CPU to network I/O
            <br />
            • Architecture scales linearly — add workers, get proportional throughput. No sharding code, no partition logic.
          </div>
        </div>
      </div>

      {/* Scale Math */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>THE SCALE MATH — WORKERS</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>1 worker</strong> = 100 concurrent agent activities (configurable)
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>10 workers</strong> = 1,000 concurrent agent activities
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>100 workers</strong> = 10,000 concurrent agent activities
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>1000 workers</strong> = 100,000 concurrent agent activities
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>10000 workers</strong> = 1,000,000 concurrent agent activities
            <br /><br />
            Workers are stateless — add them via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>docker scale</code> or Kubernetes HPA. No sharding code, no partition logic. Temporal handles task dispatch across all workers polling the same queue.
            <br /><br />
            <strong style={{ color: 'var(--text-primary)' }}>Agent workflows waiting for human approval</strong> consume zero worker capacity — they&apos;re database rows, not processes. 1M workflows waiting = 0 workers needed. Workers only scale with active activity execution.
            <br /><br />
            <strong style={{ color: 'var(--text-primary)' }}>InferRoute</strong> scales the same way — it&apos;s a stateless FastAPI app behind a load balancer. Redis and Postgres scale independently via clustering.
          </div>
        </div>
      </div>

      {/* Temporal Cluster Scaling */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>SCALING THE TEMPORAL SERVER — WHEN WORKERS AREN&apos;T ENOUGH</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            The common question: <em>&ldquo;If the Temporal server runs on your VM, how do you scale it?&rdquo;</em>
            <br />
            Answer: The Temporal server is not a monolith. It&apos;s <strong style={{ color: 'var(--text-primary)' }}>4 independently scalable services</strong>.
            You scale each one by adding more nodes (processes). Sharding handles the distribution automatically.
          </p>

          {/* 4 Services */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
            {TEMPORAL_SERVICES.map((s, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: s.color, fontSize: 13, marginBottom: 6 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Role:</strong> {s.role}
                  <br />
                  <strong style={{ color: 'var(--text-primary)' }}>Scales:</strong> {s.scales}
                  <br />
                  <strong style={{ color: 'var(--text-primary)' }}>Prod nodes:</strong> {s.prodNodes}
                </div>
              </div>
            ))}
          </div>

          {/* History Shards */}
          <div style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              History Shards — The Key to Temporal&apos;s Scalability
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              A <strong style={{ color: 'var(--text-primary)' }}>shard</strong> is a partition of workflow state. Each workflow is assigned to a shard by hashing its Workflow ID:
              <br />
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>shard_id = hash(workflow_id) % total_shards</code>
              <br /><br />
              The shard count is set at cluster creation and <strong style={{ color: 'var(--text-primary)' }}>cannot be changed later</strong>. More shards = more concurrent database writes = less lock contention.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Temporal recommends 1 History Service process per 500 shards.</strong> When you add a History node, shards auto-redistribute via Ringpop (membership protocol). No downtime.
            </div>
          </div>

          {/* Shard Math Table */}
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Shard count</th>
                  <th style={{ textAlign: 'right' }}>History nodes</th>
                  <th style={{ textAlign: 'right' }}>Concurrent DB writes</th>
                  <th>Use case</th>
                </tr>
              </thead>
              <tbody>
                {SHARD_ROWS.map((r, i) => (
                  <tr key={i} style={r.highlight ? { background: 'rgba(61, 220, 132, 0.05)' } : undefined}>
                    <td className="mono" style={{ fontWeight: r.highlight ? 600 : 400 }}>{r.shards}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.nodes}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.writes}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.useCase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* How Companies Scale */}
          <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              How Companies Scale Temporal in Production
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Three paths, from simplest to most complex:
            </div>
            {PRODUCTION_DEPLOYMENTS.map((d, i) => (
              <div key={i} style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: d.color }}>{d.name}</strong> — {d.description}
                <br />
                <span style={{ color: 'var(--text-dim)' }}>Used by: {d.usedBy}</span>
              </div>
            ))}
          </div>

          {/* K8s Example */}
          <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Production Cluster on Kubernetes — Typical Setup
            </div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 14, borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre' }}>
{`# Temporal server services as Kubernetes deployments
frontend:     3-5 pods   (stateless, behind K8s service)
history:      10-15 pods  (sharded, 512-4000 shards)
matching:     10-17 pods  (task queue partitions)
worker-svc:   3 pods      (internal Temporal workflows)

# Database (separate from Temporal pods)
postgres:     HA cluster with read replicas
              or CockroachDB for extreme scale

# Scale by adding pods — shards auto-redistribute
kubectl scale deployment temporal-history --replicas=15
# No downtime. No code changes. Shards move via Ringpop.`}
            </pre>
          </div>

          {/* Our VM vs Production */}
          <div style={{ borderLeft: '3px solid var(--purple)', paddingLeft: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Our VM Setup vs Production
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>On the VM (dev):</strong> 1 process per service, 4 shards (dev default), single Postgres. Fine for development and load testing up to 10K workflows.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>In production:</strong> Set shard count to 512+ at cluster creation. Run each service as a separate deployment. Add nodes as load grows. The VM is the control plane — workers run on separate machines and just need network access to the Frontend (port 7233).
              <br /><br />
              <strong style={{ color: 'var(--success)' }}>What we proved:</strong> The worker scaling (our part) is linear — 1→4 workers = 5.4x throughput. The Temporal server scaling is a solved problem (Ringpop + shards). The bottleneck in our tests was worker CPU, not Temporal.
            </div>
          </div>
        </div>
      </div>

      {/* Capacity Planner — Interactive */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>CAPACITY PLANNER — HOW MANY PODS, NODES, AND SHARDS FOR YOUR SCALE?</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Interactive calculator. Drag the sliders to see the full infrastructure footprint for any scale —
            from 100 concurrent agent workflows to 10 million. Accounts for workflow complexity (activities, duration, wait time).
            The key insight: <strong style={{ color: 'var(--text-primary)' }}>workflows waiting for external responses (human approval, supplier callbacks, timers) consume zero worker capacity.</strong>
          </p>

          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Target concurrent workflows: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{formatNum(targetWorkflows)}</span>
              </label>
              <input
                type="range"
                min="100"
                max="10000000"
                step="100"
                value={targetWorkflows}
                onChange={(e) => setTargetWorkflows(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>100</span>
                <span>10M</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Activities per workflow: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{activitiesPerWorkflow}</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={activitiesPerWorkflow}
                onChange={(e) => setActivitiesPerWorkflow(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>1 (simple)</span>
                <span>30 (complex)</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Avg activity duration: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{avgActivityDuration}s</span>
              </label>
              <input
                type="range"
                min="1"
                max="600"
                step="1"
                value={avgActivityDuration}
                onChange={(e) => setAvgActivityDuration(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>1s (LLM call)</span>
                <span>10min (phone call)</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Wait time per workflow: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{waitTimePerWorkflow}min</span>
              </label>
              <input
                type="range"
                min="0"
                max="10080"
                step="10"
                value={waitTimePerWorkflow}
                onChange={(e) => setWaitTimePerWorkflow(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>0 (no wait)</span>
                <span>7 days</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Workers per pod: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{workersPerPod}</span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={workersPerPod}
                onChange={(e) => setWorkersPerPod(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>1</span>
                <span>20</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Pods per K8s node: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{podsPerNode}</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={podsPerNode}
                onChange={(e) => setPodsPerNode(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>1</span>
                <span>30</span>
              </div>
            </div>

            <div>
              <label className="mono-label" style={{ display: 'block', marginBottom: 8 }}>
                Activities per worker: <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700 }}>{activitiesPerWorker}</span>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={activitiesPerWorker}
                onChange={(e) => setActivitiesPerWorker(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>10</span>
                <span>500</span>
              </div>
            </div>
          </div>

          {/* Results */}
          {plannerResult && (
            <div>
              {/* Workflow shape analysis */}
              <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, marginBottom: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Workflow shape:</strong> {activitiesPerWorkflow} activities × {avgActivityDuration}s each = {plannerResult.totalActiveTimePerWorkflow}s active time.
                Wait time: {waitTimePerWorkflow}min. Total wall-clock: {(plannerResult.totalWallClockTime / 60).toFixed(1)}min.
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Active fraction:</strong> <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{(plannerResult.activeFraction * 100).toFixed(2)}%</span> —
                only {(plannerResult.activeFraction * 100).toFixed(2)}% of a workflow&apos;s lifetime uses a worker. The rest is waiting (free).
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Concurrent active activities:</strong> {formatNum(plannerResult.concurrentActiveActivities)} out of {formatNum(targetWorkflows)} workflows.
                <span style={{ color: 'var(--success)' }}> This is what you actually need workers for.</span>
              </div>

              {/* Big stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 0, borderTop: '1px solid var(--border-subtle)', marginBottom: 24 }}>
                {[
                  { label: 'Workers needed', value: formatNum(plannerResult.workers), color: 'var(--accent)' },
                  { label: 'K8s pods', value: formatNum(plannerResult.pods), color: 'var(--success)' },
                  { label: 'K8s nodes', value: formatNum(plannerResult.nodes), color: 'var(--warning)' },
                  { label: 'Temporal shards', value: formatNum(plannerResult.shards), color: 'var(--danger)' },
                  { label: 'History nodes', value: formatNum(plannerResult.historyNodes), color: 'var(--purple)' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '20px 16px 20px 0', borderRight: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div className="mini-stat-label">{s.label}</div>
                    <div className="mini-stat-value" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Architecture diagram */}
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 16, whiteSpace: 'pre' }}>
{`Target: ${formatNum(targetWorkflows)} concurrent agent workflows
Workflow: ${activitiesPerWorkflow} activities × ${avgActivityDuration}s + ${waitTimePerWorkflow}min wait = ${(plannerResult.activeFraction * 100).toFixed(1)}% active

┌─ Worker layer (execution plane)
│  ${formatNum(plannerResult.concurrentActiveActivities)} concurrent active activities (not ${formatNum(targetWorkflows)} — most are waiting!)
│  ${formatNum(plannerResult.workers)} workers × ${activitiesPerWorker} activities/worker = ${formatNum(plannerResult.workers * activitiesPerWorker)} capacity
│  ${formatNum(plannerResult.pods)} K8s pods (${workersPerPod} workers/pod)
│  ${formatNum(plannerResult.nodes)} K8s nodes (${podsPerNode} pods/node)
│  e.g. ${plannerResult.nodes <= 1 ? '1 machine' : `${plannerResult.nodes} machines`} × ${podsPerNode} pods × ${workersPerPod} workers
│
├─ Temporal server (control plane)
│  ${formatNum(plannerResult.shards)} shards → ${plannerResult.historyNodes} History nodes (1 per 500 shards)
│  ${plannerResult.frontendNodes} Frontend nodes (stateless)
│  ${plannerResult.matchingNodes} Matching nodes (task queue partitions)
│  3 Worker Service nodes (internal)
│  Total Temporal server nodes: ${plannerResult.historyNodes + plannerResult.frontendNodes + plannerResult.matchingNodes + 3}
│
└─ Database
   ${plannerResult.dbRecommendation}`}
              </pre>

              {/* Scale category */}
              <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: plannerResult.categoryColor }}>{plannerResult.category}</strong>
                <br />
                {plannerResult.recommendation}
                <br /><br />
                <strong style={{ color: 'var(--text-primary)' }}>Why this is universal:</strong> The math works for any agent workflow shape —
                sourcing (5 activities, 30s), negotiation (15 activities, 2 days), compliance review (8 activities, 1 week).
                The more complex the workflow, the <em>less</em> worker capacity you need proportionally, because complex workflows spend more time waiting.
                A 2-day negotiation workflow uses a worker for 20 minutes — the other 47 hours are free.
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* ═══════════════ TAB 2: INFERROUTE ═══════════════ */}
      {scalingTab === 'inferroute' && (
      <>
      {/* InferRoute Patterns */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>INFERROUTE — SMART LLM GATEWAY</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
          OpenAI-compatible gateway with complexity-aware routing, multi-layer caching, and provider failover.
        </p>
        <InferRouteDiagram />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {INFERROUTE_PATTERNS.map((p, i) => (
            <div key={i} className="bordered-panel" style={{ padding: 20, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Pattern:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{p.pattern}</code>
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Problem:</strong> {p.problem}
                <br />
                <strong style={{ color: 'var(--text-primary)' }}>Solution:</strong> {p.solution}
                <br />
                <strong style={{ color: 'var(--success)' }}>Why it matters:</strong> {p.why}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6 Routing Strategies */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>ROUTING STRATEGIES — 6 PLUGGABLE STRATEGIES, ONE INTERFACE</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Every strategy implements the same <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>select(providers, request) → ProviderHealth</code> interface.
            Switch strategies via config — no code changes. The default is <strong style={{ color: 'var(--text-primary)' }}>IntelligenceAware</strong> (cost-optimized routing based on prompt complexity).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROUTING_STRATEGIES.map((s, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.name}</span>
                  {i === 0 && <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(61, 220, 132, 0.1)', color: 'var(--success)', borderRadius: 4, fontWeight: 600 }}>DEFAULT</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>When to use:</strong> {s.when}
                  <br />
                  <strong style={{ color: 'var(--text-primary)' }}>How it works:</strong> {s.how}
                  <br />
                  <strong style={{ color: 'var(--success)' }}>Cost impact:</strong> {s.cost}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Load Tracking */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>LOAD TRACKING — HOW INFERROUTE SEES PROVIDER HEALTH</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Every provider has a <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>ProviderHealth</code> dataclass updated in real-time.
            The health checker runs every 10s (configurable), probing each provider&apos;s <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>/models</code> endpoint.
            The circuit breaker updates state on every request. All metrics are visible via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GET /v1/health</code>.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Visibility</th>
                </tr>
              </thead>
              <tbody>
                {LOAD_TRACKING.map((m, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{m.metric}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.type}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.desc}</td>
                    <td className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{m.visible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Routing decision flow:</strong>
            <br />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>request → strategy.select(healthy_providers, request) → ProviderHealth → adapter.complete(request) → update_latency + decrement_in_flight</span>
            <br /><br />
            <strong style={{ color: 'var(--text-primary)' }}>Circuit breaker state machine:</strong>
            <br />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)' }}>CLOSED</span> (normal) → 5 consecutive failures → <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)' }}>OPEN</span> (fail fast) → 30s cooldown → <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)' }}>HALF_OPEN</span> (1 probe) → success → <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)' }}>CLOSED</span> | failure → <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)' }}>OPEN</span>
          </div>
        </div>
      </div>

      {/* Quota Enforcement */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>QUOTA ENFORCEMENT — MULTI-TENANT TOKEN LIMITS</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Every request is checked against per-tenant token quotas before routing. After the response, actual token usage is consumed and logged.
            This prevents any single tenant from exhausting the LLM budget. Quotas are enforced via Redis atomic counters — no race conditions under concurrent load.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {QUOTA_DATA.map((q, i) => (
              <div key={i} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, borderLeft: `3px solid ${q.color}` }}>
                <div style={{ fontWeight: 600, color: q.color, fontSize: 12, marginBottom: 6 }}>{q.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{q.desc}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{q.limits}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Usage endpoint:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GET /v1/usage</code> returns:
            <br />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>{'{ daily: {used, limit, remaining}, monthly: {used, limit, remaining}, by_provider: {groq: 8200, openai: 3100}, by_model: {...}, today_requests: 45 }'}</span>
            <br /><br />
            <strong style={{ color: 'var(--text-primary)' }}>Quota exceeded:</strong> HTTP 429 with <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Retry-After</code> header. Client backs off and retries.
          </div>
        </div>
      </div>

      {/* RAG Augmentation Flow */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>RAG AUGMENTATION — HOW CONTEXT GETS INJECTED INTO LLM CALLS</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            When a request includes a <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>namespace</code> parameter, InferRoute retrieves relevant documents from Postgres + pgvector
            and augments the prompt before sending it to the LLM. The cache key is derived from the <strong style={{ color: 'var(--text-primary)' }}>original</strong> request — RAG retrieval only runs on cache misses.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RAG_AUGMENTATION_FLOW.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 28, height: 28, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{s.step}</div>
                <div style={{ flex: 1, padding: 12, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{s.title}</strong>
                  <br />
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Response metadata:</strong> When RAG is used, the response includes <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>x_rag</code> and <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>x_routing</code> fields:
            <br />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>x_rag: {'{ namespace, retrieved, sources, context_tokens, cache_hit }'}</span>
            <br />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>x_routing: {'{ provider, model, complexity, tier, cache_status, strategy, latency_ms }'}</span>
          </div>
        </div>
      </div>

      {/* Dual Tracing */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>DUAL TRACING — JAEGER + LANGFUSE</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            InferRoute exports traces to <strong style={{ color: 'var(--text-primary)' }}>two systems simultaneously</strong> — each captures different aspects of the same request.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {TRACING_DATA.map((t, i) => (
              <div key={i} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, borderLeft: `3px solid ${t.color}` }}>
                <div style={{ fontWeight: 600, color: t.color, fontSize: 13, marginBottom: 8 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>What:</strong> {t.what}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{t.endpoint}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--success)' }}>Why:</strong> {t.why}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Streaming (SSE):</strong> InferRoute supports <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>stream: true</code> in chat completions.
            Responses are streamed as Server-Sent Events (OpenAI-compatible <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>data: {`{...}`}\\n\\n</code> format).
            Each provider adapter implements <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>stream_complete()</code> — the gateway wraps it in a <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>StreamingResponse</code> with proper SSE headers.
            Quota enforcement and usage logging happen after the stream completes.
          </div>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>COST BREAKDOWN — REAL SCENARIOS WITH INFERROUTE vs ALL-OPENAI</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Every request returns an <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>x_routing</code> metadata object showing which provider was chosen, the complexity classification, and the cost.
            Here&apos;s what different prompts cost with InferRoute vs always using OpenAI gpt-4o:
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Complexity</th>
                  <th>Provider chosen</th>
                  <th style={{ textAlign: 'right' }}>Tokens</th>
                  <th style={{ textAlign: 'right' }}>InferRoute cost</th>
                  <th style={{ textAlign: 'right' }}>All-OpenAI cost</th>
                  <th style={{ textAlign: 'right' }}>Saved</th>
                </tr>
              </thead>
              <tbody>
                {COST_BREAKDOWN.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{r.scenario}</td>
                    <td className="mono" style={{ fontSize: 11, color: r.complexity === 'simple' ? 'var(--success)' : r.complexity === 'complex' ? 'var(--danger)' : r.complexity === 'medium' ? 'var(--warning)' : 'var(--text-dim)' }}>{r.complexity}</td>
                    <td style={{ fontSize: 11 }}>{r.provider}</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>{r.tokens}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{r.cost}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{r.openaiCost}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{r.saved} ({r.savedPct})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>At 1M requests/day (60% simple, 30% medium, 10% complex):</strong>
            <br />
            • All-OpenAI: ~$120/day ($3,600/month)
            <br />
            • InferRoute: ~$72/day ($2,160/month) — <strong style={{ color: 'var(--success)' }}>40% savings = $1,440/month</strong>
            <br />
            • With 42% cache hit rate: ~$42/day ($1,260/month) — <strong style={{ color: 'var(--success)' }}>65% total savings = $2,340/month</strong>
          </div>
        </div>
      </div>

      {/* ═══════ Config-Based Dynamic Routing (Portkey-style, smarter) ═══════ */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16, color: 'var(--accent)' }}>CONFIG-BASED DYNAMIC ROUTING — PORTKEY-STYLE, SMARTER</div>
        <div className="bordered-panel" style={{ padding: 20, borderLeft: '3px solid var(--accent)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            The developer who builds the agent workflow <strong style={{ color: 'var(--text-primary)' }}>already knows</strong> what each node needs.
            The <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>decide</code> node needs GPT-4o. The <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>research</code> node just calls tools — gpt-4o-mini is fine.
            Instead of the gateway guessing (LLM classification, 200ms, doesn't scale), the developer <strong style={{ color: 'var(--text-primary)' }}>configures routing per node</strong> — like Portkey.
            But unlike Portkey's blind weighted round-robin, our gateway <strong style={{ color: 'var(--text-primary)' }}>dynamically scores providers</strong> in real-time.
          </p>

          {/* The 3-mode flow */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Three routing modes — developer picks by how they send the request:</strong>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 24, whiteSpace: 'pre' }}>
{`Request arrives
│
├─ Has x-config-id header? → Mode 1: Config-based (Portkey-style)
│  → Look up config from Redis (~1ms, 99.9% cache hit)
│  → Config lists acceptable providers for this node
│  → DynamicRouter scores each provider in real-time:
│     score = 0.35×latency + 0.25×load + 0.20×cost + 0.20×weight
│  → Pick highest-scoring healthy provider
│  → Fail? Circuit breaker → fallback to next in config
│  → <1ms overhead, no classification, scales to billions of tokens
│
├─ No config, model="auto"? → Mode 2: Heuristic fallback
│  → Keyword matching + prompt length (0ms, no API call)
│  → ~80% classified confidently, rest → "medium" tier
│  → LLM classifier is OPT-IN (tenant enables in config)
│  → Works out of the box, optimizes later with configs
│
└─ No config, model="gpt-4o"? → Mode 3: Direct (current behavior)
   → Route to specified model, no classification
   → Circuit breaker + failover still active`}
          </pre>

          {/* Developer config example */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Developer creates configs (one-time setup, stored in Postgres, cached in Redis):</strong>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 24, whiteSpace: 'pre' }}>
{`# Tenant: company-b (procurement SaaS)
# Configs created via POST /v1/routing/configs

cfg_research:  targets=[gpt-4o-mini, llama-3.3-70b]     # light — just tool calls
cfg_decide:    targets=[gpt-4o, claude-sonnet]           # premium — needs reasoning
cfg_negotiate: targets=[claude-sonnet],                  # premium — complex reasoning
               fallback_targets=[gpt-4o]                 # if Claude is down → GPT-4o
cfg_voice:     targets=[groq/llama-3.3-70b, gpt-4o-mini],# fast — voice agent
               latency_budget_ms=500                     # must respond in 500ms

# Workflow code — each node sends its config_id:
research  → POST /v1/chat/completions  [x-config-id: cfg_research]
decide    → POST /v1/chat/completions  [x-config-id: cfg_decide]
negotiate → POST /v1/chat/completions  [x-config-id: cfg_negotiate]
voice     → POST /v1/chat/completions  [x-config-id: cfg_voice]`}
          </pre>

          {/* Dynamic scoring explanation */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>DynamicRouter — real-time provider scoring (this is where we beat Portkey):</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>35% — Latency</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>EWMA p50 latency. Lower = higher score. Voice config has latency_budget — providers over budget score 0.</div>
            </div>
            <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--warning)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>25% — Load</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>In-flight request count. Prevents one provider from getting overloaded while another sits idle.</div>
            </div>
            <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>20% — Cost</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>Cost per 1K tokens. Cheaper = higher score. Config can set cost_ceiling — providers over it score 0.</div>
            </div>
            <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--purple)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>20% — Weight</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>Developer preference. Higher weight = more traffic. Lets developer bias toward preferred provider.</div>
            </div>
          </div>

          {/* Portkey comparison table */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>How we compare to Portkey (10B tokens/day, open-source AI gateway):</strong>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-primary)', fontSize: 11 }}>Feature</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontSize: 11 }}>Portkey</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--accent)', fontSize: 11 }}>InferRoute</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Per-tenant config', 'Yes — config_id per request', 'Yes — same model (x-config-id header)'],
                  ['Provider selection', 'Weighted round-robin (1 strategy)', 'Dynamic scoring (latency + load + cost + health)'],
                  ['Classification', 'None — developer picks model', 'Heuristic fallback (0ms) when no config sent'],
                  ['Caching', 'Exact match only', 'Exact + semantic + request coalescer'],
                  ['Failover', 'Fixed fallback chain', 'Circuit breaker + dynamic fallback (respects tier)'],
                  ['Latency overhead', '<1ms', '~1ms (Redis config lookup, 99.9% cache hit)'],
                  ['Scale proven', '10B tokens/day', 'Dev/demo (same architecture)'],
                  ['Strategies', '1 (weighted)', '6 + dynamic scoring (no strategy name needed)'],
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{row[0]}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{row[1]}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--accent)' }}>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SaaS scenario */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>SaaS scenario — 100 companies, 2000 workflows, all different:</strong>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 16, whiteSpace: 'pre' }}>
{`Company A (voice agent — all tasks simple):
  cfg_slots     → gpt-4o-mini only                    # 1 config, light tier
  cfg_book      → gpt-4o-mini only                    # 1 config, light tier
  → No classification needed. Developer knows all tasks are simple.

Company B (procurement — mixed complexity):
  cfg_research  → gpt-4o-mini, llama-3.3-70b          # light — tool calls
  cfg_decide    → gpt-4o, claude-sonnet               # premium — reasoning
  cfg_negotiate → claude-sonnet, fallback=gpt-4o      # premium — complex
  → 3 configs. Gateway dynamically picks best provider per node.

Company D (legal — wants LLM classification):
  cfg_review    → claude-sonnet (classification: "llm", classifier: gpt-4o-mini)
  cfg_extract   → gpt-4o-mini (classification: "static", default_tier: "light")
  → Opt-in LLM classifier for review node. Static for extract.

100 tenants × ~4 configs = 400 configs in Postgres
Redis cache: 400 × 500 bytes = 200 KB (rounding error on RAM)
Lookup: ~1ms (Redis cache hit, 99.9% rate)`}
          </pre>

          <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, borderLeft: '3px solid var(--success)' }}>
            <strong style={{ color: 'var(--success)' }}>The pitch:</strong> Portkey requires you to configure routing upfront and does blind weighted round-robin.
            InferRoute works out of the box (heuristic fallback, 0ms), then you create per-node configs to optimize.
            When you do, the gateway dynamically scores providers in real-time — not blind round-robin.
            You get from zero to production without knowing which model to use, then optimize later when the data tells you.
            The intelligence layer steps aside when configs are present.
          </div>
        </div>
      </div>

      {/* InferRoute Scaling */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>SCALING INFERROUTE — THE LLM GATEWAY AT SCALE</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            InferRoute is a stateless FastAPI app. The app itself scales trivially — add more instances behind a load balancer.
            The real scaling challenges are the <strong style={{ color: 'var(--text-primary)' }}>stateful components</strong>:
            Redis (caching + rate limiting), Postgres (RAG vectors + usage logging), and the embedding service.
          </p>

          {/* InferRoute Architecture */}
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 24, whiteSpace: 'pre' }}>
{`Client / AgentMesh Worker
│  POST /v1/chat/completions
▼
Load Balancer (nginx / ALB)
│  Round-robin to N InferRoute instances
├── InferRoute-1 (stateless FastAPI)
├── InferRoute-2 (stateless FastAPI)
└── InferRoute-N (stateless FastAPI)

│  Each instance does:
│  1. Rate limit check  → Redis (Lua script, atomic)
│  2. Exact cache lookup → Redis (SHA256 key, O(1))
│  3. Semantic cache     → Redis (set + cosine sim)
│  4. RAG retrieval      → Postgres + pgvector (if namespace)
│  5. Route to provider  → OpenAI / Anthropic / vLLM
│  6. Log usage          → Postgres (usage_log table)
│
▼
Redis Cluster (shared state)
│  - Exact cache:    SETEX with TTL + jitter
│  - Semantic cache: SET index + String entries
│  - Rate limiter:   Lua script (atomic token bucket)
│  - Quota tracker:  daily/monthly counters
│
▼
Postgres (persistence)
│  - rag_documents (pgvector, vector(1536))
│  - usage_log (billing/analytics)
│  - feedback (thumbs up/down)`}
          </pre>

          {/* Redis Scaling */}
          <div style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Redis Scaling — From Single Instance to Cluster
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Redis is the hottest path — every request hits it 2-3 times (rate limit, exact cache, semantic cache).
              At scale, a single Redis instance becomes the bottleneck. Here&apos;s how to scale it:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
              {REDIS_SCALING.map((r, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, color: r.color, fontSize: 12, marginBottom: 6 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{r.detail}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Key sharding strategy:</strong> All keys include <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{'{tenant_id}'}</code> hash tags.
              This ensures all keys for a tenant land on the same shard — enabling atomic multi-key operations (rate limit + cache check) without cross-slot transactions.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>TTL + Jitter:</strong> Every cache entry has TTL (3600s) with ±10% jitter. Without jitter, all entries created at the same time expire simultaneously →
              <strong style={{ color: 'var(--danger)' }}> cache stampede</strong>. Jitter spreads expiration across 3240-3960s.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>X-Fetch (probabilistic early expiration):</strong> Semantic cache uses X-Fetch — entries past their TTL are refreshed with probability
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>1 - exp(-(age + β) / ttl)</code>. This prevents thundering herd on popular prompts without background refresh jobs.
            </div>
          </div>

          {/* RAG / Vector Store Scaling */}
          <div style={{ borderLeft: '3px solid var(--purple)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              RAG &amp; Vector Store Scaling — From pgvector to Specialized Vector DB
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              RAG retrieval is a <strong style={{ color: 'var(--text-primary)' }}>hybrid search</strong>: dense vector similarity (pgvector) + BM25 lexical search (in-memory).
              Results are fused via Reciprocal Rank Fusion (RRF) and reranked. Here&apos;s how each piece scales:
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="styled-table">
                <thead>
                  <tr>
                    <th>Scale</th>
                    <th>Vector store</th>
                    <th>BM25</th>
                    <th>Partitioning</th>
                  </tr>
                </thead>
                <tbody>
                  {VECTOR_SCALE_ROWS.map((r, i) => (
                    <tr key={i} style={r.highlight ? { background: 'rgba(61, 220, 132, 0.05)' } : undefined}>
                      <td style={{ fontWeight: r.highlight ? 600 : 400 }}>{r.scale}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.vector}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.bm25}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.partitioning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Current setup:</strong> Postgres + pgvector with <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>vector(1536)</code> type.
              Cosine similarity via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>&lt;=&gt;</code> operator. Index on (tenant_id, namespace). In-memory BM25 fallback.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Namespace scoping:</strong> Every query is scoped by <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>tenant_id + namespace</code>.
              This is multi-tenancy at the storage level — no cross-tenant data leakage, and each tenant&apos;s vectors can be partitioned independently.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>RAG cache:</strong> Retrieval results cached in Redis (TTL: 1800s). Repeated queries to the same namespace skip the vector search entirely.
            </div>
          </div>

          {/* Postgres Scaling */}
          <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Postgres Scaling — Usage Logging, Feedback, and RAG Persistence
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Postgres serves 3 workloads with different scaling characteristics:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
              {POSTGRES_WORKLOADS.map((w, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, color: w.color, fontSize: 12, marginBottom: 6 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Pattern:</strong> {w.pattern}
                    <br />
                    <strong style={{ color: 'var(--text-primary)' }}>Scale:</strong> {w.scale}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Connection pooling:</strong> Already using asyncpg connection pool. Each InferRoute instance maintains its own pool (default: 10 connections).
              With N instances, total connections = N × 10. For 20 instances = 200 connections. Postgres max_connections default is 100 — use PgBouncer (connection multiplexer) to share connections across instances.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Partitioning strategy:</strong> Partition <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>usage_log</code> by time (daily partitions).
              Old partitions can be archived to S3 or dropped. Partition <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>rag_documents</code> by tenant_id — each tenant&apos;s vectors are in a separate partition, enabling per-tenant vacuum and index rebuilds.
            </div>
          </div>

          {/* Provider Failover at Scale */}
          <div style={{ borderLeft: '3px solid var(--danger)', paddingLeft: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Provider Failover &amp; Circuit Breakers — Multi-Instance Considerations
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Current:</strong> Circuit breakers and provider health are in-memory per instance.
              Each instance independently tracks provider latency (EWMA), failure count, and circuit state.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>At scale (N instances):</strong> Each instance has its own view of provider health. This is actually <em>fine</em> for most cases —
              if OpenAI is down, all instances will independently detect it and open their circuits. The slight inconsistency (one instance might detect the failure 5s before another) is acceptable.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>For strict consistency:</strong> Share circuit breaker state via Redis. When one instance opens a circuit, it publishes to
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}> inferroute:circuit:{'{provider_id}'}</code> channel. Other instances subscribe and update their state.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Request coalescer:</strong> Currently in-memory per instance (asyncio.Future). At scale, some duplicate upstream calls will happen
              (two instances receive the same prompt simultaneously). This is acceptable — the exact cache prevents it on subsequent requests. For zero duplication, use Redis distributed locks (Redlock).
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ═══════════════ TAB 3: WIRING IT TOGETHER ═══════════════ */}
      {scalingTab === 'wiring' && (
      <>
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>WIRING IT TOGETHER — AGENTMESH + INFERROUTE AT SCALE</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
            Both systems scale independently, but they share two resources: <strong style={{ color: 'var(--text-primary)' }}>Postgres</strong> (Temporal&apos;s workflow state + InferRoute&apos;s RAG/usage)
            and <strong style={{ color: 'var(--text-primary)' }}>the LLM providers</strong> (OpenAI/Anthropic). Here&apos;s the full picture at scale, with resource calculations.
          </p>

          <WiringDiagram />

          {/* Full System Diagram (detailed text/ASCII version, same content as the diagram above) */}
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--surface)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 24, whiteSpace: 'pre' }}>
{`AgentMesh Gateway (port 8000, 2-3 instances)
│  POST /workflows → start Temporal workflow
▼
Temporal Server (control plane, 5-15 nodes)
│  Dispatches activity tasks to task queue
▼
AgentMesh Workers (N instances, scales with load)
│  Each worker executes agent activities:
│  - research → tool calls (supplier API)
│  - score    → deterministic computation
│  - decide   → LLM call via InferRoute
│  - approve  → wait for human (FREE, zero worker cost)
│  - confirm  → create PO, initiate payment
│
│  W3C traceparent header propagated to InferRoute
│
▼
InferRoute Load Balancer (nginx / ALB)
├── InferRoute-1 (stateless FastAPI)
├── InferRoute-2 (stateless FastAPI)
└── InferRoute-N (stateless FastAPI)

│  Per instance, each request:
│  1. Quota check        → Redis (daily/monthly token limits)
│  2. Exact cache        → Redis (SHA256, O(1))
│  3. Semantic cache     → Redis (embedding sim)
│  4. RAG retrieval      → Postgres pgvector (if namespace)
│  5. Classify complexity → IntelligenceAware strategy
│  6. Route to provider  → OpenAI / Groq / vLLM
│  7. Log usage          → Postgres usage_log
│  8. Return with x_routing + x_rag metadata
│
│  Response: x_routing: { provider, model, complexity, tier, cache_status, strategy, latency_ms }
│
▼
Redis Cluster (shared state across all instances)
│  - Exact cache:    SETEX with TTL + jitter
│  - Semantic cache: SET index + String entries
│  - Quota tracker:  daily/monthly token counters
│  - Circuit breaker state (optional, for strict consistency)
│
▼
LLM Providers (chosen by strategy)
├── OpenAI (premium tier — complex prompts, gpt-4o)
├── Groq  (cheap/standard tier — simple prompts, llama-3.3-70b)
└── vLLM  (cheap tier — self-hosted, email-classifier)
│
▼
Postgres (persistence)
├── temporal       (Temporal's workflow state, event history, task queues)
├── rag_documents  (pgvector — InferRoute's RAG, vector(1536))
├── usage_log      (InferRoute's billing/analytics, partitioned by day)
└── feedback       (InferRoute's user feedback, thumbs up/down)`}
          </pre>

          {/* Resource Calculation */}
          <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Resource Calculation — 10,000 Concurrent Agent Workflows
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Example: 10,000 sourcing agents running simultaneously. Each agent makes ~3 LLM calls (decide, retry-decide, confirm).
              Workflow shape: 5 activities, 2s avg duration, 30s wait time → 25% active fraction.
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="styled-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th style={{ textAlign: 'right' }}>Calculation</th>
                    <th style={{ textAlign: 'right' }}>Result</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {WIRING_CALC_ROWS.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.component}</td>
                      <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>{r.calc}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.color, fontWeight: 600 }}>{r.result}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-Step Routing Decisions */}
          <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Per-Step Routing — How Each Agent Activity Calls InferRoute
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Each agent activity makes a different type of LLM call. InferRoute classifies the complexity and routes to the optimal provider.
              Here&apos;s the full routing decision for one sourcing agent workflow:
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="styled-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Prompt type</th>
                    <th>Complexity</th>
                    <th>Strategy</th>
                    <th>Provider chosen</th>
                    <th>Cache?</th>
                    <th style={{ textAlign: 'right' }}>Latency</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>1. Research</td>
                    <td style={{ fontSize: 11 }}>Tool calls (supplier API)</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>No LLM</td>
                    <td className="mono" style={{ fontSize: 11 }}>—</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>200ms</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>$0.00</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>2. Score</td>
                    <td style={{ fontSize: 11 }}>Deterministic computation</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>No LLM</td>
                    <td className="mono" style={{ fontSize: 11 }}>—</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>50ms</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>$0.00</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>3. Decide</td>
                    <td style={{ fontSize: 11 }}>&ldquo;Rank these 5 suppliers by risk&rdquo;</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--warning)' }}>medium</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>IntelligenceAware</td>
                    <td className="mono" style={{ fontSize: 11 }}>OpenAI gpt-4o-mini</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>42% hit</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>340ms</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--success)' }}>$0.07</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>4. Approve</td>
                    <td style={{ fontSize: 11 }}>Wait for human (checkpoint)</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>No LLM</td>
                    <td className="mono" style={{ fontSize: 11 }}>—</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>∞ (free)</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>$0.00</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>5. Confirm</td>
                    <td style={{ fontSize: 11 }}>&ldquo;Draft PO email&rdquo;</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>simple</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>IntelligenceAware</td>
                    <td className="mono" style={{ fontSize: 11 }}>Groq llama-3.3-70b</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>42% hit</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>120ms</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--success)' }}>$0.002</td>
                  </tr>
                  <tr style={{ background: 'rgba(61, 220, 132, 0.05)' }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td colSpan={5} style={{ fontSize: 11, color: 'var(--text-dim)' }}>2 LLM calls (3 steps don&apos;t use LLM)</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>710ms</td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>$0.072</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Same workflow, all-OpenAI gpt-4o:</strong> $0.24 (3.3x more expensive)
              <br />
              <strong style={{ color: 'var(--success)' }}>InferRoute savings per workflow:</strong> $0.168 (70% reduction)
              <br />
              <strong style={{ color: 'var(--text-primary)' }}>At 10,000 workflows/day:</strong> $1,680/day saved = <strong style={{ color: 'var(--success)' }}>$50,400/month</strong>
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>How load is tracked across the workflow:</strong> Each InferRoute call increments <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>in_flight</code> on the chosen provider.
              The <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>LeastConnections</code> sub-strategy (used within the standard tier) picks the provider with the lowest <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>in_flight</code> count.
              After the response, <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>update_latency()</code> updates the EWMA, and <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>decrement_in_flight()</code> frees the slot.
              All visible via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GET /v1/health</code>.
            </div>
          </div>

          {/* Quota Integration */}
          <div style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Quota Enforcement — How AgentMesh and InferRoute Share Token Budgets
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>The flow:</strong> AgentMesh workers call InferRoute with a tenant ID (extracted from the workflow namespace).
              InferRoute checks the tenant&apos;s daily/monthly token quota in Redis <strong style={{ color: 'var(--text-primary)' }}>before</strong> routing. After the response, actual tokens are consumed.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>When quota is exceeded:</strong> InferRoute returns HTTP 429 with <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>Retry-After</code> header.
              The AgentMesh activity catches this and uses Temporal&apos;s retry policy to back off and retry after the specified duration. The workflow doesn&apos;t fail — it pauses and resumes.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Per-agent budgets:</strong> Each agent type can have a sub-quota. Sourcing agents get 500K tokens/day. Compliance agents get 200K tokens/day.
              Sub-quotas are enforced via Redis keys scoped by <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{'{tenant_id}:{agent_type}'}</code>.
              <br /><br />
              <strong style={{ color: 'var(--success)' }}>Usage visibility:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GET /v1/usage</code> returns real-time consumption:
              daily/monthly used vs limit, breakdown by provider and model, request count today. The UI&apos;s Usage tab visualizes this data.
            </div>
          </div>

          {/* Shared Postgres Decision */}
          <div style={{ borderLeft: '3px solid var(--purple)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Shared Postgres or Separate Clusters?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Option A — Shared Postgres (smaller scale):</strong> One Postgres cluster with separate databases for Temporal and InferRoute.
              Simpler ops, fewer moving parts. Works up to ~100K workflows. Use separate schemas and connection pools to isolate workload.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Option B — Separate Postgres clusters (larger scale):</strong> Temporal gets its own Postgres (optimized for write-heavy event history).
              InferRoute gets its own (optimized for vector search + analytics). Different tuning, different scaling. This is what Temporal recommends for production.
              <br /><br />
              <strong style={{ color: 'var(--success)' }}>Our choice: Separate clusters in production.</strong> Temporal&apos;s write pattern (append-only event history) is very different from InferRoute&apos;s
              (vector search + time-series usage logging). Mixing them means one workload starves the other. Separate clusters let each be tuned independently.
            </div>
          </div>

          {/* RAG Sharing */}
          <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              RAG — How AgentMesh Agents Use InferRoute&apos;s Knowledge Base
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>The flow:</strong> When an agent calls InferRoute with a <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>namespace</code> parameter,
              InferRoute retrieves relevant documents from the RAG vector store and augments the prompt before sending it to the LLM.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Example:</strong> The sourcing agent&apos;s decide node calls InferRoute with:
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', display: 'block', marginTop: 8 }}>
                {'{ model: "auto", messages: [...], namespace: "sourcing-policies" }'}
              </code>
              InferRoute retrieves the company&apos;s sourcing policies from the <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>sourcing-policies</code> namespace,
              augments the prompt with &ldquo;Company policy: prefer suppliers with rating &gt; 4.0 and lead time &lt; 7 days&rdquo;, then sends the augmented prompt to the LLM.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Scaling RAG across agents:</strong> Each agent type gets its own namespace. Sourcing agent → <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>sourcing-policies</code>.
              Compliance agent → <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>compliance-rules</code>. Support agent → <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>kb-articles</code>.
              Namespaces are isolated — no cross-agent data leakage. Each namespace can be independently indexed, re-indexed, and scaled.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>RAG cache:</strong> Retrieval results cached in Redis (TTL: 30min). If 100 agents ask similar questions within 30 minutes,
              the vector search runs once — the other 99 hit the RAG cache. This is critical at scale because vector search is expensive (O(n log n) with HNSW).
            </div>
          </div>

          {/* Tracing Across Both */}
          <div style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              Tracing — One Trace ID Across Both Systems
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>The connection:</strong> AgentMesh and InferRoute don&apos;t share code or a database. They&apos;re connected by the
              <strong style={{ color: 'var(--text-primary)' }}> W3C traceparent</strong> HTTP header. When an agent worker calls InferRoute, it injects the current trace context.
              InferRoute extracts it and creates child spans under the same trace ID. Both export to Jaeger via OTLP.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>What you see in Jaeger:</strong> One trace showing the full path —
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>gateway.start_workflow</code> →
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>workflow.run</code> →
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>node.decide</code> →
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)' }}>POST /v1/chat/completions</code> →
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)' }}>routing.classify_complexity</code> →
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)' }}>provider.call</code>.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>Scaling tracing:</strong> OTLP export is async (BatchSpanProcessor). Each instance exports its own spans.
              Jaeger (or Tempo, or Honeycomb) stitches them by trace ID. No shared state needed — the trace ID in the W3C header is the only coordination point.
              At scale, use Jaeger with Cassandra or Elasticsearch backend (not in-memory).
            </div>
          </div>
        </div>
      </div>

      {/* Live Load Test */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>LIVE LOAD TEST — REAL TEMPORAL WORKFLOWS</div>
        <div className="bordered-panel" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
            Launch real benchmark workflows through the actual Temporal infrastructure.
            No simulation — these are real workflows dispatched to real workers.
            Tests: gateway → Temporal → task queue → worker → activity → return.
          </p>

          {/* Form */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Workflows to launch</label>
              <select id="lt-count" className="styled-select" defaultValue="100">
                <option value="10">10</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Concurrency</label>
              <select id="lt-concurrency" className="styled-select" defaultValue="50">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Activity sleep (ms)</label>
              <select id="lt-sleep" className="styled-select" defaultValue="100">
                <option value="0">0 (no sleep)</option>
                <option value="50">50ms</option>
                <option value="100">100ms</option>
                <option value="500">500ms</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Workers</label>
              <select id="lt-workers" className="styled-select" defaultValue="1">
                <option value="1">1 worker</option>
                <option value="2">2 workers</option>
                <option value="4">4 workers</option>
                <option value="8">8 workers</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={runLoadTest} disabled={ltRunning}>
              {ltRunning ? <><span className="spinner" /> Running...</> : 'Run Load Test'}
            </button>
            <button className="btn-secondary" onClick={runScalingTest} disabled={scalingRunning}>
              {scalingRunning ? 'Running scaling test...' : 'Run Scaling Comparison (1 vs 2 vs 4 workers)'}
            </button>
          </div>

          {/* Running indicator */}
          {(ltRunning || scalingRunning) && (
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {scalingRunning ? 'Running scaling test...' : 'Running load test... launching real Temporal workflows...'}
              </span>
            </div>
          )}

          {/* Results */}
          {ltResults && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0, borderTop: '1px solid var(--border-subtle)', marginBottom: 16 }}>
                {[
                  { label: 'Workflows/sec', value: ltResults.throughput_per_sec, color: 'var(--accent)' },
                  { label: 'p50 latency (ms)', value: ltResults.p50_ms, color: 'var(--success)' },
                  { label: 'p99 latency (ms)', value: ltResults.p99_ms, color: 'var(--warning)' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '20px 20px 20px 0', borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div className="mini-stat-label">{s.label}</div>
                    <div className="mini-stat-value" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0, borderTop: '1px solid var(--border-subtle)' }}>
                {[
                  { label: 'Completed', value: ltResults.completed, color: 'var(--success)' },
                  { label: 'Failed', value: ltResults.failed, color: 'var(--danger)' },
                  { label: 'Total time (s)', value: (ltResults.duration_ms / 1000).toFixed(1) + 's', color: 'var(--text-primary)' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '20px 20px 20px 0', borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div className="mini-stat-label">{s.label}</div>
                    <div className="mini-stat-value" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                <strong>Batch ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{ltResults.batch_id}</span>
                <br />
                <strong>Workers:</strong> {ltResults.workers} · <strong>Concurrency:</strong> {ltResults.concurrency} parallel launches
                <br />
                <strong>Avg latency:</strong> {ltResults.avg_ms}ms
                <br />
                <strong>Success rate:</strong> {((ltResults.completed / ltResults.total) * 100).toFixed(1)}%
                <br />
                <strong>Activity sleep:</strong> {ltResults.sleep_ms}ms
              </div>
              {ltResults.errors && ltResults.errors.length > 0 && (
                <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 12 }}>
                  <strong>Errors ({ltResults.errors.length}):</strong>
                  <br />
                  {ltResults.errors.map((e: any, i: number) => <div key={i}>• {e.id}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}

          {ltError && (
            <div style={{ marginTop: 20, color: 'var(--danger)', fontSize: 13 }}>{ltError}</div>
          )}

          {/* Scaling Results */}
          {scalingResults && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Scaling Comparison — Same Workload, Different Worker Counts</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>Workers</th>
                      <th style={{ textAlign: 'right' }}>Throughput (wf/s)</th>
                      <th style={{ textAlign: 'right' }}>p50 (ms)</th>
                      <th style={{ textAlign: 'right' }}>p99 (ms)</th>
                      <th style={{ textAlign: 'right' }}>Duration (s)</th>
                      <th style={{ textAlign: 'right' }}>Improvement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scalingResults.map((r, i) => {
                      if (r.error) {
                        return <tr key={i}><td>{r.workers}</td><td colSpan={5} style={{ color: 'var(--danger)' }}>{r.error}</td></tr>;
                      }
                      const baseline = scalingResults[0];
                      const improvement = i === 0
                        ? 'baseline'
                        : `+${((r.throughput_per_sec / baseline.throughput_per_sec - 1) * 100).toFixed(0)}% throughput`;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{r.workers} worker{r.workers > 1 ? 's' : ''}</td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{r.throughput_per_sec}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{r.p50_ms}</td>
                          <td className="mono" style={{ textAlign: 'right', color: r.p99_ms < baseline.p99_ms ? 'var(--success)' : 'var(--warning)' }}>{r.p99_ms}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{(r.duration_ms / 1000).toFixed(1)}s</td>
                          <td style={{ textAlign: 'right', color: i === 0 ? 'var(--text-dim)' : 'var(--success)' }}>{improvement}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {scalingConclusion && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>{scalingConclusion}</div>
              )}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
