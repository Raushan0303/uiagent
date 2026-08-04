'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function StoryPage() {
  const router = useRouter();
  const { forceUpdate } = useStore();

  const goTo = (path: string) => router.push(path);

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / STORY</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          The Story
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6, maxWidth: 700 }}>
          Two infrastructure projects — a durable AI agent execution platform and a smart LLM gateway. The sourcing agent is one use case running on top.
        </p>
      </div>

      {/* What We Built */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>WHAT WE BUILT — THE INFRASTRUCTURE</div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
          Two systems that work together to run AI agents reliably at scale:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
          {/* AgentMesh Panel */}
          <div className="bordered-panel" style={{ padding: 24, borderTop: '3px solid var(--accent)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)', marginBottom: 12 }}>AgentMesh</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              A <strong style={{ color: 'var(--text-primary)' }}>durable agent execution platform</strong> on Temporal + LangGraph.
            </div>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, fontSize: 12, color: 'var(--text-dim)', lineHeight: 2 }}>
              <li>• Workers, task queues, horizontal scaling</li>
              <li>• Circuit breakers + bulkheads for failure isolation</li>
              <li>• Human-in-the-loop with structural checkpoints</li>
              <li>• Crash recovery — workflows survive worker death</li>
              <li>• Zero-downtime agent updates via workflow versioning</li>
              <li>• Load tested: 10,000 concurrent workflows</li>
            </ul>
          </div>
          {/* InferRoute Panel */}
          <div className="bordered-panel" style={{ padding: 24, borderTop: '3px solid var(--success)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--success)', marginBottom: 12 }}>InferRoute</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              A <strong style={{ color: 'var(--text-primary)' }}>smart LLM gateway</strong> — OpenAI-compatible, drop-in replacement.
            </div>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, fontSize: 12, color: 'var(--text-dim)', lineHeight: 2 }}>
              <li>• Complexity-aware routing (cheap/standard/premium)</li>
              <li>• Multi-layer caching (exact + semantic + coalescer)</li>
              <li>• Provider failover (OpenAI → Anthropic → vLLM)</li>
              <li>• RAG integration with namespace-scoped retrieval</li>
              <li>• 60% cost reduction by routing to cheaper models</li>
              <li>• p99 &lt; 50ms for cache hits vs 2s for upstream</li>
            </ul>
          </div>
        </div>
        <div className="bordered-panel" style={{ padding: 16, marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Together:</strong> AgentMesh orchestrates the agent workflow. Every LLM call the agent makes
          goes through InferRoute&apos;s routing, caching, and RAG pipeline. The agent doesn&apos;t know which model it&apos;s using —
          InferRoute decides based on complexity. The agent doesn&apos;t know about caching — InferRoute handles it transparently.
        </div>
      </div>

      {/* The Demo Use Case */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>THE DEMO USE CASE — SOURCING AGENT</div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
          To prove the infrastructure works, we built a <strong style={{ color: 'var(--text-primary)' }}>sourcing agent</strong> —
          one agent running on the platform. It automates procurement:
          a company needs <strong style={{ color: 'var(--text-primary)' }}>100 USB-C cables</strong> under <strong style={{ color: 'var(--text-primary)' }}>$5/unit</strong>.
          A human would manually search supplier catalogs, compare prices, check ratings, make a decision,
          create a purchase order, and initiate payment. <strong style={{ color: 'var(--danger)' }}>That takes ~2 hours.</strong>
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          The agent does it in <strong style={{ color: 'var(--success)' }}>~30 seconds</strong>:
        </p>
        {/* Connected pills */}
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
          {[
            { label: 'Research', color: 'var(--accent)' },
            { label: 'Score', color: 'var(--accent)' },
            { label: 'Decide (LLM via InferRoute)', color: 'var(--accent)' },
            { label: 'Approve (Human checkpoint)', color: 'var(--warning)' },
            { label: 'Confirm (PO + Payment)', color: 'var(--success)' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: step.color,
                border: `1px solid ${step.color}`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontWeight: 600,
              }}>
                {step.label}
              </span>
              {i < 4 && <span style={{ color: 'var(--text-dim)', margin: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>→</span>}
            </div>
          ))}
        </div>
        <div className="bordered-panel" style={{ padding: 16, marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>But the sourcing agent is just one use case.</strong> The same infrastructure supports any multi-step agent:
          compliance review, customer support, data pipelines, financial analysis — any agent that needs
          tools, LLM calls, human approval, and crash recovery. The agent changes. The infrastructure doesn&apos;t.
        </div>
      </div>

      {/* See It Live */}
      <div style={{ marginBottom: 64 }}>
        <div className="mono-label" style={{ marginBottom: 16 }}>SEE IT LIVE</div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
          Click below to launch the sourcing agent and watch every step happen in real time.
          You&apos;ll see suppliers found, scores calculated, the LLM&apos;s reasoning, human approval, and crash recovery.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => { goTo('/workflows'); setTimeout(() => forceUpdate(), 100); }}>
            Launch Demo Workflow →
          </button>
          <button className="btn-secondary" onClick={() => goTo('/workflows')}>
            Launch 10 Parallel Workflows
          </button>
          <button className="btn-secondary" onClick={() => goTo('/workflows')}>
            Simulate Worker Crash
          </button>
          <button className="btn-secondary" onClick={() => goTo('/architecture')}>
            View Architecture &amp; Load Tests
          </button>
        </div>
      </div>

      {/* Mini Stats Row 1 */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, borderTop: '1px solid var(--border-subtle)' }}>
          {[
            { label: 'Manual sourcing time', value: '~2 hrs', color: 'var(--danger)' },
            { label: 'With AgentMesh', value: '~30 sec', color: 'var(--success)' },
            { label: 'Speed improvement', value: '240x', color: 'var(--accent)' },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '24px 24px 24px 0', borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div className="mini-stat-label">{stat.label}</div>
              <div className="mini-stat-value" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mini Stats Row 2 */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, borderTop: '1px solid var(--border-subtle)' }}>
          {[
            { label: 'Concurrent workflows load tested', value: '10,000', color: 'var(--accent)' },
            { label: 'Success rate under load', value: '98.7%', color: 'var(--success)' },
            { label: 'LLM cost reduction via InferRoute', value: '~60%', color: 'var(--warning)' },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '24px 24px 24px 0', borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div className="mini-stat-label">{stat.label}</div>
              <div className="mini-stat-value" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
