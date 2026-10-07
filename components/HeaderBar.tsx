import Link from 'next/link';
import type { ReactNode } from 'react';

const GearIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * GRIDLOCK wordmark bar with a right-aligned control or label slot, and the
 * Settings gear. Settings screens pass `back` instead, for a back arrow.
 */
export default function HeaderBar({ right, back }: { right?: ReactNode; back?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        padding: '0 14px',
        borderBottom: '2px solid var(--color-divider)',
      }}
    >
      {back && (
        <Link href={back} aria-label="Back" style={{ display: 'flex', alignItems: 'center', height: 44, paddingRight: 2, font: '800 15px/1 var(--font-heading)', color: 'var(--color-text)' }}>
          ←
        </Link>
      )}
      <span style={{ font: '800 17px/1 var(--font-heading)', letterSpacing: '-.02em' }}>
        GRIDLOCK
      </span>
      {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
      {!back && (
        <Link
          href="/settings/"
          aria-label="Settings"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
            marginLeft: right === undefined ? 'auto' : 0, marginRight: -6, color: 'var(--color-neutral-700)',
          }}
        >
          {GearIcon}
        </Link>
      )}
    </div>
  );
}

/** The plain all-caps label the Roster and Standings headers use. */
export function HeaderLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        font: '800 10px var(--font-heading)',
        letterSpacing: '.14em',
        color: 'var(--color-neutral-600)',
      }}
    >
      {children}
    </span>
  );
}
