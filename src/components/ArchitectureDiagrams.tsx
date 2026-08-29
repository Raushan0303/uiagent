'use client';

/**
 * Visual system diagrams for the Architecture page.
 *
 * Design goals: a reader should parse the *shape* of the system in under
 * 10 seconds — animated connectors carry the request flow, database
 * cylinders make shared storage instantly recognizable, numbered badges
 * order the pipeline, and tinted domain zones show ownership boundaries.
 * Fine detail (per-request pipeline steps) lives in the attached callout.
 */

const FONT = 'var(--font-mono, ui-monospace, monospace)';

/* Hex palette — used only where CSS vars can't reach (SVG filter flood-color,
 * gradient stops). Strokes/fills elsewhere stay on the theme's CSS vars. */
const HEX = {
  blue: '#5b8cff',
  green: '#3ddc84',
  yellow: '#e0b040',
  red: '#ff5c5c',
  purple: '#b48cff',
};

/* ── defs helpers ──────────────────────────────────────────────────────── */

function ArrowDefs({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill={color} />
      </marker>
    </defs>
  );
}

/** Soft colored glow behind key boxes (main pipeline nodes, circuit breaker). */
function GlowDefs({ id, hex }: { id: string; hex: string }) {
  return (
    <defs>
      <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={hex} floodOpacity="0.30" />
      </filter>
    </defs>
  );
}

/** Vertical tint gradient for a domain zone background. */
function ZoneGradDefs({ id, hex }: { id: string; hex: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={hex} stopOpacity="0.13" />
        <stop offset="100%" stopColor={hex} stopOpacity="0.03" />
      </linearGradient>
    </defs>
  );
}

/* ── shape helpers ─────────────────────────────────────────────────────── */

function Box({
  x,
  y,
  w,
  h,
  label,
  sub,
  color = 'var(--accent)',
  dashed = false,
  fontSize = 12,
  bold = false,
  glow,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  color?: string;
  dashed?: boolean;
  fontSize?: number;
  /** Larger stroke + weight, for main-pipeline boxes vs. nested/child boxes. */
  bold?: boolean;
  /** Optional glow filter id (see GlowDefs) for hero nodes. */
  glow?: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={bold ? 10 : 8}
        fill="var(--bg-panel-alt, #161616)"
        stroke={color}
        strokeWidth={bold ? 2.25 : 1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        style={glow ? { filter: `url(#${glow})` } : undefined}
      />
      {/* top glass highlight */}
      <line x1={x + 10} y1={y + 1} x2={x + w - 10} y2={y + 1} stroke="#ffffff" strokeOpacity={0.14} strokeWidth={1} />
      <text
        x={x + w / 2}
        y={y + (sub ? h / 2 - 6 : h / 2 + 4)}
        textAnchor="middle"
        fontSize={bold ? fontSize + 1.5 : fontSize}
        fontWeight={bold ? 700 : 600}
        fontFamily={FONT}
        fill="var(--text-primary, #f5f5f5)"
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          fontSize={fontSize - 2}
          fontFamily={FONT}
          fill="var(--text-dim, #6b6b6b)"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

/** Database cylinder — the shape every engineer reads as "storage". */
function DbShape({
  x,
  y,
  w,
  h,
  label,
  sub,
  color,
  glow,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  color: string;
  glow?: string;
}) {
  const rx = w / 2;
  const ry = 11;
  const top = y + ry;
  const bottom = y + h - ry;
  return (
    <g style={glow ? { filter: `url(#${glow})` } : undefined}>
      <path
        d={`M ${x} ${top} L ${x} ${bottom} A ${rx} ${ry} 0 0 0 ${x + w} ${bottom} L ${x + w} ${top} Z`}
        fill="var(--bg-panel-alt, #161616)"
        stroke={color}
        strokeWidth={1.5}
      />
      <ellipse cx={x + rx} cy={top} rx={rx} ry={ry} fill="var(--bg-elevated, #1a1a1c)" stroke={color} strokeWidth={1.5} />
      <text x={x + rx} y={y + h / 2 + 1} textAnchor="middle" fontSize={11.5} fontWeight={700} fontFamily={FONT} fill="var(--text-primary)">
        {label}
      </text>
      {sub && (
        <text x={x + rx} y={y + h / 2 + 15} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill="var(--text-dim)">
          {sub}
        </text>
      )}
    </g>
  );
}

/** Numbered step badge pinned to the left edge of a pipeline box. */
function NumBadge({ x, y, n, color }: { x: number; y: number; n: number | string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.5} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily={FONT} fill={color}>
        {n}
      </text>
    </g>
  );
}

/** Tinted rounded-rect background for a domain zone, with gradient + caption. */
function ZoneRect({
  x,
  y,
  w,
  h,
  label,
  color,
  gradId,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  gradId: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16} fill={`url(#${gradId})`} stroke={color} strokeOpacity={0.4} strokeWidth={1} />
      <text x={x + 16} y={y + 22} fontSize={10} fontFamily={FONT} fill={color} letterSpacing="0.08em" fontWeight={700}>
        {label}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  color = 'var(--text-dim)',
  dashed = false,
  markerId,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  dashed?: boolean;
  markerId: string;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '4 3' : undefined}
      markerEnd={`url(#${markerId})`}
    />
  );
}

