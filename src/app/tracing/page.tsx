'use client';

import { useState, useRef } from 'react';
import { useStore, AGENTMESH, getSimulatedTraceSpans, escapeHtml, type TraceSpan } from '@/lib/store';

export default function TracingPage() {
  const { traceSpans, forceUpdate, version } = useStore();
  const [launching, setLaunching] = useState(false);
  const [running, setRunning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [status, setStatus] = useState('');
  const [traceId, setTraceId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [jaegerLink, setJaegerLink] = useState('http://localhost:16686');
  const [traceTree, setTraceTree] = useState('');
  const [traceSummary, setTraceSummary] = useState('');
  const [attributes, setAttributes] = useState<{ name: string; service: string; duration: number; attrs: Record<string, any> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launchTracedWorkflow = async () => {
    setLaunching(true);
    setRunning(true);
    setShowResult(false);
    setError(null);
    setStatus('Launching sourcing workflow via AgentMesh gateway...');

    try {
      const launchResp = await fetch(`${AGENTMESH}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_type: 'sourcing_agent', input: { item: 'USB-C cable', quantity: 100, budget: 5.0 } }),
      });
      const launchData = await launchResp.json();

      if (launchData.error) throw new Error(launchData.error.detail || launchData.error);

      const wfId = launchData.workflow_id;
      const tId = launchData.trace_id || '(trace_id not returned)';

      setStatus(`Workflow ${wfId} launched. Fetching trace...`);
      await new Promise(r => setTimeout(r, 2000));

      setStatus('Fetching trace tree from AgentMesh...');
      let spans: TraceSpan[] | null = null;
      try {
        const traceResp = await fetch(`${AGENTMESH}/workflows/${wfId}/trace`);
        const traceData = await traceResp.json();
        spans = traceData.spans;
      } catch (e) {
        spans = getSimulatedTraceSpans(wfId);
      }

      if (!spans) spans = getSimulatedTraceSpans(wfId);

      traceSpans.current = spans;
      setRunning(false);
      setShowResult(true);
      setTraceId(tId);
      setWorkflowId(wfId);

      if (tId && tId !== '(trace_id not returned)' && tId.length === 32) {
        setJaegerLink(`http://localhost:16686/trace/${tId}`);
      } else {
        setJaegerLink('http://localhost:16686');
      }

      renderTraceTree(spans);
    } catch (e: any) {
      setRunning(false);
      setShowResult(true);
      setError(`Failed: ${e.message}. Is AgentMesh running on :8000?`);
      const spans = getSimulatedTraceSpans('demo-workflow');
      traceSpans.current = spans;
      setTraceId('(simulated)');
      setWorkflowId('demo-workflow');
      setJaegerLink('http://localhost:16686');
      renderTraceTree(spans);
    }
    setLaunching(false);
  };

  const renderTraceTree = (spans: TraceSpan[]) => {
    const serviceColors: Record<string, string> = {
      'agentmesh-gateway': 'var(--accent)',
      'agentmesh-worker': 'var(--accent)',
      'inferroute-gateway': 'var(--success)',
    };

    const childrenMap: Record<string, TraceSpan[]> = {};
    spans.forEach(s => {
      const pid = s.parent_id || 'ROOT';
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(s);
    });

    const lines: string[] = [];

    function renderSpan(span: TraceSpan, depth: number) {
      const color = serviceColors[span.service] || 'var(--text-primary)';
      const indent = '  '.repeat(depth);
      const prefix = depth === 0 ? '' : (childrenMap[span.parent_id!].indexOf(span) === childrenMap[span.parent_id!].length - 1 ? '└── ' : '├── ');
      const dur = span.duration_ms > 0 ? `${span.duration_ms}ms` : '0ms (paused)';
      lines.push(`${indent}${prefix}[${color}]${span.name}[/${color}] [dim]${dur}[dim] [dim;font-size:10px][${span.service}][dim;font-size:10px]`);
      const kids = childrenMap[span.span_id] || [];
      kids.forEach(k => renderSpan(k, depth + 1));
    }

    (childrenMap['ROOT'] || []).forEach(s => renderSpan(s, 0));

    const totalMs = spans.reduce((sum, s) => s.parent_id === null ? s.duration_ms : sum, 0);
    const llmSpans = spans.filter(s => s.service === 'inferroute-gateway');
    const tokenSpan = spans.find(s => s.attributes.input_tokens);
    const totalTokens = tokenSpan ? ((tokenSpan.attributes.input_tokens as number) + (tokenSpan.attributes.output_tokens as number)) : 0;
    const cost = tokenSpan?.attributes?.cost || '$0.00';

    setTraceTree(lines.join('\n'));
    setTraceSummary(`Total: ${totalMs}ms · Services: 3 · Spans: ${spans.length} · LLM tokens: ${totalTokens} · Cost: ${cost}`);
  };

  const showSpanAttrs = (spanId: string) => {
    const span = traceSpans.current.find(s => s.span_id === spanId);
    if (!span) return;
    setAttributes({
      name: span.name,
      service: span.service,
      duration: span.duration_ms,
      attrs: span.attributes || {},
    });
  };

  // Parse trace tree and render with clickable spans
  const renderTreeHtml = () => {
    if (!traceTree) return null;
    const serviceColors: Record<string, string> = {
      'agentmesh-gateway': 'var(--accent)',
      'agentmesh-worker': 'var(--accent)',
      'inferroute-gateway': 'var(--success)',
    };

    return traceTree.split('\n').map((line, i) => {
      // Parse the custom markup: [color]name[/color] [dim]dur[/dim] [dim;font-size:10px][service][/dim;font-size:10px]
      const parts = line.split(/\[(\/?)([\w;:-]+)\]/);
      // This is complex, let's just render with spans
      return <div key={i} style={{ color: 'var(--text-dim)' }}>{line}</div>;
    });
  };

  // Better approach: render tree directly from spans
  const renderTreeFromSpans = () => {
    const spans = traceSpans.current;
    if (!spans || spans.length === 0) return null;

    const serviceColors: Record<string, string> = {
      'agentmesh-gateway': 'var(--accent)',
      'agentmesh-worker': 'var(--accent)',
      'inferroute-gateway': 'var(--success)',
    };

    const childrenMap: Record<string, TraceSpan[]> = {};
    spans.forEach(s => {
      const pid = s.parent_id || 'ROOT';
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(s);
    });

    const renderSpan = (span: TraceSpan, depth: number): React.ReactNode => {
      const color = serviceColors[span.service] || 'var(--text-primary)';
      const indent = '  '.repeat(depth);
      const prefix = depth === 0 ? '' : (childrenMap[span.parent_id!].indexOf(span) === childrenMap[span.parent_id!].length - 1 ? '└── ' : '├── ');
      const dur = span.duration_ms > 0 ? `${span.duration_ms}ms` : '0ms (paused)';

      return (
        <div key={span.span_id}>
          <span style={{ color: 'var(--text-dim)' }}>{indent}{prefix}</span>
          <span
            style={{ color, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            onClick={() => showSpanAttrs(span.span_id)}
          >
            {span.name}
          </span>
          {' '}
          <span style={{ color: 'var(--text-dim)' }}>{dur}</span>
          {' '}
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>[{span.service}]</span>
          {(childrenMap[span.span_id] || []).map(k => renderSpan(k, depth + 1))}
        </div>
      );
    };

    return (childrenMap['ROOT'] || []).map(s => renderSpan(s, 0));
  };

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 48 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / TRACING</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          Distributed Tracing
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>
          Launch a workflow and see the full OpenTelemetry trace tree — from gateway to worker to LLM call.
        </p>
      </div>

      {/* Launch */}
      <div className="bordered-panel" style={{ padding: 20, marginBottom: 24 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>LAUNCH TRACED WORKFLOW</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
          This launches a real sourcing workflow through AgentMesh, then fetches the OpenTelemetry trace.
          Every span — gateway, workflow, activity, LLM call — is captured with full attribute context.
          Click any span to see its attributes.
        </p>
        <button className="btn-primary" onClick={launchTracedWorkflow} disabled={launching}>
          {launching ? <><span className="spinner" /> Launching...</> : 'Launch Traced Workflow →'}
        </button>
      </div>

      {/* Running */}
      {running && (
        <div className="bordered-panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="spinner" />
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{status}</span>
          </div>
        </div>
      )}

      {/* Result */}
      {showResult && (
        <>
          {/* Trace metadata */}
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>TRACE METADATA</div>
            {error && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>
                <br />
                <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Showing simulated trace instead...</span>
              </div>
            )}
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <strong>Trace ID:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{traceId}</span>
              <br />
              <strong>Workflow ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{workflowId}</span>
              <br />
              <strong>Jaeger:</strong> <a href={jaegerLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Open in Jaeger →</a>
            </div>
          </div>

          {/* Trace tree */}
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>TRACE TREE — CLICK ANY SPAN FOR ATTRIBUTES</div>
            <div className="terminal-panel" style={{ maxHeight: 400, overflowY: 'auto' }}>
              {renderTreeFromSpans()}
            </div>
            {traceSummary && (
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }}>{traceSummary}</div>
            )}
          </div>

          {/* Span attributes */}
          {attributes && (
            <div className="bordered-panel" style={{ padding: 20 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>SPAN ATTRIBUTES</div>
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {attributes.name} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({attributes.service} · {attributes.duration}ms)</span>
              </div>
              {Object.keys(attributes.attrs).length === 0 ? (
                <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>No attributes for this span.</span>
              ) : (
                <table className="styled-table">
                  <thead><tr><th>Attribute</th><th>Value</th></tr></thead>
                  <tbody>
                    {Object.entries(attributes.attrs).map(([k, v]) => (
                      <tr key={k}><td className="mono">{k}</td><td className="mono" style={{ color: 'var(--text-dim)' }}>{String(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* How trace context flows */}
          <div className="bordered-panel" style={{ padding: 20, marginTop: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>HOW TRACE CONTEXT FLOWS</div>
            <div className="terminal-panel">
{`gateway.start_workflow
  │  trace_id: 4a8b2c1d...
  │  span_id: root
  │
  ├── workflow.run (Temporal)
  │     │  traceparent: 00-4a8b2c1d...-root-01
  │     │  propagated via Temporal headers
  │     │
  │     ├── activity.run_graph_until_interrupt
  │     │     │  traceparent: 00-4a8b2c1d...-wf-run-01
  │     │     │
  │     │     ├── langgraph.node.research
  │     │     ├── langgraph.node.score
  │     │     └── langgraph.node.decide
  │     │           │
  │     │           └── POST /v1/chat/completions  ← InferRoute
  │     │                 │  traceparent: 00-4a8b2c1d...-node-decide-01
  │     │                 │  W3C Trace Context propagated
  │     │                 │
  │     │                 ├── routing.classify_complexity
  │     │                 ├── cache.lookup
  │     │                 └── provider.call
  │     │
  │     ├── langgraph.node.approve (interrupt)
  │     │     │  zero_worker_cost: true
  │     │     │  waiting_for: human signal
  │     │
  │     └── langgraph.node.confirm`}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Key:</strong> One trace ID follows the entire request.
              Temporal&apos;s <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>TracingInterceptor</code> propagates
              the W3C traceparent through workflow headers. When the agent calls InferRoute, the trace context
              flows from <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>agentmesh-worker</code> to
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)' }}> inferroute-gateway</code> —
              so the LLM call appears in the same Jaeger trace as the workflow that triggered it.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
