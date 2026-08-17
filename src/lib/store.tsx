'use client';

import { createContext, useContext, useRef, useCallback, useState, ReactNode } from 'react';

export const INFERROUTE = process.env.NEXT_PUBLIC_INFERROUTE_URL || 'http://localhost:8070';
export const AGENTMESH = process.env.NEXT_PUBLIC_AGENTMESH_URL || 'http://localhost:8000';

export interface Supplier {
  name: string;
  price: number;
  rating: number;
  lead_time_days: number;
  on_time_rate: number;
  item: string;
  quote: { unit_price: number; total: number; currency: string };
  rating_info: { on_time_rate: number; total_orders: number };
  score?: number;
}

export interface Workflow {
  agent_type: string;
  item: string;
  quantity: number;
  budget: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'APPROVED';
  currentStep: number;
  startedAt: number;
  completedAt?: number;
  suppliers: Supplier[] | null;
  scoredSuppliers: Supplier[] | null;
  decision: { selected: Supplier; rationale: string } | null;
  po: { po_id: string; supplier_name: string; item: string; quantity: number; unit_price: number; total: string; status: string } | null;
  backendWorkflowId?: string;
  isScaleDemo?: boolean;
  rejectionCount?: number;
  rejectionReason?: string;
  approvalComment?: string;
}

export interface UploadedDoc {
  ns: string;
  id: string;
  content: string;
}

export interface TraceSpan {
  span_id: string;
  parent_id: string | null;
  service: string;
  name: string;
  duration_ms: number;
  attributes: Record<string, string | number | boolean>;
}

export const WORKFLOW_STEPS = [
  { id: 'research', label: 'Research', detail: 'Query suppliers, get quotes, check ratings' },
  { id: 'score', label: 'Score', detail: 'Rank suppliers by price, rating, lead time' },
  { id: 'decide', label: 'Decide', detail: 'LLM selects the best supplier' },
  { id: 'approve', label: 'Approve', detail: 'Human checkpoint review' },
  { id: 'confirm', label: 'Confirm', detail: 'Finalize and return result' },
];

export const SUPPLIER_POOL = [
  { name: 'Shenzhen TechHub', price: 3.20, rating: 4.5, lead_time_days: 7, on_time_rate: 0.95 },
  { name: 'GlobalParts Inc', price: 4.10, rating: 4.8, lead_time_days: 3, on_time_rate: 0.98 },
  { name: 'Acme Supplies', price: 2.80, rating: 3.2, lead_time_days: 14, on_time_rate: 0.78 },
  { name: 'FastTrade Co', price: 4.50, rating: 4.9, lead_time_days: 2, on_time_rate: 0.99 },
  { name: 'BudgetSource Ltd', price: 2.10, rating: 2.8, lead_time_days: 21, on_time_rate: 0.65 },
  { name: 'PrimeElectronics', price: 3.75, rating: 4.3, lead_time_days: 5, on_time_rate: 0.92 },
  { name: 'Omega Distributors', price: 4.20, rating: 4.6, lead_time_days: 4, on_time_rate: 0.94 },
  { name: 'QuickShip Supply', price: 3.95, rating: 4.1, lead_time_days: 6, on_time_rate: 0.88 },
];

export const ITEMS = ['USB-C cable', 'HDMI cable', 'Power adapter', 'Ethernet cable', 'USB hub', 'Wireless mouse', 'Bluetooth keyboard', 'USB flash drive', 'Laptop stand', 'Webcam'];

export function generateSuppliers(item: string, _budget: number): Supplier[] {
  const pool = [...SUPPLIER_POOL].sort(() => Math.random() - 0.5);
  const selected = pool.slice(0, 4 + Math.floor(Math.random() * 3));
  return selected.map(s => ({
    ...s,
    item,
    quote: { unit_price: s.price, total: s.price * 100, currency: 'USD' },
    rating_info: { on_time_rate: s.on_time_rate, total_orders: Math.floor(Math.random() * 500) + 50 },
  }));
}

export function scoreSuppliers(suppliers: Supplier[]): Supplier[] {
  return suppliers.map(s => {
    const score = s.price * 0.4 - s.rating * 0.3 - s.on_time_rate * 0.2 + s.lead_time_days * 0.1;
    return { ...s, score: parseFloat(score.toFixed(2)) };
  }).sort((a, b) => (a.score || 0) - (b.score || 0));
}

export function generateDecision(scored: Supplier[], _item: string, budget: number) {
  const best = scored[0];
  const rationales = [
    `${best.name} offers the best balance of price ($${best.price}/unit), rating (${best.rating}/5), and lead time (${best.lead_time_days} days). At $${(best.price * 100).toFixed(2)} for 100 units, it's well under the $${(budget * 100).toFixed(2)} budget. Their ${best.on_time_rate * 100}% on-time rate is excellent.`,
    `Selected ${best.name} based on combined scoring. While not the cheapest, their ${best.rating}/5 rating and ${best.lead_time_days}-day delivery provide the best value. Total cost: $${(best.price * 100).toFixed(2)} vs budget $${(budget * 100).toFixed(2)}.`,
    `${best.name} wins on the composite score. Price of $${best.price}/unit is within budget, and their ${best.on_time_rate * 100}% on-time delivery rate minimizes supply chain risk. Lead time of ${best.lead_time_days} days meets our deadline.`,
  ];
  return {
    selected: best,
    rationale: rationales[Math.floor(Math.random() * rationales.length)],
  };
}

