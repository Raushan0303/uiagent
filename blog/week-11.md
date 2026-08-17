# Week 11: UIAgent — The Dashboard

## LinkedIn Post (Week 11 Progress)

---

Final week of the 75-day journey. I built UIAgent — a Next.js dashboard to visualize everything.

**What I built:**
- Story page (what we built and why)
- Architecture page (3 tabs: AgentMesh scaling, InferRoute routing, full system diagram)
- Playground (send prompts, see routing decisions live)
- Workflows page (list running workflows, simulate crash recovery)
- Knowledge Base (RAG document management)
- Usage page (routing distribution, cache performance, cost breakdown)
- Tracing page (distributed trace viewer across AgentMesh → InferRoute)

**What I learned:**

1. The dashboard is not the product. The infrastructure is the product. The dashboard is how you prove the infrastructure works. Each page visualizes a different aspect: routing decisions, cache hits, traces, workflow states.

2. Visualizing distributed traces is harder than it looks. A trace is a tree of spans. Each span has a start time, duration, and parent. Rendering this as a timeline that makes sense to a human requires careful layout.

3. The Architecture page was the most valuable to write. Explaining "how Temporal scales" and "why config-based routing beats LLM classification" in a UI forced me to understand the tradeoffs deeply. If you can't explain it in a dashboard, you don't understand it.

**75-day journey complete:**
- AgentMesh: 6 weeks (durable workflow engine with Temporal)
- InferRoute: 4.5 weeks (LLM gateway with 6 routing strategies, config-based routing, dynamic scoring)
- UIAgent: 1 week (Next.js dashboard)

3 repos. 67 commits. 222 files. One system.

#BuildingInPublic #AIInfrastructure #NextJS #SoftwareEngineering

---

## Deep Dive: What I'd Do Differently If I Started Over

*Posted on dev.to / Medium*

---

After 75 days of building AI infrastructure, here's what I got wrong and what I'd change.

### 1. Start with Go, not Python

Python was the right choice for learning. I iterated fast, used the Temporal Python SDK, and got things working quickly. But Python's GIL limits concurrency. At 500 RPS, p99 degrades. Go handles 5000 RPS with <1ms p99.

**What I'd do:** Python for the prototype, Go for the hot path. The llm0 developer did this — Python for the weekend prototype, Go rewrite for the gateway, Python sidecar for embeddings.

### 2. Start with config-based routing, not LLM classification

I spent a week building an LLM-based complexity classifier. It was "smart" but didn't scale. Then I studied Portkey and realized config-based routing is better: faster (1ms vs 200ms), cheaper (free vs $140/day at scale), and deterministic.

**What I'd do:** Start with config-based routing. Add classification only if a tenant explicitly requests it.

### 3. Don't put RAG in the gateway

I built RAG into InferRoute. It works, but it's a scope mismatch. RAG is an application concern (AgentMesh), not a gateway concern (InferRoute). Kong and Cloudflare do this, but Portkey and LiteLLM don't.

**What I'd do:** RAG in AgentMesh. InferRoute stays pure: routing, caching, failover, rate limiting.

### 4. Implement Postgres partitioning from day 1

The usage_log table grows fast. At 10M requests/day, it's 10M rows/day. Without partitioning, queries become slow. I documented the partitioning strategy but didn't implement it.

**What I'd do:** Partition by day from the start. 7-day retention. Older data goes to cold storage.

### 5. Use a trained classifier model, not heuristic keywords

My heuristic classifier uses keyword matching. It handles ~80% of prompts but misses edge cases. RouteLLM and Azure use trained classifier models (small BERT) that are more accurate and run locally (no API call).

**What I'd do:** Train a small classifier model. But this is a Week 12+ improvement — not critical for the learning project.

### What I got right

1. **Temporal over Celery.** The right choice for long-running, stateful, expensive workflows.
2. **Circuit breakers from day 1.** Not an afterthought. Built into the gateway from the start.
3. **W3C distributed tracing.** Being able to trace a request across two systems is invaluable for debugging.
4. **Honest READMEs.** Saying "this is a learning project" is better than claiming production scale.
5. **Studying before building.** Reading about Portkey, RouteLLM, FrugalGPT, Bifrost before writing code saved me from multiple wrong turns.

### The most important lesson

Distributed systems is mostly about tradeoffs, not code. "It works" and "it scales" are completely different things. The hardest part isn't building — it's knowing what NOT to build.

---

*This concludes my 75-day journey building AI infrastructure from scratch. Three repos: AgentMesh (durable workflows), InferRoute (LLM gateway), UIAgent (dashboard). All code is on my GitHub. Thanks for following along.*
