'use client';

import { Terminal, Lock } from 'lucide-react';

/**
 * Pages that require a live backend (Playground, Workflows, Knowledge Base,
 * Usage, Tracing) are wrapped in this guard. They only render when
 * NEXT_PUBLIC_SHOW_INTERACTIVE_PAGES is explicitly enabled; otherwise the
 * visitor sees clear "not deployed yet" instructions instead of broken UIs.
 */

function isInteractiveEnabled(): boolean {
  const value = (process.env.NEXT_PUBLIC_SHOW_INTERACTIVE_PAGES || '').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export { isInteractiveEnabled };

export default function InteractiveFeatureGuard({
  children,
  title,
  slug,
}: {
  children: React.ReactNode;
  title: string;
  slug: string;
}) {
  if (!isInteractiveEnabled()) {
    return (
      <div className="page-fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="bordered-panel" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', marginBottom: 24 }}>
            <Lock size={28} strokeWidth={1.75} style={{ color: 'var(--warning)' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            {title} is not deployed
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
            The live backend for <strong style={{ color: 'var(--text-primary)' }}>{title}</strong> is not running here,
            so the interactive controls are disabled. To test these features locally, start the platform
            with <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>docker compose up -d</code>{' '}
            from the repo root, then enable this page with the env flag below.
          </p>

          <div className="terminal-panel" style={{ textAlign: 'left', marginBottom: 24 }}>
{`# 1. Start the backends (AgentMesh + InferRoute + dependencies)
docker compose up -d

# 2. Unlock interactive pages in the UI
NEXT_PUBLIC_SHOW_INTERACTIVE_PAGES=true

# 3. Restart the Next.js dev server so the env is picked up
npm run dev`}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 24 }}>
            Or visit <a href="/architecture" style={{ color: 'var(--accent)' }}>/architecture</a> to see the design and diagrams.
          </div>

          <a
            href={`/architecture#${slug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <Terminal size={16} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
            Read the architecture instead
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