export function generatePO(supplier: Supplier, item: string, quantity: number) {
  return {
    po_id: `PO-${Date.now().toString(36).toUpperCase()}`,
    supplier_name: supplier.name,
    item,
    quantity,
    unit_price: supplier.price,
    total: (supplier.price * quantity).toFixed(2),
    status: 'created',
  };
}

export function getSimulatedTraceSpans(workflowId: string): TraceSpan[] {
  return [
    { span_id: 'root', parent_id: null, service: 'agentmesh-gateway', name: 'gateway.start_workflow', duration_ms: 15, attributes: { agent_type: 'sourcing_agent', workflow_id: workflowId, http_method: 'POST', http_url: '/workflows' } },
    { span_id: 'wf-run', parent_id: 'root', service: 'agentmesh-worker', name: 'workflow.run (Temporal)', duration_ms: 3200, attributes: { workflow_type: 'SourcingWorkflow', task_queue: 'sourcing-task-queue', workflow_status: 'RUNNING' } },
    { span_id: 'act-1', parent_id: 'wf-run', service: 'agentmesh-worker', name: 'activity.run_graph_until_interrupt', duration_ms: 2800, attributes: { activity_type: 'run_graph_until_interrupt', retry_policy: 'aggressive' } },
    { span_id: 'node-research', parent_id: 'act-1', service: 'agentmesh-worker', name: 'langgraph.node.research', duration_ms: 850, attributes: { node: 'research', tool: 'query_suppliers', suppliers_found: 5 } },
    { span_id: 'node-score', parent_id: 'act-1', service: 'agentmesh-worker', name: 'langgraph.node.score', duration_ms: 120, attributes: { node: 'score', scoring_criteria: 'price,rating,lead_time' } },
    { span_id: 'node-decide', parent_id: 'act-1', service: 'agentmesh-worker', name: 'langgraph.node.decide', duration_ms: 1800, attributes: { node: 'decide', llm_provider: 'inferroute', past_decisions_queried: 2 } },
    { span_id: 'inferroute-call', parent_id: 'node-decide', service: 'inferroute-gateway', name: 'POST /v1/chat/completions', duration_ms: 1700, attributes: { service: 'infer-route', w3c_traceparent: 'propagated from agentmesh-worker' } },
    { span_id: 'ir-classify', parent_id: 'inferroute-call', service: 'inferroute-gateway', name: 'routing.classify_complexity', duration_ms: 2, attributes: { complexity: 'medium', tier: 'standard', strategy: 'intelligence_aware', source: 'heuristic' } },
    { span_id: 'ir-cache', parent_id: 'inferroute-call', service: 'inferroute-gateway', name: 'cache.lookup', duration_ms: 4, attributes: { exact_cache: 'miss', semantic_cache: 'miss', coalescer: 'n/a' } },
    { span_id: 'ir-provider', parent_id: 'inferroute-call', service: 'inferroute-gateway', name: 'provider.call', duration_ms: 1680, attributes: { provider: 'openai', model: 'gpt-4o-mini', input_tokens: 342, output_tokens: 180, cost: '$0.000051', cache_hit: false } },
    { span_id: 'node-approve', parent_id: 'wf-run', service: 'agentmesh-worker', name: 'langgraph.node.approve (interrupt)', duration_ms: 0, attributes: { node: 'approve', checkpoint: 'interrupt()', waiting_for: 'human signal', zero_worker_cost: true } },
    { span_id: 'node-confirm', parent_id: 'wf-run', service: 'agentmesh-worker', name: 'langgraph.node.confirm', duration_ms: 350, attributes: { node: 'confirm', po_created: true, payment_initiated: true } },
  ];
}

export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

interface StoreContextType {
  activeWorkflows: React.MutableRefObject<Record<string, Workflow>>;
  uploadedDocs: React.MutableRefObject<UploadedDoc[]>;
  traceSpans: React.MutableRefObject<TraceSpan[]>;
  selectedWorkflow: React.MutableRefObject<string | null>;
  forceUpdate: () => void;
  version: number;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const activeWorkflows = useRef<Record<string, Workflow>>({});
  const uploadedDocs = useRef<UploadedDoc[]>([]);
  const traceSpans = useRef<TraceSpan[]>([]);
  const selectedWorkflow = useRef<string | null>(null);
  const [version, setVersion] = useState(0);

  const forceUpdate = useCallback(() => setVersion(v => v + 1), []);

  return (
    <StoreContext.Provider value={{ activeWorkflows, uploadedDocs, traceSpans, selectedWorkflow, forceUpdate, version }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
