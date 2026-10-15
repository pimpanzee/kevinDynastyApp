'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The section strip under a screen header (ROSTER · CAP · PICKS,
 * ACTIVITY · STANDINGS · RATINGS). Each section is its own route, so it can be
 * linked to and the back button works; the active one is read from the path.
 * Pass `onSelect` instead of hrefs for in-page sections (a team page).
 */
export default function SubTabs({
  tabs,
  label,
  active,
  onSelect,
}: {
  tabs: Array<{ key: string; label: string; href?: string }>;
  label: string;
  active?: string;
  onSelect?: (key: string) => void;
}) {
  const pathname = (usePathname() ?? '').replace(/\/?$/, '/');
  return (
    <nav aria-label={label} style={{ flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
      {tabs.map((t) => {
        const on = active ? active === t.key : t.href === pathname;
        const style = {
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, border: 0, padding: 0, cursor: 'pointer',
          font: '700 12px/1 var(--font-display)', letterSpacing: '.12em',
          color: on ? 'var(--ink)' : 'var(--ink-3)',
          background: on ? 'var(--bg-200)' : 'transparent',
          boxShadow: on ? 'inset 0 -3px 0 var(--volt)' : undefined,
        } as const;
        return t.href && !onSelect ? (
          <Link key={t.key} href={t.href} replace aria-current={on ? 'page' : undefined} style={style}>{t.label}</Link>
        ) : (
          <button key={t.key} type="button" aria-pressed={on} onClick={() => onSelect?.(t.key)} style={style}>{t.label}</button>
        );
      })}
    </nav>
  );
}
