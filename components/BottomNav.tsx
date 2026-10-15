'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Four-tab bottom bar: MATCHUPS · MY TEAM · PLAYERS · LEAGUE. The active tab is
 * derived from the path, so every page under a tab's prefix lights it.
 * Drill-ins (matchup detail) don't render it.
 */

const icon = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

const TABS: Array<{ href: string; match: string[]; label: string; icon: ReactNode }> = [
  {
    href: '/matchups/', match: ['/matchups'], label: 'MATCHUPS',
    icon: icon(<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" x2="19" y1="19" y2="13" /><line x1="16" x2="20" y1="16" y2="20" /><line x1="19" x2="21" y1="21" y2="19" /><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" /><line x1="5" x2="9" y1="14" y2="18" /><line x1="7" x2="4" y1="17" y2="20" /><line x1="3" x2="5" y1="19" y2="21" /></>),
  },
  {
    href: '/team/', match: ['/team'], label: 'MY TEAM',
    icon: icon(<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />),
  },
  {
    href: '/players/', match: ['/players'], label: 'PLAYERS',
    icon: icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  },
  {
    href: '/league/', match: ['/league'], label: 'LEAGUE',
    icon: icon(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>),
  },
];

export default function BottomNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Tabs"
      style={{
        display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        height: 'calc(66px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)',
        boxSizing: 'border-box', flex: 'none', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)',
      }}
    >
      {TABS.map((tab) => {
        const active = tab.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              background: active ? 'var(--bg-200)' : undefined,
              boxShadow: active ? 'inset 0 3px 0 var(--volt)' : undefined,
            }}
          >
            {tab.icon}
            <span style={{ font: '700 12px/1 var(--font-display)', letterSpacing: '.12em' }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
