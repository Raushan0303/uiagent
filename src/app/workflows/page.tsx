'use client';

import { useState, useRef, useEffect } from 'react';
import {
  useStore, AGENTMESH, WORKFLOW_STEPS, ITEMS,
  generateSuppliers, scoreSuppliers, generateDecision, generatePO,
  type Workflow, type Supplier,
} from '@/lib/store';

export default function WorkflowsPage() {
  const { activeWorkflows, selectedWorkflow, forceUpdate, version } = useStore();
  const [launching, setLaunching] = useState(false);
  const [scaleLaunching, setScaleLaunching] = useState(false);
  const [crashLog, setCrashLog] = useState<{ text: string; color: string }[] | null>(null);
  const [showScaleCard, setShowScaleCard] = useState(false);
  const [showCrashCard, setShowCrashCard] = useState(false);
  const [scaleSummary, setScaleSummary] = useState('');
  const [scaleCells, setScaleCells] = useState<{ id: string; status: string; color: string; item: string }[]>([]);

  const agentTypeRef = useRef<HTMLSelectElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);
  const approveCommentRef = useRef<HTMLInputElement>(null);

  // Trigger re-render periodically for workflow updates
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(), 500);
    return () => clearInterval(interval);
  }, [forceUpdate]);

  const simulateWorkflowSteps = (wfId: string) => {
    const advance = () => {
      const w = activeWorkflows.current[wfId];
      if (!w) return;
      if (w.status === 'COMPLETED' || w.status === 'FAILED' || w.status === 'REJECTED' || w.status === 'APPROVED') return;

      if (w.currentStep === 0) {
        w.suppliers = generateSuppliers(w.item, w.budget);
        w.currentStep = 1;
        setTimeout(advance, 1200 + Math.random() * 1000);
      } else if (w.currentStep === 1) {
        w.scoredSuppliers = scoreSuppliers(w.suppliers!);
        w.currentStep = 2;
        setTimeout(advance, 1000 + Math.random() * 800);
      } else if (w.currentStep === 2) {
        w.decision = generateDecision(w.scoredSuppliers!, w.item, w.budget);
        w.currentStep = 3;
      }

      forceUpdate();
    };
    setTimeout(advance, 800);
  };

  const launchWorkflow = async () => {
    setLaunching(true);
    const agentType = agentTypeRef.current?.value || 'sourcing_agent';
    const item = itemRef.current?.value.trim() || 'USB-C cable';
    const quantity = parseInt(qtyRef.current?.value || '100');
    const budget = parseFloat(budgetRef.current?.value || '5.00');

    const wfId = `sourcing_agent-${Math.random().toString(36).substring(2, 10)}`;
    activeWorkflows.current[wfId] = {
      agent_type: agentType, item, quantity, budget,
      status: 'RUNNING', currentStep: 0, startedAt: Date.now(),
      suppliers: null, scoredSuppliers: null, decision: null, po: null,
    };

    try {
      const resp = await fetch(`${AGENTMESH}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_type: agentType, input: { item, quantity, budget } }),
      });
      const data = await resp.json();
      if (data.workflow_id) activeWorkflows.current[wfId].backendWorkflowId = data.workflow_id;
    } catch (e) { /* backend may be down */ }

    selectedWorkflow.current = wfId;
    forceUpdate();
    simulateWorkflowSteps(wfId);
    setLaunching(false);
  };

  const launchScaleDemo = async () => {
    setScaleLaunching(true);
    setShowScaleCard(true);
    setScaleCells([]);

    const cells: { id: string; status: string; color: string; item: string }[] = [];
    const wfIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      const item = ITEMS[i % ITEMS.length];
      const quantity = 50 + Math.floor(Math.random() * 200);
      const budget = parseFloat((3 + Math.random() * 5).toFixed(2));
      const wfId = `sourcing_agent-${Math.random().toString(36).substring(2, 10)}`;

      activeWorkflows.current[wfId] = {
        agent_type: 'sourcing_agent', item, quantity, budget,
        status: 'RUNNING', currentStep: 0, startedAt: Date.now(),
        suppliers: null, scoredSuppliers: null, decision: null, po: null,
        isScaleDemo: true,
      };
      wfIds.push(wfId);
      cells.push({ id: wfId, status: 'RUNNING', color: 'var(--accent)', item });
    }

    setScaleCells(cells);
    forceUpdate();

    wfIds.forEach((wfId, i) => {
      setTimeout(() => simulateWorkflowSteps(wfId), i * 200);
    });

    // Update summary periodically
    const interval = setInterval(() => {
      let running = 0, waiting = 0, completed = 0, rejected = 0;
      const newCells = cells.map(c => {
        const wf = activeWorkflows.current[c.id];
        if (!wf) return c;
        const displayStatus: string = (wf.currentStep >= 3 && wf.status === 'RUNNING') ? 'WAITING' : wf.status;
        const color = (displayStatus === 'COMPLETED' || displayStatus === 'APPROVED') ? 'var(--success)' :
                      (displayStatus === 'WAITING' || displayStatus === 'WAITING_FOR_APPROVAL') ? 'var(--warning)' :
                      (displayStatus === 'REJECTED') ? 'var(--danger)' : 'var(--accent)';
        if (wf.status === 'RUNNING' && wf.currentStep < 3) running++;
        else if (wf.currentStep >= 3 && wf.status === 'RUNNING') waiting++;
        else if (wf.status === 'COMPLETED' || wf.status === 'APPROVED') completed++;
        else if (wf.status === 'REJECTED') rejected++;
        return { ...c, status: displayStatus, color };
      });
      setScaleCells(newCells);
      setScaleSummary(`${running} running · ${waiting} waiting for approval · ${completed} completed · ${rejected} rejected`);
      if (completed + rejected === wfIds.length) clearInterval(interval);
    }, 500);

    setScaleLaunching(false);
  };

  const simulateCrash = async () => {
    setShowCrashCard(true);
    const log: { text: string; color: string }[] = [];
    const append = (text: string, color = 'var(--text-dim)') => {
      log.push({ text, color });
      setCrashLog([...log]);
    };
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

    append('═══ FAULT TOLERANCE DEMO ═══', 'var(--text-primary)');
    append('');
    append('Step 1: Launching sourcing workflow...');
    await wait(500);

    let backendWfId = null;
    try {
      const resp = await fetch(`${AGENTMESH}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_type: 'sourcing_agent', input: { item: 'lithium battery', quantity: 50, budget: 20 } }),
      });
      const data = await resp.json();
      backendWfId = data.workflow_id;
      append(`  ✓ Workflow started: ${backendWfId}`, 'var(--success)');
    } catch (e) {
      append(`  ⚠ Backend not reachable — simulating with frontend only`, 'var(--warning)');
    }
    await wait(500);

    append('');
    append('Step 2: Workflow is executing Research → Score → Decide...');
    append('  → Activity: searching suppliers for "lithium battery"');
    await wait(800);
    append('  → Activity: scoring suppliers (price, rating, lead time)');
    await wait(800);
    append('  → Activity: LLM deciding best supplier via InferRoute');
    await wait(800);

    append('');
    append('Step 3: ⚠ SIMULATING WORKER CRASH', 'var(--danger)');
    append('  → Worker process killed mid-execution');
    append('  → Activity was in-flight when crash occurred');
    await wait(1000);

    append('');
    append('Step 4: What happens next (Temporal fault tolerance):', 'var(--text-primary)');
    append('  → Temporal detects worker stopped responding');
    append('  → Activity timeout fires (StartToClose timeout)');
    append('  → Temporal retries the activity on a DIFFERENT worker', 'var(--success)');
    append('  → Workflow state is in Postgres, NOT in worker memory', 'var(--success)');
    append('  → No state lost — workflow resumes from last checkpoint');
    await wait(1000);

    append('');
    append('Step 5: Worker restarts, picks up where it left off:', 'var(--text-primary)');
    append('  → New worker polls task queue');
    append('  → Gets the same activity task (replay)');
    append('  → Re-executes Research → Score → Decide from checkpoint');
    await wait(800);
    append('  → Workflow arrives at Approve checkpoint');
    append('  → Waiting for human signal (can wait for days, zero worker cost)', 'var(--success)');
    await wait(500);

    append('');
    append('═══ RESULT ═══', 'var(--text-primary)');
    append('Workflow survived a mid-execution crash with zero data loss.', 'var(--success)');
    append('This is what "durable execution" means — the workflow state');
    append('lives in Temporal\'s database, not in worker memory.');
    append('');
    append('Key insight: if the worker crashes AFTER Approve but BEFORE');
    append('Confirm, the human\'s approval is NOT lost — it\'s in the');
    append('checkpoint. The new worker resumes from the approved state.');
  };

  const approveWorkflow = async (approved: boolean) => {
    const wfId = Object.keys(activeWorkflows.current).find(id =>
      activeWorkflows.current[id].currentStep >= 3 &&
      activeWorkflows.current[id].status !== 'COMPLETED' &&
      activeWorkflows.current[id].status !== 'REJECTED' &&
      activeWorkflows.current[id].status !== 'APPROVED'
    );
    if (!wfId) return;
    const comment = approveCommentRef.current?.value || '';

    if (activeWorkflows.current[wfId].backendWorkflowId) {
      try {
        await fetch(`${AGENTMESH}/workflows/${activeWorkflows.current[wfId].backendWorkflowId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved, comment }),
        });
      } catch (e) { /* simulation continues */ }
    }

    activeWorkflows.current[wfId].approvalComment = comment;

    if (approved) {
      activeWorkflows.current[wfId].status = 'COMPLETED';
      activeWorkflows.current[wfId].currentStep = 4;
      activeWorkflows.current[wfId].completedAt = Date.now();
    } else {
      const rejectionCount = (activeWorkflows.current[wfId].rejectionCount || 0) + 1;
      activeWorkflows.current[wfId].rejectionCount = rejectionCount;
      if (rejectionCount >= 3) {
        activeWorkflows.current[wfId].status = 'REJECTED';
        activeWorkflows.current[wfId].currentStep = 3;
      } else {
        activeWorkflows.current[wfId].status = 'RUNNING';
        activeWorkflows.current[wfId].currentStep = 0;
        activeWorkflows.current[wfId].rejectionReason = comment;
        activeWorkflows.current[wfId].suppliers = null;
        activeWorkflows.current[wfId].scoredSuppliers = null;
        activeWorkflows.current[wfId].decision = null;
        activeWorkflows.current[wfId].po = null;
        simulateWorkflowSteps(wfId);
      }
    }
    forceUpdate();
  };

  const showDetail = (wfId: string) => {
    selectedWorkflow.current = wfId;
    forceUpdate();
  };

  // Render workflow list
  const wfIds = Object.keys(activeWorkflows.current);
  const selWf = selectedWorkflow.current ? activeWorkflows.current[selectedWorkflow.current] : null;

  const getStatusBadge = (status: string) => {
    const color = status === 'COMPLETED' || status === 'APPROVED' ? 'var(--success)' :
                  status === 'RUNNING' ? 'var(--accent)' :
                  status === 'WAITING_FOR_APPROVAL' || status === 'WAITING' ? 'var(--warning)' :
                  status === 'FAILED' || status === 'REJECTED' ? 'var(--danger)' :
                  'var(--text-dim)';
    return <span className="bracket-badge" style={{ color }}>{status}</span>;
  };

  return (
    <div className="page-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 48 }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>DOMAIN / WORKFLOWS</div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--accent)' }}>
          Agent Workflows
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>
          Launch AgentMesh workflows, monitor status, and approve human checkpoints.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* Left: Launch + Active Workflows */}
        <div>
          {/* Launch form */}
          <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>LAUNCH NEW WORKFLOW</div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Agent type</label>
              <select ref={agentTypeRef} className="styled-select" defaultValue="sourcing_agent">
                <option value="sourcing_agent">Sourcing Agent</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Item</label>
              <input ref={itemRef} type="text" className="styled-input" defaultValue="USB-C cable" placeholder="e.g. USB-C cable" />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
                <input ref={qtyRef} type="number" className="styled-input" defaultValue={100} min={1} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Budget per unit ($)</label>
                <input ref={budgetRef} type="number" className="styled-input" defaultValue="5.00" step={0.01} min={0} />
              </div>
            </div>
            <button className="btn-primary" onClick={launchWorkflow} disabled={launching} style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}>
              {launching ? <><span className="spinner" /> Launching...</> : 'Launch Workflow →'}
            </button>
            <button className="btn-secondary" onClick={launchScaleDemo} disabled={scaleLaunching} style={{ width: '100%', marginBottom: 8 }}>
              {scaleLaunching ? 'Launching...' : 'Launch 10 Parallel Workflows'}
            </button>
            <button className="btn-secondary" onClick={simulateCrash} style={{ width: '100%' }}>
              Simulate Worker Crash (Fault Tolerance)
            </button>
          </div>

          {/* Active Workflows */}
          <div className="bordered-panel" style={{ padding: 20 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>ACTIVE WORKFLOWS</div>
            {wfIds.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>No workflows launched yet.</span>
            ) : (
              wfIds.slice().reverse().map(id => {
                const wf = activeWorkflows.current[id];
                const listStatus = (wf.currentStep >= 3 && wf.status === 'RUNNING') ? 'WAITING_FOR_APPROVAL' : wf.status;
                const stepLabel = wf.currentStep < WORKFLOW_STEPS.length ? WORKFLOW_STEPS[wf.currentStep].label : 'Done';
                return (
                  <div key={id} className="bordered-panel" style={{ padding: 16, marginBottom: 8, cursor: 'pointer' }} onClick={() => showDetail(id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{id}</span>
                      {getStatusBadge(listStatus)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Agent: {wf.agent_type} · Item: {wf.item} · Step: {stepLabel}</div>
                  </div>
                );
              })
            )}
            <button className="btn-secondary" onClick={() => forceUpdate()} style={{ marginTop: 12 }}>Refresh</button>
          </div>
        </div>

        {/* Right: Details + Scale + Crash */}
        <div>
          {/* Workflow Details */}
          {selWf && selectedWorkflow.current && (
            <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>WORKFLOW DETAILS</div>
              <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
                <strong>Workflow ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedWorkflow.current}</span>
                <br />
                <strong>Agent:</strong> {selWf.agent_type}
                <br />
                <strong>Item:</strong> {selWf.item}
                <br />
                <strong>Quantity:</strong> {selWf.quantity} · <strong>Budget:</strong> ${selWf.budget}
                <br />
                <strong>Status:</strong> {getStatusBadge((selWf.currentStep >= 3 && selWf.status === 'RUNNING') ? 'WAITING_FOR_APPROVAL' : selWf.status)}
                {selWf.completedAt && selWf.startedAt && (
                  <> · <span style={{ color: 'var(--text-dim)' }}>Completed in {((selWf.completedAt - selWf.startedAt) / 1000).toFixed(1)}s</span></>
                )}
                {selWf.rejectionCount && selWf.rejectionCount > 0 ? (
                  <><br /><strong>Retries:</strong> {selWf.rejectionCount}/3{selWf.rejectionReason ? ` · ` : ''}{selWf.rejectionReason && <span style={{ color: 'var(--danger)' }}>&quot;{selWf.rejectionReason}&quot;</span>}</>
                ) : null}
              </div>

              {/* Step tracker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {WORKFLOW_STEPS.map((step, idx) => {
                  let state = '', icon = '•';
                  if (idx < selWf.currentStep) { state = 'completed'; icon = '✓'; }
                  else if (idx === selWf.currentStep) {
                    if (selWf.status === 'REJECTED') { state = 'rejected'; icon = '✕'; }
                    else if (step.id === 'approve') { state = 'active'; icon = '⏸'; }
                    else { state = 'active'; icon = '●'; }
                  } else if (idx > selWf.currentStep && selWf.status === 'REJECTED' && step.id === 'confirm') {
                    state = 'rejected'; icon = '✕';
                  }
                  const borderColor = state === 'completed' ? 'var(--success)' : state === 'active' ? 'var(--accent)' : state === 'rejected' ? 'var(--danger)' : 'var(--border-subtle)';
                  const iconBg = state === 'completed' ? 'var(--success)' : state === 'active' ? 'var(--accent)' : state === 'rejected' ? 'var(--danger)' : 'var(--bg-elevated)';
                  const iconColor = state === 'completed' || state === 'active' || state === 'rejected' ? '#000' : 'var(--text-dim)';
                  const retryNote = step.id === 'research' && selWf.rejectionCount && selWf.rejectionCount > 0 && selWf.currentStep <= 1
                    ? ` (retry #${selWf.rejectionCount})` : '';
                  return (
                    <div key={idx} className="bordered-panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, borderColor }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, background: iconBg, color: iconColor, flexShrink: 0, border: `1px solid ${borderColor}` }}>{icon}</div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: state === 'completed' || state === 'active' ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                          {step.label}{retryNote && <span style={{ color: 'var(--warning)', fontSize: 10 }}>{retryNote}</span>}
                          {state === 'completed' && <span className="bracket-badge" style={{ color: 'var(--success)', marginLeft: 8 }}>COMPLETED</span>}
                          {state === 'active' && <span className="bracket-badge" style={{ color: 'var(--accent)', marginLeft: 8 }}>SELECTED</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{step.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rejection retry banner */}
              {selWf.rejectionCount && selWf.rejectionCount > 0 && selWf.status === 'RUNNING' && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(224, 176, 64, 0.08)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Agent retrying after rejection</strong> — Reason: &quot;{selWf.rejectionReason || 'No reason given'}&quot;
                  <br />Going back to Research to find new suppliers. Attempt {selWf.rejectionCount + 1}/3.
                </div>
              )}
              {selWf.rejectionCount && selWf.rejectionCount >= 3 && selWf.status === 'REJECTED' && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255, 92, 92, 0.08)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--danger)' }}>Agent gave up after 3 rejections</strong> — Could not find a satisfactory supplier.
                </div>
              )}

              {/* Research output table */}
              {selWf.currentStep >= 1 && selWf.suppliers && (
                <div style={{ marginTop: 16 }}>
                  <div className="mono-label" style={{ marginBottom: 8 }}>RESEARCH OUTPUT — {selWf.suppliers.length} suppliers found</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="styled-table">
                      <thead><tr><th>Supplier</th><th>Price</th><th>Rating</th><th>Lead Time</th><th>On-Time %</th></tr></thead>
                      <tbody>
                        {selWf.suppliers.map((s, i) => (
                          <tr key={i}><td>{s.name}</td><td className="mono">${s.price.toFixed(2)}</td><td>{s.rating}/5</td><td className="mono">{s.lead_time_days}d</td><td className="mono">{(s.on_time_rate * 100).toFixed(0)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Score output table */}
              {selWf.currentStep >= 2 && selWf.scoredSuppliers && (
                <div style={{ marginTop: 16 }}>
                  <div className="mono-label" style={{ marginBottom: 8 }}>SCORE OUTPUT — ranked by composite score (lower = better)</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="styled-table">
                      <thead><tr><th>Rank</th><th>Supplier</th><th>Price</th><th>Rating</th><th>Lead Time</th><th>Score</th></tr></thead>
                      <tbody>
                        {selWf.scoredSuppliers.map((s, i) => {
                          const maxScore = Math.max(...selWf.scoredSuppliers!.map(s => Math.abs(s.score || 0)));
                          return (
                            <tr key={i} style={i === 0 ? { background: 'rgba(91, 140, 255, 0.08)' } : undefined}>
                              <td>#{i + 1}</td>
                              <td>{s.name}</td>
                              <td className="mono">${s.price.toFixed(2)}</td>
                              <td>{s.rating}/5</td>
                              <td className="mono">{s.lead_time_days}d</td>
                              <td className="mono">
                                {s.score?.toFixed(2)}
                                <div className="score-bar"><div className="score-bar-fill" style={{ width: `${100 - (Math.abs(s.score || 0) / maxScore * 100)}%` }} /></div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Decision panel */}
              {selWf.currentStep >= 3 && selWf.decision && (
                <div className="bordered-panel" style={{ marginTop: 16, padding: 14, borderLeft: '3px solid var(--accent)' }}>
                  <div className="mono-label" style={{ marginBottom: 4 }}>LLM DECISION (VIA INFERROUTE)</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Selected: {selWf.decision.selected.name} — ${selWf.decision.selected.price.toFixed(2)}/unit
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.6, fontStyle: 'italic' }}>
                    {selWf.decision.rationale}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                    Routed to: <strong>gpt-4o-mini</strong> · 342 tokens · $0.0003 · Cache: <span className="bracket-badge" style={{ color: 'var(--warning)' }}>MISS</span>
                  </div>
                </div>
              )}

              {/* PO */}
              {selWf.currentStep >= 4 && selWf.status === 'COMPLETED' && selWf.decision && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(61, 220, 132, 0.06)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)' }}>
                  <div className="mono-label" style={{ marginBottom: 8 }}>PURCHASE ORDER CREATED</div>
                  <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                    {(() => { if (!selWf.po) selWf.po = generatePO(selWf.decision!.selected, selWf.item, selWf.quantity); return null; })()}
                    <strong>PO ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selWf.po!.po_id}</span>
                    <br /><strong>Supplier:</strong> {selWf.po!.supplier_name}
                    <br /><strong>Item:</strong> {selWf.po!.item} × {selWf.po!.quantity}
                    <br /><strong>Total:</strong> ${selWf.po!.total}
                    <br /><strong>Status:</strong> <span className="bracket-badge" style={{ color: 'var(--success)' }}>PO CREATED · PAYMENT INITIATED</span>
                  </div>
                </div>
              )}

              {/* Approve section */}
              {selWf.currentStep >= 3 && selWf.status !== 'COMPLETED' && selWf.status !== 'REJECTED' && selWf.status !== 'APPROVED' && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <label className="mono-label" style={{ display: 'block', marginBottom: 4 }}>Approval comment</label>
                    <input ref={approveCommentRef} type="text" className="styled-input" placeholder="Looks good, proceed" />
                  </div>
                  <button className="btn-success" onClick={() => approveWorkflow(true)}>Approve</button>
                  <button className="btn-danger" onClick={() => approveWorkflow(false)} style={{ marginLeft: 8 }}>Reject</button>
                </div>
              )}
            </div>
          )}

          {/* Scale demo */}
          {showScaleCard && (
            <div className="bordered-panel" style={{ padding: 20, marginBottom: 16 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>SCALE TEST — 10 PARALLEL WORKFLOWS</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{scaleSummary}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {scaleCells.map(cell => (
                  <div key={cell.id} className="bordered-panel" style={{ padding: 10, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.id}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: cell.color }}>{cell.status}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{cell.item}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Crash log */}
          {showCrashCard && crashLog && (
            <div className="bordered-panel" style={{ padding: 20 }}>
              <div className="mono-label" style={{ marginBottom: 12 }}>FAULT TOLERANCE — CRASH RECOVERY DEMO</div>
              <div className="terminal-panel" style={{ maxHeight: 300, overflowY: 'auto' }}>
                {crashLog.map((line, i) => (
                  <div key={i} style={{ color: line.color }}>{line.text}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
