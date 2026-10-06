'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Three-tab bottom bar. The active tab is derived from the current path, so
 * there is no per-page `active` prop that can drift out of sync.
 *
 * Matchup Detail deliberately does not render this bar — it is a drill-in,
 * not a tab (see the handoff README).
 */

const MatchupsIcon = (
  <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2.75 9.25 1.5 2.5 2 1.5m-4.5 0 1 1m1.5-2.5-1.5 1.5m3-1 8.5-8.5v-2h-2l-8.5 8.5" />
    <path d="m10.25 12.25-2.25-2.25m2-2 2.25 2.25m1-1-1.5 2.5-2 1.5m4.5 0-1 1m-1.5-2.5 1.5 1.5m-7.25-5.25-4.25-4.25v-2h2l4.25 4.25" />
  </svg>
);

const RostersIcon = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const StandingsIcon = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 12h11" />
    <path d="M10 18h11" />
    <path d="M10 6h11" />
    <path d="M4 10h2" />
    <path d="M4 6h1v4" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

const TABS: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: '/matchups', label: 'MATCHUPS', icon: MatchupsIcon },
  { href: '/rosters', label: 'ROSTERS', icon: RostersIcon },
  { href: '/standings', label: 'STANDINGS', icon: StandingsIcon },
];

/**
 * Icon, label and spacing scale with the bar's height (container query units,
 * `cqh`), clamped so a standard 51px bar gets exactly the original 20px icons
 * and 9px labels, and a bar grown to fill a short screen gets larger ones.
 */
const ICON = 'clamp(20px, 30cqh, 34px)';
const LABEL = 'clamp(9px, 9cqh, 12px)';
const GAP = 'clamp(3px, 5cqh, 8px)';
/** Content height of a standard bar; the 2px top rule sits on top of it. */
const BAR_H = 51;

const tabStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP,
  padding: '0 4px',
  borderTop: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
  marginTop: -3,
  color: active ? 'var(--color-text)' : 'var(--color-neutral-600)',
  cursor: 'pointer',
});

/**
 * `fill` lets the bar grow into any space the screen's content leaves, so a
 * short list ends right at the nav instead of above a blank band; the tabs
 * then stretch with it and their icons and labels grow to suit.
 */
export default function BottomNav({ fill = false }: { fill?: boolean }) {
  const pathname = usePathname();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)',
        gridTemplateRows: '1fr',
        borderTop: '2px solid var(--color-text)',
        boxSizing: 'content-box',
        // A size container so the tabs can scale with its height. It cannot
        // size itself from content, so the standard height is set explicitly.
        containerType: 'size',
        ...(fill ? { flex: `1 0 ${BAR_H}px`, minHeight: BAR_H } : { flex: 'none', height: BAR_H }),
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            style={tabStyle(active)}
          >
            <span style={{ display: 'flex', width: ICON, height: ICON }}>{tab.icon}</span>
            <span style={{ font: `800 ${LABEL} var(--font-heading)`, letterSpacing: '.06em' }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
