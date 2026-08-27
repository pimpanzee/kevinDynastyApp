import type { ReactNode } from 'react';

/** GRIDLOCK wordmark bar with a right-aligned control or label slot. */
export default function HeaderBar({ right }: { right?: ReactNode }) {
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
      <span style={{ font: '800 17px/1 var(--font-heading)', letterSpacing: '-.02em' }}>
        GRIDLOCK
      </span>
      {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
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
