'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import TeamAvatar from '@/components/TeamAvatar';
import { useChosenTeam } from '@/lib/myTeam';

const GearIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const BackIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

/** The volt slash + THE LIAM wordmark. */
export function Wordmark() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: '800 22px/1 var(--font-display)', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 9, height: 18, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
      THE LIAM
    </span>
  );
}

/**
 * The 56px top bar: wordmark (or a back arrow + `title` on drill-ins), an
 * optional control slot, and the way into Settings — the viewer's team chip,
 * or a gear until they pick a team. Settings itself passes `back` and no avatar.
 */
export default function HeaderBar({ right, back, title, noSettings }: { right?: ReactNode; back?: string | (() => void); title?: ReactNode; noSettings?: boolean }) {
  const team = useChosenTeam();
  const backStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, marginLeft: -12, color: 'var(--ink)', background: 'none', border: 0, padding: 0, cursor: 'pointer' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
      {back ? (
        <>
          {typeof back === 'string'
            ? <Link href={back} aria-label="Back" style={backStyle}>{BackIcon}</Link>
            : <button type="button" onClick={back} aria-label="Back" style={backStyle}>{BackIcon}</button>}
          {title !== undefined
            ? <span style={{ font: '800 20px/1 var(--font-display)', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{title}</span>
            : <Wordmark />}
        </>
      ) : <Wordmark />}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>{right}</span>
      {!noSettings && (
        <Link
          href="/settings/"
          aria-label={team?.name ? `Settings (${team.name})` : 'Settings'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, marginRight: -8, color: 'var(--ink-2)' }}
        >
          {team ? <TeamAvatar name={team.name || '?'} icon={team.icon} size={30} /> : GearIcon}
        </Link>
      )}
    </div>
  );
}

/** The compact dropdown-style control that sits in the header (WEEK 11 ▾). */
export function HeaderButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, height: 36, padding: '0 8px 0 12px',
        background: 'var(--bg-100)', border: '1px solid var(--edge)', borderRadius: 2, color: 'var(--ink)',
        font: '700 12px/1 var(--font-display)', letterSpacing: '.12em', cursor: 'pointer', ...rest.style,
      }}
    >
      {children}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    </button>
  );
}
