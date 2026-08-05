'use client';

import { useState, useRef } from 'react';
import { useStore, INFERROUTE, escapeHtml } from '@/lib/store';

interface RagResult {
  doc_id: string;
  score: number;
  source: string;
  content: string;
}

export default function KnowledgeBasePage() {
  const { uploadedDocs, forceUpdate, version } = useStore();
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [results, setResults] = useState<RagResult[] | null>(null);
  const [llmResponse, setLlmResponse] = useState<string | null>(null);
  const [llmRagInfo, setLlmRagInfo] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const nsUpsertRef = useRef<HTMLInputElement>(null);
  const docIdRef = useRef<HTMLInputElement>(null);
  const docContentRef = useRef<HTMLTextAreaElement>(null);
  const nsQueryRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const topKRef = useRef<HTMLInputElement>(null);

  const uploadDoc = async () => {
    const ns = nsUpsertRef.current?.value.trim();
    const docId = docIdRef.current?.value.trim();
    const content = docContentRef.current?.value.trim();
    if (!ns || !docId || !content) return;

    setUploading(true);
    try {
      const resp = await fetch(`${INFERROUTE}/v1/rag/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: ns, documents: [{ id: docId, content, metadata: {} }] }),
      });
      const data = await resp.json();
      if (data.status === 'upserted') {
        uploadedDocs.current.push({ ns, id: docId, content: content.substring(0, 80) + '...' });
        forceUpdate();
      } else {
        alert('Error: ' + JSON.stringify(data));
      }
    } catch (e: any) {
      alert('Connection failed: ' + e.message + '. Is InferRoute running on :8070?');
    }
    setUploading(false);
  };

  const searchRAG = async () => {
    const ns = nsQueryRef.current?.value.trim();
    const query = queryRef.current?.value.trim();
    const topK = parseInt(topKRef.current?.value || '5');
    if (!ns || !query) return;

    setSearching(true);
    setResults(null);
    try {
      const resp = await fetch(`${INFERROUTE}/v1/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: ns, query, top_k: topK }),
      });
      const data = await resp.json();
      setResults(data.results || []);
    } catch (e: any) {
      alert('Search failed: ' + e.message);
    }
    setSearching(false);
  };

  const sendRagToLLM = async () => {
    const ns = nsQueryRef.current?.value.trim();
    const query = queryRef.current?.value.trim();
    if (!ns || !query) { alert('Enter a namespace and query first'); return; }

    setLlmLoading(true);
    setLlmResponse(null);
    setLlmRagInfo(null);
    setLlmError(null);

    try {
      const resp = await fetch(`${INFERROUTE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: query }], max_tokens: 200, namespace: ns }),
      });
      const data = await resp.json();
      if (data.error) {
        setLlmError(`Error: ${data.error.detail || data.error}`);
      } else {
        const content = data.choices?.[0]?.message?.content || 'No response';
        setLlmResponse(content);
        if (data.x_rag) {
          setLlmRagInfo(`RAG: ${data.x_rag.retrieved} docs from ${data.x_rag.namespace} · ${data.x_rag.context_tokens} context tokens`);
        }
      }
    } catch (e: any) {
      setLlmError(`Connection failed: ${e.message}`);
    }
    setLlmLoading(false);
  };

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 48 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / KNOWLEDGE BASE</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          Knowledge Base (RAG)
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>
          Upload documents to InferRoute&apos;s RAG pipeline, search with semantic + lexical retrieval, and send context-augmented prompts to the LLM.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* Left: Upload + Doc List */}
        <div>
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>UPLOAD DOCUMENT</div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Namespace</label>
              <input ref={nsUpsertRef} type="text" className="styled-input" defaultValue="company-docs" placeholder="e.g. company-docs" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Document ID</label>
              <input ref={docIdRef} type="text" className="styled-input" defaultValue="refund-policy" placeholder="e.g. refund-policy" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Content</label>
              <textarea ref={docContentRef} className="styled-textarea" defaultValue="Our refund policy allows returns within 30 days of purchase. Items must be in original condition. Refunds are processed within 5-7 business days." placeholder="Paste document content here..." />
            </div>
            <button className="btn-primary" onClick={uploadDoc} disabled={uploading} style={{ width: '100%', justifyContent: 'center' }}>
              {uploading ? <><span className="spinner" /> Uploading...</> : 'Upload Document →'}
            </button>
          </div>

          <div className="bordered-panel" style={{ padding: 20 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>UPLOADED DOCUMENTS</div>
            {uploadedDocs.current.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>No documents uploaded yet.</span>
            ) : (
              uploadedDocs.current.map((d, i) => (
                <div key={i} className="bordered-panel" style={{ padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{d.id}</strong>
                    <span className="bracket-badge" style={{ color: 'var(--accent)' }}>{d.ns}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{d.content}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Search + Results + LLM */}
        <div>
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>SEARCH</div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Namespace</label>
              <input ref={nsQueryRef} type="text" className="styled-input" defaultValue="company-docs" placeholder="e.g. company-docs" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Query</label>
              <input ref={queryRef} type="text" className="styled-input" defaultValue="What is our refund policy?" placeholder="Ask a question..." />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Top K results</label>
              <input ref={topKRef} type="number" className="styled-input" defaultValue={5} min={1} max={20} style={{ width: 100 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={searchRAG} disabled={searching}>
                {searching ? <><span className="spinner" /> Searching...</> : 'Search →'}
              </button>
              <button className="btn-secondary" onClick={sendRagToLLM} disabled={llmLoading}>
                {llmLoading ? 'Asking LLM...' : 'Ask LLM with RAG context'}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {results !== null && (
            <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>SEARCH RESULTS</div>
              {results.length === 0 ? (
                <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>No results found.</span>
              ) : (
                results.map((r, i) => (
                  <div key={i} className="bordered-panel" style={{ padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.doc_id}</strong>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>
                        {r.score.toFixed(2)} <span style={{ color: 'var(--purple)', fontSize: 10, border: '1px solid var(--purple)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', marginLeft: 4 }}>{r.source}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                      {r.content.substring(0, 200)}{r.content.length > 200 ? '...' : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* LLM Response */}
          {(llmResponse || llmLoading || llmError) && (
            <div className="bordered-panel" style={{ padding: 20 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>LLM RESPONSE (RAG-AUGMENTED)</div>
              {llmLoading && <span className="spinner" />}
              {llmError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{llmError}</div>}
              {llmResponse && (
                <>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: 12 }}>{llmResponse}</div>
                  {llmRagInfo && (
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                      {llmRagInfo}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
