'use client';

import { useState, useRef } from 'react';
import { INFERROUTE, escapeHtml } from '@/lib/store';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

interface RoutingInfo {
  complexity: string;
  tier: string;
  provider: string;
  model: string;
  strategy: string;
  cacheStatus: string;
  latencyMs: string;
  cost: string;
  tokens: string | number;
}

interface RagSource {
  doc_id: string;
  score: number;
  source: string;
}

interface RagInfo {
  retrieved: number;
  namespace: string;
  context_tokens: number;
  cache_hit: boolean;
  sources: RagSource[];
}

export default function PlaygroundPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [routing, setRouting] = useState<RoutingInfo | null>(null);
  const [ragInfo, setRagInfo] = useState<RagInfo | null>(null);
  const systemRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLSelectElement>(null);
  const nsRef = useRef<HTMLSelectElement>(null);
  const tokensRef = useRef<HTMLInputElement>(null);
  const tempRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const sendChat = async () => {
    const userMsg = userRef.current?.value.trim();
    if (!userMsg) return;

    const systemMsg = systemRef.current?.value.trim() || '';
    const model = modelRef.current?.value || 'auto';
    const namespace = nsRef.current?.value || '';
    const maxTokens = parseInt(tokensRef.current?.value || '200');
    const temp = parseFloat(tempRef.current?.value || '0.7');

    const msgs: { role: string; content: string }[] = [];
    if (systemMsg) msgs.push({ role: 'system', content: systemMsg });
    msgs.push({ role: 'user', content: userMsg });

    const body: any = { model, messages: msgs, max_tokens: maxTokens, temperature: temp };
    if (namespace) body.namespace = namespace;

    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '...' }]);
    setLoading(true);
    setRouting(null);
    setRagInfo(null);

    try {
      const resp = await fetch(`${INFERROUTE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (data.error) {
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `Error: ${data.error.detail || data.error}`, isError: true }]);
      } else {
        const content = data.choices?.[0]?.message?.content || 'No response';
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content }]);

        // Routing info
        const r = data.x_routing || {};
        const usage = data.usage || {};
        const complexity = r.complexity || data.complexity || '—';
        const tier = r.tier || data.tier || '—';
        const cacheStatus = r.cache_status || data.cache_status || 'miss';
        setRouting({
          complexity,
          tier,
          provider: r.provider || data.provider || '—',
          model: data.model || 'unknown',
          strategy: r.strategy || data.strategy || 'intelligence_aware',
          cacheStatus,
          latencyMs: r.latency_ms || data.latency_ms || '—',
          cost: r.cost || data.cost || 0,
          tokens: usage.total_tokens ?? '—',
        });

        // RAG info
        if (data.x_rag && data.x_rag.retrieved > 0) {
          setRagInfo({
            retrieved: data.x_rag.retrieved,
            namespace: data.x_rag.namespace,
            context_tokens: data.x_rag.context_tokens,
            cache_hit: data.x_rag.cache_hit,
            sources: data.x_rag.sources || [],
          });
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `Connection failed: ${e.message}. Is InferRoute running on :8070?`, isError: true }]);
    }
    setLoading(false);
    setTimeout(() => {
      if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }, 50);
  };

  const clearChat = () => {
    setMessages([]);
    setRouting(null);
    setRagInfo(null);
  };

  const complexityColor = (c: string) => c === 'simple' ? 'var(--success)' : c === 'medium' ? 'var(--warning)' : c === 'complex' ? 'var(--danger)' : 'var(--text-dim)';
  const tierColor = (t: string) => t === 'cheap' ? 'var(--success)' : t === 'standard' ? 'var(--warning)' : t === 'premium' ? 'var(--danger)' : 'var(--text-dim)';

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 48 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / PLAYGROUND</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          Playground
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>
          Send prompts through InferRoute — see routing decisions, RAG retrieval, and costs in real time.
        </p>
      </div>

      {/* Config Bar */}
      <div className="bordered-panel" style={{ padding: 16, marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 150 }}>
          <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Model</label>
          <select ref={modelRef} className="styled-select" defaultValue="auto">
            <option value="auto">auto (complexity-aware)</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4-turbo">gpt-4-turbo</option>
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Knowledge Base (optional)</label>
          <select ref={nsRef} className="styled-select" defaultValue="">
            <option value="">None — no RAG</option>
            <option value="company-docs">company-docs</option>
            <option value="supplier-policy">supplier-policy</option>
            <option value="product-docs">product-docs</option>
          </select>
        </div>
        <div style={{ width: 100 }}>
          <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Max tokens</label>
          <input ref={tokensRef} type="number" className="styled-input" defaultValue={200} min={1} max={4000} />
        </div>
        <div style={{ width: 100 }}>
          <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Temperature</label>
          <input ref={tempRef} type="number" className="styled-input" defaultValue={0.7} min={0} max={2} step={0.1} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
          <input ref={streamRef} type="checkbox" id="pg-stream" style={{ width: 'auto' }} />
          <label htmlFor="pg-stream" className="mono-label">Stream</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* Left: Prompt */}
        <div>
          <div className="bordered-panel" style={{ padding: 20 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>PROMPT</div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>System message (optional)</label>
              <input ref={systemRef} type="text" className="styled-input" placeholder="You are a helpful assistant..." />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>User message</label>
              <textarea ref={userRef} className="styled-textarea" placeholder="Ask anything..." defaultValue="What is our refund policy?" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={sendChat} disabled={loading}>
                {loading ? <><span className="spinner" /> Sending...</> : 'Send →'}
              </button>
              <button className="btn-secondary" onClick={clearChat}>Clear</button>
            </div>
          </div>
        </div>

        {/* Right: Response + Routing + RAG */}
        <div>
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>RESPONSE</div>
            <div ref={chatAreaRef} style={{ minHeight: 120, maxHeight: 400, overflowY: 'auto' }}>
              {messages.length === 0 ? (
                <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>Responses will appear here...</span>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="bordered-panel" style={{
                    padding: '12px 16px',
                    marginBottom: 12,
                    maxWidth: '85%',
                    borderLeft: msg.role === 'user' ? '3px solid var(--accent)' : '1px solid var(--border-subtle)',
                    marginLeft: msg.role === 'user' ? 'auto' : 0,
                  }}>
                    <div className="mono-label" style={{ marginBottom: 4 }}>{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: msg.isError ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {msg.content === '...' ? <span className="spinner" /> : msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Routing Decision */}
          {routing && (
            <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>ROUTING DECISION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <div>
                  <div className="mono-label">Complexity</div>
                  <div style={{ fontSize: 13, color: complexityColor(routing.complexity), fontWeight: 600 }}>{routing.complexity}</div>
                </div>
                <div>
                  <div className="mono-label">Tier</div>
                  <div style={{ fontSize: 13, color: tierColor(routing.tier), fontWeight: 600 }}>{routing.tier}</div>
                </div>
                <div>
                  <div className="mono-label">Provider</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{routing.provider}</div>
                </div>
                <div>
                  <div className="mono-label">Model</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{routing.model}</div>
                </div>
                <div>
                  <div className="mono-label">Strategy</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{routing.strategy}</div>
                </div>
                <div>
                  <div className="mono-label">Cache</div>
                  <div className="bracket-badge" style={{ color: routing.cacheStatus === 'hit' ? 'var(--success)' : 'var(--warning)' }}>
                    {routing.cacheStatus === 'hit' ? 'CACHE HIT' : 'CACHE MISS'}
                  </div>
                </div>
                <div>
                  <div className="mono-label">Latency</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{routing.latencyMs}ms</div>
                </div>
                <div>
                  <div className="mono-label">Cost</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>${parseFloat(routing.cost).toFixed(4)}</div>
                </div>
                <div>
                  <div className="mono-label">Tokens</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{routing.tokens}</div>
                </div>
              </div>
            </div>
          )}

          {/* RAG Retrieval */}
          {ragInfo && (
            <div className="bordered-panel" style={{ padding: 20 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>RAG RETRIEVAL</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <strong>{ragInfo.retrieved}</strong> documents retrieved from <strong>{ragInfo.namespace}</strong> · {ragInfo.context_tokens} context tokens · Cache: <span className="bracket-badge" style={{ color: ragInfo.cache_hit ? 'var(--success)' : 'var(--warning)' }}>{ragInfo.cache_hit ? 'HIT' : 'MISS'}</span>
              </div>
              {ragInfo.sources.map((s, i) => (
                <div key={i} className="bordered-panel" style={{ padding: '8px 12px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.doc_id}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>
                    {s.score.toFixed(2)} <span style={{ color: 'var(--purple)', fontSize: 10, border: '1px solid var(--purple)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', marginLeft: 4 }}>{s.source}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