/** Orthogonal (right-angle) multi-segment connector — routes around boxes
 * cleanly instead of drawing diagonal lines that cross other elements. */
function Elbow({
  points,
  color = 'var(--text-dim)',
  dashed = false,
  markerId,
  flow = false,
}: {
  points: [number, number][];
  color?: string;
  dashed?: boolean;
  markerId?: string;
  /** Animate the dashes so the line reads as moving traffic. */
  flow?: boolean;
}) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '4 3' : flow ? '7 9' : undefined}
      className={flow ? 'svg-flow' : undefined}
      markerEnd={markerId ? `url(#${markerId})` : undefined}
    />
  );
}

/** Live-traffic connector: faint solid guide + animated dashes on top. */
function FlowLine({
  points,
  color,
  markerId,
  width = 2,
}: {
  points: [number, number][];
  color: string;
  markerId?: string;
  width?: number;
}) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  return (
    <>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={width} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray="7 9"
        className="svg-flow"
        markerEnd={markerId ? `url(#${markerId})` : undefined}
      />
    </>
  );
}

/* ── diagrams ──────────────────────────────────────────────────────────── */

/**
 * AgentMesh tab — Gateway -> Temporal -> Task Queue -> Workers -> Circuit
 * Breaker -> Activities, with the human-approval activity branching off.
 * Numbered badges order the hops; the circuit breaker glows as the hero node.
 */
