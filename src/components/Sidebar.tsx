'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Compass,
  FlaskConical,
  GitBranch,
  Boxes,
  Network,
  Terminal,
  TrendingUp,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/story', icon: Compass, label: 'Story' },
  { href: '/architecture', icon: Network, label: 'Architecture' },
  { href: '/playground', icon: FlaskConical, label: 'Playground' },
  { href: '/workflows', icon: GitBranch, label: 'Workflows' },
  { href: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
  { href: '/usage', icon: TrendingUp, label: 'Usage' },
  { href: '/tracing', icon: Terminal, label: 'Tracing' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header — same padding/size as original */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Boxes size={20} strokeWidth={1.75} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              AgentMesh
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Control Panel
            </p>
          </div>
        </div>
      </div>

      {/* Nav — same padding/gap/font as original */}
      <nav style={{ flex: 1, paddingTop: 0 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                cursor: 'pointer',
                color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                fontSize: 14,
                borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                background: isActive ? 'var(--bg-panel-alt)' : 'transparent',
                transition: 'all 0.15s',
                textDecoration: 'none',
              }}
            >
              <Icon
                size={18}
                strokeWidth={1.75}
                style={{ width: 24, flexShrink: 0, textAlign: 'center' }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer — same as original */}
      <div style={{
        marginTop: 'auto',
        padding: 16,
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 11,
        color: 'var(--text-dim)',
      }}>
        <div>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', marginRight: 6 }} />
          InferRoute :8070
        </div>
        <div style={{ marginTop: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', marginRight: 6 }} />
          AgentMesh :8000
        </div>
        <div style={{ marginTop: 8, opacity: 0.6 }}>v0.1.0 — Prototype</div>
      </div>
    </aside>
  );
}