export function AgentMeshDiagram() {
  const y = 60;
  const h = 56;
  const blue = 'var(--accent)';
  const danger = 'var(--danger)';

  const steps = [
    { x: 10, w: 140, label: 'Gateway', sub: 'starts workflow', color: blue },
    { x: 190, w: 190, label: 'Temporal Server', sub: 'Frontend / History / Matching', color: blue, fontSize: 11 },
    { x: 420, w: 130, label: 'Task Queue', color: blue },
    { x: 590, w: 150, label: 'Workers', sub: 'N instances, scale out', color: blue },
    { x: 780, w: 130, label: 'Circuit Breaker', sub: 'tool calls only', color: danger, fontSize: 11, glow: 'glow-red' },
    { x: 950, w: 120, label: 'Activities', sub: 'LLM + tool calls', color: 'var(--success)' },
  ];

  return (
    <div className="bordered-panel" style={{ padding: '20px 16px', marginBottom: 32 }}>
      <div style={{ fontSize: 10, fontFamily: FONT, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Request path — one workflow, start to finish
      </div>
      <svg viewBox="0 0 1080 240" width="100%" style={{ maxWidth: 1080, display: 'block', margin: '0 auto' }} role="img" aria-label="AgentMesh system diagram: Gateway to Temporal Server to Task Queue to Workers to Circuit Breaker to Activities, with human approval branching off as a zero-cost wait.">
        <ArrowDefs id="am-arrow" color="var(--text-dim, #6b6b6b)" />
        <ArrowDefs id="am-arrow-blue" color={blue} />
        <ArrowDefs id="am-arrow-red" color={danger} />
        <GlowDefs id="glow-red" hex={HEX.red} />

        {steps.map((s, i) => (
          <g key={s.label}>
            <Box x={s.x} y={y} w={s.w} h={h} label={s.label} sub={s.sub} color={s.color} fontSize={s.fontSize ?? 12} glow={s.glow} />
            {/* badge sits on the top-left corner, clear of the label text */}
            <NumBadge x={s.x} y={y} n={i + 1} color={s.color} />
            {i < steps.length - 1 && (
              <FlowLine
                points={[[s.x + s.w, y + h / 2], [steps[i + 1].x, y + h / 2]]}
                color={s.color === danger ? danger : blue}
                markerId={s.color === danger ? 'am-arrow-red' : 'am-arrow-blue'}
              />
            )}
          </g>
        ))}

        {/* Branch: human approval, dotted, zero worker cost */}
        <Arrow x1={665} y1={y + h} x2={665} y2={170} dashed markerId="am-arrow" color="var(--warning)" />
        <Box x={565} y={172} w={200} h={48} label="Human approval" sub="dotted branch" color="var(--warning)" dashed fontSize={11} />
        <text x={665} y={238} textAnchor="middle" fontSize={11} fontFamily={FONT} fill="var(--warning)">
          waits — zero worker cost
        </text>
      </svg>
    </div>
  );
}

/**
 * Wiring Together tab — full request path from client through AgentMesh,
 * Temporal, InferRoute, providers, and the shared Postgres/Redis infra.
 *
 * Layout: two stacked domain zones on the left (AgentMesh on top, InferRoute
 * below) and a tall "Shared Infrastructure" zone on the right that both
 * domains tap into with short orthogonal connectors — never one line
 * snaking around the whole canvas, and nothing crosses through another box.
 * A corner legend and an attached callout panel (with a real pointer arrow)
 * round out the fine detail without cluttering the top-level scan.
 */
export function WiringDiagram() {
  const blue = 'var(--accent)';
  const green = 'var(--success)';
  const yellow = 'var(--warning)';
  const purple = 'var(--purple)';
  const dim = 'var(--text-dim, #6b6b6b)';
  const cx = 330; // shared center-x for the main left-column spine

  return (
    <div className="bordered-panel" style={{ padding: '20px 16px', marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontFamily: FONT, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Full request path — client to provider, with shared infra
      </div>
      <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox="0 0 950 1010"
        width="100%"
        style={{ maxWidth: 900, minWidth: 720, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Wiring diagram with three zones. AgentMesh domain (blue): Client, Gateway, Temporal Server, Workers, and five activity sub-boxes (research, score, decide, approve, confirm). The decide activity makes an LLM call into the InferRoute domain (green): Load Balancer, InferRoute instances, and three LLM providers (OpenAI, Groq, vLLM). The approve activity waits for a human with zero worker cost. Shared Infrastructure: Temporal writes workflow state to Postgres, InferRoute instances write to Redis for cache and quota and to Postgres for RAG and usage logging. A callout panel below lists the seven-step per-request pipeline."
      >
        <ArrowDefs id="w-arrow-blue" color={blue} />
        <ArrowDefs id="w-arrow-green" color={green} />
        <ArrowDefs id="w-arrow-yellow" color={yellow} />
        <ArrowDefs id="w-arrow-purple" color={purple} />
        <ArrowDefs id="w-arrow-dim" color={dim} />
        <GlowDefs id="glow-blue" hex={HEX.blue} />
        <GlowDefs id="glow-green" hex={HEX.green} />
        <GlowDefs id="glow-purple" hex={HEX.purple} />
        <GlowDefs id="glow-yellow" hex={HEX.yellow} />
        <ZoneGradDefs id="zone-blue" hex={HEX.blue} />
        <ZoneGradDefs id="zone-green" hex={HEX.green} />
        <ZoneGradDefs id="zone-purple" hex={HEX.purple} />

        {/* ══ Zone backgrounds ══ */}
        <ZoneRect x={60} y={55} w={520} h={400} label="AGENTMESH DOMAIN" color={blue} gradId="zone-blue" />
        <ZoneRect x={60} y={480} w={520} h={255} label="INFERROUTE DOMAIN" color={green} gradId="zone-green" />
        <ZoneRect x={615} y={135} w={295} h={600} label="SHARED INFRASTRUCTURE" color={purple} gradId="zone-purple" />

        {/* ══ Corner legend ══ */}
        <g>
          <rect x={630} y={15} width={260} height={104} rx={8} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          <text x={642} y={32} fontSize={9} fontFamily={FONT} fill="var(--text-dim)" letterSpacing="0.06em" fontWeight={700}>LEGEND</text>
          <circle cx={646} cy={46} r={4} fill={blue} /><text x={656} y={50} fontSize={10} fontFamily={FONT} fill="var(--text-secondary)">AgentMesh domain</text>
          <circle cx={646} cy={62} r={4} fill={green} /><text x={656} y={66} fontSize={10} fontFamily={FONT} fill="var(--text-secondary)">InferRoute domain</text>
          <circle cx={646} cy={78} r={4} fill={purple} /><text x={656} y={82} fontSize={10} fontFamily={FONT} fill="var(--text-secondary)">Shared infra (Redis/PG)</text>
          <line x1={642} y1={95} x2={666} y2={95} stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="7 9" className="svg-flow" />
          <text x={672} y={99} fontSize={10} fontFamily={FONT} fill="var(--text-secondary)">request flow</text>
          <line x1={780} y1={95} x2={804} y2={95} stroke={yellow} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={810} y={99} fontSize={10} fontFamily={FONT} fill="var(--text-secondary)">async / wait</text>
        </g>

        {/* ═══════════ AGENTMESH DOMAIN ═══════════
            All main-pipeline boxes share two widths: 400 (normal) or 480 (parent boxes),
            centered on cx=330. Heights are all 46. Arrows land flush on box edges. */}

        {/* Client (external actor, sits outside every domain) */}
        <Box x={cx - 120} y={10} w={240} h={44} label="Client" color={blue} />
        <NumBadge x={cx - 102} y={32} n={1} color={blue} />
        <FlowLine points={[[cx, 54], [cx, 93]]} color={blue} markerId="w-arrow-blue" />

        <Box x={cx - 200} y={95} w={400} h={46} label="AgentMesh Gateway" sub="port 8000" color={blue} bold fontSize={12} />
        <NumBadge x={cx - 182} y={118} n={2} color={blue} />
        <FlowLine points={[[cx, 141], [cx, 159]]} color={blue} markerId="w-arrow-blue" />

        <Box x={cx - 200} y={161} w={400} h={46} label="Temporal Server" sub="Frontend / History / Matching" color={blue} bold fontSize={12} glow="glow-blue" />
        <NumBadge x={cx - 182} y={184} n={3} color={blue} />
        <FlowLine points={[[cx, 207], [cx, 225]]} color={blue} markerId="w-arrow-blue" />

        <Box x={cx - 240} y={227} w={480} h={46} label="AgentMesh Workers" sub="N instances, horizontally scalable" color={blue} bold fontSize={13} glow="glow-blue" />
        <NumBadge x={cx - 222} y={250} n={4} color={blue} />

        {/* Nested "activities" child panel — smaller chips, even 16px padding, 8px gaps */}
        <rect x={113} y={281} width={434} height={78} rx={8} fill="var(--bg-void)" fillOpacity={0.35} stroke={blue} strokeOpacity={0.3} strokeDasharray="2 3" />
        <text x={125} y={296} fontSize={8.5} fontFamily={FONT} fill="var(--text-dim)" letterSpacing="0.06em">ACTIVITIES (sequential, per workflow)</text>

        <g fontFamily={FONT} fontSize={9.5} fill="var(--text-secondary)">
          <rect x={129} y={304} width={76} height={32} rx={6} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          <text x={167} y={324} textAnchor="middle">research</text>
          <rect x={213} y={304} width={68} height={32} rx={6} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          <text x={247} y={324} textAnchor="middle">score</text>
          <rect x={289} y={304} width={68} height={32} rx={6} fill="var(--bg-panel-alt)" stroke={green} />
          <text x={323} y={324} textAnchor="middle" fill={green}>decide</text>
          <rect x={365} y={304} width={90} height={32} rx={6} fill="var(--bg-panel-alt)" stroke={yellow} strokeDasharray="4 3" />
          <text x={410} y={324} textAnchor="middle" fill={yellow}>approve</text>
          <rect x={463} y={304} width={68} height={32} rx={6} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          <text x={497} y={324} textAnchor="middle">confirm</text>
        </g>

        {/* Branch 1: decide -> LLM call -> InferRoute domain (live request flow, exits the zone) */}
        <FlowLine points={[[323, 336], [323, 513]]} color={green} markerId="w-arrow-green" />
        <text x={323} y={425} textAnchor="middle" fontSize={10} fontFamily={FONT} fill={green} fontWeight={600}>LLM call</text>

        {/* Branch 2: approve -> waits on a human (async, dashed, stays local — separate arrow + label) */}
        <Elbow points={[[410, 336], [410, 356]]} color={yellow} dashed />
        <circle cx={410} cy={360} r={3.5} fill="none" stroke={yellow} strokeWidth={1.5} />
        <text x={410} y={378} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={yellow}>approve — waits,</text>
        <text x={410} y={391} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={yellow}>zero worker cost</text>

        {/* ═══════════ INFERROUTE DOMAIN ═══════════ */}

        <Box x={cx - 200} y={515} w={400} h={46} label="InferRoute Load Balancer" color={green} bold fontSize={12} />
        <NumBadge x={cx - 182} y={538} n={5} color={green} />
        <FlowLine points={[[cx, 561], [cx, 577]]} color={green} markerId="w-arrow-green" />

        <Box x={cx - 240} y={579} w={480} h={46} label="InferRoute instances (1..N)" sub="stateless FastAPI" color={green} bold fontSize={13} glow="glow-green" />
        <NumBadge x={cx - 222} y={602} n={6} color={green} />

        {/* Provider fan-out — three real backends, each with its own tier */}
        <FlowLine points={[[160, 625], [160, 673]]} color={green} markerId="w-arrow-green" width={1.5} />
        <FlowLine points={[[320, 625], [320, 673]]} color={green} markerId="w-arrow-green" width={1.5} />
        <FlowLine points={[[480, 625], [480, 673]]} color={green} markerId="w-arrow-green" width={1.5} />
        <Box x={90} y={675} w={140} h={44} label="OpenAI" sub="premium tier" color={green} fontSize={11} />
        <Box x={250} y={675} w={140} h={44} label="Groq" sub="standard tier" color={green} fontSize={11} />
        <Box x={410} y={675} w={140} h={44} label="vLLM" sub="cheap tier · self-hosted" color={green} fontSize={11} />

        {/* ═══════════ SHARED INFRASTRUCTURE ═══════════
            Each connector runs in its own lane (x = 596 / 604 / 618) so no two lines
            overlap, and no label sits on top of a box — the cylinder sub-labels
            already carry the "what flows here" text. */}

        <DbShape x={642} y={170} w={240} h={60} label="Postgres" sub="workflow state · RAG · usage" color={purple} glow="glow-purple" />
        <DbShape x={642} y={560} w={240} h={60} label="Redis" sub="cache · quota · rate-limit" color={yellow} glow="glow-yellow" />

        {/* Temporal -> Postgres (workflow state): straight out, small jog, into the cylinder */}
        <Elbow points={[[cx + 200, 184], [596, 184], [596, 200], [642, 200]]} color={purple} markerId="w-arrow-purple" />

        {/* InferRoute instances -> Postgres (RAG + usage): exits above the Redis exit, so the
            Redis horizontal never crosses this vertical lane */}
        <Elbow points={[[cx + 240, 602], [604, 602], [604, 206], [642, 206]]} color={purple} markerId="w-arrow-purple" />

        {/* InferRoute instances -> Redis (cache/quota): its own lane to the right of the PG lane */}
        <Elbow points={[[cx + 240, 618], [618, 618], [618, 590], [642, 590]]} color={yellow} markerId="w-arrow-yellow" />

        {/* ═══════════ CALLOUT: per-request pipeline detail ═══════════ */}

        {/* Clean pointer arrow from Instances (left edge) around to the callout below — routed through the
            left margin so it never crosses the Providers boxes or either zone. */}
        <Elbow points={[[cx - 240, 602], [40, 602], [40, 862], [88, 862]]} color="var(--text-secondary)" markerId="w-arrow-dim" />
        <text x={56} y={594} textAnchor="end" fontSize={9.5} fontFamily={FONT} fill="var(--text-secondary)">per request:</text>

        <g>
          <rect x={90} y={800} width={820} height={150} rx={10} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          {/* pointer notch on the left edge, aligned with the incoming arrow */}
          <path d="M90,854 l-10,8 l10,8 Z" fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
          <text x={106} y={822} fontSize={10} fontFamily={FONT} fill="var(--text-dim)" letterSpacing="0.06em" fontWeight={700}>PER-REQUEST PIPELINE (detail)</text>
          <g fontFamily={FONT} fontSize={10.5} fill="var(--text-secondary)">
            <text x={106} y={846}>1. quota check <tspan fill={yellow}>(Redis)</tspan></text>
            <text x={106} y={866}>2. exact cache <tspan fill={yellow}>(Redis)</tspan></text>
            <text x={106} y={886}>3. semantic cache <tspan fill={yellow}>(Redis)</tspan></text>
            <text x={106} y={906}>4. RAG retrieval <tspan fill={purple}>(Postgres)</tspan></text>
            <text x={480} y={846}>5. classify complexity</text>
            <text x={480} y={866}>6. route to provider</text>
            <text x={480} y={886}>7. log usage <tspan fill={purple}>(Postgres)</tspan></text>
          </g>
        </g>
      </svg>
      </div>
    </div>
  );
}

/**
 * InferRoute tab — the per-request pipeline as a single visual flow:
 * ingress -> cache layers -> RAG -> classify/route (with circuit breaker
 * + failover) -> provider -> usage logging, with an animated "early return"
 * shortcut showing that 40-60% of requests never reach a provider at all.
 */
export function InferRouteDiagram() {
  const green = 'var(--success)';
  const yellow = 'var(--warning)';
  const purple = 'var(--purple)';
  const danger = 'var(--danger)';
  const rowY = 100;
  const rowH = 52;
  const midY = rowY + rowH / 2;

  type PipelineStep = {
    key: string;
    x: number;
    w: number;
    label: string;
    sub?: string;
    color: string;
    tag?: string;
    tagColor?: string;
    glow?: string;
  };

  const boxes: PipelineStep[] = [
    { key: 'request', x: 10, w: 90, label: 'Request', color: green },
    { key: 'quota', x: 130, w: 110, label: 'Quota check', color: green, tag: 'Redis', tagColor: yellow },
    { key: 'exact', x: 270, w: 120, label: 'Exact cache', color: green, tag: 'Redis', tagColor: yellow },
    { key: 'semantic', x: 420, w: 130, label: 'Semantic cache', color: green, tag: 'Redis', tagColor: yellow },
    { key: 'rag', x: 580, w: 130, label: 'RAG retrieval', sub: 'if namespace', color: green, tag: 'Postgres', tagColor: purple },
    { key: 'route', x: 740, w: 200, label: 'Classify + Route', sub: 'circuit breaker + failover', color: danger, glow: 'glow-red-ir' },
    { key: 'provider', x: 970, w: 150, label: 'Provider', sub: 'OpenAI · Groq · vLLM', color: green },
    { key: 'log', x: 1150, w: 120, label: 'Log usage', color: green, tag: 'Postgres', tagColor: purple },
    { key: 'response', x: 1300, w: 110, label: 'Response', color: green },
  ];

  const centerOf = (b: PipelineStep) => b.x + b.w / 2;
  const exact = boxes[2];
  const semantic = boxes[3];
  const response = boxes[8];
  const shortcutY = rowY + rowH + 78;

  return (
    <div className="bordered-panel" style={{ padding: '20px 16px', marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontFamily: FONT, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Per-request pipeline — every InferRoute call, left to right
      </div>
      <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 1440 ${shortcutY + 60}`}
        width="100%"
        style={{ maxWidth: 1280, minWidth: 900, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="InferRoute per-request pipeline: Request, Quota check (Redis), Exact cache (Redis), Semantic cache (Redis), RAG retrieval (Postgres, if namespace present), Classify and Route with circuit breaker and failover, Provider call to OpenAI Groq or vLLM, Log usage (Postgres), Response. An animated yellow shortcut shows cache hits on Exact or Semantic cache returning directly to Response, skipping RAG, routing, and the provider call, for roughly 40 to 60 percent of requests."
      >
        <ArrowDefs id="ir-arrow-green" color={green} />
        <ArrowDefs id="ir-arrow-yellow" color={yellow} />
        <GlowDefs id="glow-red-ir" hex={HEX.red} />

        {/* main chain */}
        {boxes.map((b, i) => (
          <g key={b.key}>
            <Box x={b.x} y={rowY} w={b.w} h={rowH} label={b.label} sub={b.sub} color={b.color} fontSize={11.5} glow={b.glow} />
            <NumBadge x={centerOf(b)} y={rowY - 18} n={i + 1} color={b.color} />
            {b.tag && (
              <>
                <line x1={centerOf(b)} y1={rowY + rowH} x2={centerOf(b)} y2={rowY + rowH + 10} stroke={b.tagColor} strokeWidth={1.5} />
                <text x={centerOf(b)} y={rowY + rowH + 22} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={b.tagColor}>{b.tag}</text>
              </>
            )}
            {i < boxes.length - 1 && (
              <FlowLine points={[[b.x + b.w, midY], [boxes[i + 1].x, midY]]} color={green} markerId="ir-arrow-green" width={1.5} />
            )}
          </g>
        ))}

        {/* cache-hit shortcut: Exact or Semantic cache hit returns straight to Response
            (animated yellow dashes — this is live traffic taking the fast path) */}
        <Elbow points={[[centerOf(exact) + 20, rowY + rowH], [centerOf(exact) + 20, shortcutY]]} color={yellow} dashed />
        <Elbow points={[[centerOf(semantic) + 25, rowY + rowH], [centerOf(semantic) + 25, shortcutY]]} color={yellow} dashed />
        <Elbow
          points={[
            [centerOf(exact) + 20, shortcutY],
            [centerOf(response), shortcutY],
            [centerOf(response), rowY + rowH],
          ]}
          color={yellow}
          flow
          markerId="ir-arrow-yellow"
        />
        <text x={(centerOf(exact) + centerOf(response)) / 2} y={shortcutY + 20} textAnchor="middle" fontSize={10.5} fontFamily={FONT} fill={yellow}>
          cache hit → return early, skip everything below (≈40–60% of requests)
        </text>
      </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 10.5, fontFamily: FONT, color: 'var(--text-dim)' }}>
        <span><span style={{ color: green }}>■</span> pipeline step</span>
        <span><span style={{ color: danger }}>■</span> resilience (circuit breaker / failover)</span>
        <span><span style={{ color: yellow }}>■</span> Redis</span>
        <span><span style={{ color: purple }}>■</span> Postgres</span>
      </div>
    </div>
  );
}

/**
 * AgentMesh tab — live example of a *hard* agent workload: an autonomous
 * hiring agent that screens, interviews, follows up, and selects candidates.
 *
 * This is the same engine as the sourcing agent (research/score/decide/
 * approve/confirm) applied to a higher-stakes loop: LLM nodes route through
 * InferRoute, tool nodes go through the MCP Tool Registry (schema-validated,
 * sandboxed, circuit-broken), a human checkpoint gates the offer, and a
 * CI-gated eval harness guards behavior changes.
 */
export function HiringAgentDiagram() {
  const blue = 'var(--accent)';
  const green = 'var(--success)';
  const yellow = 'var(--warning)';
  const purple = 'var(--purple)';
  const red = 'var(--danger)';
  const dim = 'var(--text-dim, #6b6b6b)';
  const rowY = 80;
  const rowH = 52;

  type Node = {
    key: string;
    x: number;
    w: number;
    label: string;
    sub?: string;
    color: string;
    kind?: 'llm' | 'tool' | 'human';
    dashed?: boolean;
  };

  const nodes: Node[] = [
    { key: 'trigger', x: 10, w: 120, label: 'New application', sub: 'webhook trigger', color: blue },
    { key: 'screen', x: 156, w: 120, label: 'Screen resume', color: green, kind: 'llm' },
    { key: 'score', x: 302, w: 120, label: 'Score rubric', sub: 'deterministic', color: blue },
    { key: 'schedule', x: 448, w: 120, label: 'Schedule interview', color: purple, kind: 'tool' },
    { key: 'interview', x: 594, w: 120, label: 'Interview', sub: 'multi-turn', color: green, kind: 'llm' },
    { key: 'review', x: 740, w: 120, label: 'Human review', sub: 'checkpoint', color: yellow, kind: 'human', dashed: true },
    { key: 'decide', x: 886, w: 120, label: 'Offer decision', color: green, kind: 'llm' },
    { key: 'offer', x: 1032, w: 120, label: 'Send offer', color: purple, kind: 'tool' },
  ];

  const cxOf = (n: Node) => n.x + n.w / 2;
  const screen = nodes[1];
  const score = nodes[2];
  const schedule = nodes[3];
  const interview = nodes[4];
  const review = nodes[5];
  const offer = nodes[7];

  return (
    <div className="bordered-panel" style={{ padding: '20px 16px', marginBottom: 32 }}>
      <div style={{ fontSize: 10, fontFamily: FONT, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Live example — autonomous hiring agent (same engine, harder problem)
      </div>
      <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox="0 0 1180 320"
        width="100%"
        style={{ maxWidth: 1180, minWidth: 900, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Autonomous hiring agent workflow: new application triggers resume screening (LLM), deterministic rubric scoring, interview scheduling via an MCP calendar tool, a multi-turn interview with a follow-up loop of at most three, a human review checkpoint that either loops back to screening with feedback or proceeds to an offer decision (LLM) and sending the offer via an MCP email tool. Low scores route to a polite rejection. All tool calls go through the MCP Tool Registry and are guarded by a CI-gated eval harness."
      >
        <ArrowDefs id="ha-arrow-blue" color={blue} />
        <ArrowDefs id="ha-arrow-green" color={green} />
        <ArrowDefs id="ha-arrow-yellow" color={yellow} />
        <ArrowDefs id="ha-arrow-red" color={red} />
        <ArrowDefs id="ha-arrow-purple" color={purple} />
        <GlowDefs id="glow-blue-ha" hex={HEX.blue} />
        <GlowDefs id="glow-green-ha" hex={HEX.green} />

        {/* main chain */}
        {nodes.map((n, i) => (
          <g key={n.key}>
            <Box x={n.x} y={rowY} w={n.w} h={rowH} label={n.label} sub={n.sub} color={n.color} fontSize={10.5} dashed={n.dashed} glow={n.kind === 'llm' ? 'glow-green-ha' : undefined} />
            {n.kind === 'llm' && (
              <text x={n.x + n.w - 4} y={rowY - 6} textAnchor="end" fontSize={8.5} fontWeight={700} fontFamily={FONT} fill={green}>LLM · InferRoute</text>
            )}
            {n.kind === 'tool' && (
              <text x={n.x + n.w - 4} y={rowY - 6} textAnchor="end" fontSize={8.5} fontWeight={700} fontFamily={FONT} fill={purple}>MCP tool</text>
            )}
            {i < nodes.length - 1 && (
              <FlowLine
                points={[[n.x + n.w, rowY + rowH / 2], [nodes[i + 1].x, rowY + rowH / 2]]}
                color={n.color === green ? green : blue}
                markerId={n.color === green ? 'ha-arrow-green' : 'ha-arrow-blue'}
                width={1.5}
              />
            )}
          </g>
        ))}

        {/* score gate -> polite rejection */}
        <Elbow points={[[cxOf(score), rowY + rowH], [cxOf(score), 176]]} color={red} dashed markerId="ha-arrow-red" />
        <text x={cxOf(score) + 8} y={160} fontSize={9.5} fontFamily={FONT} fill={red}>score &lt; threshold</text>
        <Box x={score.x} y={180} w={score.w} h={40} label="Reject politely" color={red} fontSize={10} />

        {/* interview follow-up self-loop */}
        <path
          d={`M ${interview.x + interview.w - 16} ${rowY} C ${interview.x + interview.w - 10} ${rowY - 34}, ${interview.x + 26} ${rowY - 34}, ${interview.x + 16} ${rowY - 4}`}
          fill="none"
          stroke={green}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#ha-arrow-green)"
        />
        <text x={cxOf(interview)} y={rowY - 40} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={green}>
          follow-up loop ≤ 3
        </text>

        {/* human rejection -> feedback loop back to screening (top arc) */}
        <path
          d={`M ${cxOf(review)} ${rowY} L ${cxOf(review)} 24 L ${cxOf(screen)} 24 L ${cxOf(screen)} ${rowY - 4}`}
          fill="none"
          stroke={yellow}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#ha-arrow-yellow)"
        />
        <text x={(cxOf(review) + cxOf(screen)) / 2} y={16} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={yellow}>
          human rejects → agent re-screens with feedback (max 3 retries)
        </text>
        <text x={cxOf(review) + 8} y={rowY + rowH + 16} fontSize={9.5} fontFamily={FONT} fill={yellow}>
          waits — zero worker cost
        </text>

        {/* MCP tool registry strip feeding the two tool nodes */}
        <Elbow points={[[cxOf(schedule), rowY + rowH], [cxOf(schedule), 246]]} color={purple} dashed markerId="ha-arrow-purple" />
        <Elbow points={[[cxOf(offer), rowY + rowH], [cxOf(offer), 246]]} color={purple} dashed markerId="ha-arrow-purple" />
        <text x={cxOf(schedule) + 8} y={200} fontSize={9.5} fontFamily={FONT} fill={purple}>calendar tool</text>
        <text x={cxOf(offer) + 8} y={200} fontSize={9.5} fontFamily={FONT} fill={purple}>email tool</text>
        <rect x={448} y={250} width={704} height={44} rx={10} fill="var(--bg-panel-alt)" stroke={purple} strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={800} y={268} textAnchor="middle" fontSize={11.5} fontWeight={700} fontFamily={FONT} fill="var(--text-primary)">MCP Tool Registry</text>
        <text x={800} y={284} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill="var(--text-dim)">schema-validated · sandboxed · circuit-broken tool calls</text>

        {/* CI-gated eval harness guarding the LLM behavior */}
        <Elbow points={[[cxOf(screen), rowY + rowH], [cxOf(screen), 246]]} color={dim} dashed markerId="ha-arrow-blue" />
        <rect x={10} y={250} width={400} height={44} rx={10} fill="var(--bg-panel-alt)" stroke="var(--border-default)" />
        <text x={210} y={268} textAnchor="middle" fontSize={11.5} fontWeight={700} fontFamily={FONT} fill="var(--text-primary)">CI-gated eval harness</text>
        <text x={210} y={284} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill="var(--text-dim)">golden hiring scenarios + LLM-as-judge block regressions</text>
      </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 10.5, fontFamily: FONT, color: 'var(--text-dim)' }}>
        <span><span style={{ color: blue }}>■</span> orchestration</span>
        <span><span style={{ color: green }}>■</span> LLM via InferRoute</span>
        <span><span style={{ color: purple }}>■</span> MCP tool call</span>
        <span><span style={{ color: yellow }}>■</span> human checkpoint</span>
        <span><span style={{ color: red }}>■</span> rejection path</span>
      </div>
    </div>
  );
}
