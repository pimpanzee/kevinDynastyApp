import type { ReactNode } from 'react';

/**
 * Sticky grouped-list header — roster positions and standings divisions both
 * pin while scrolling, over a solid --color-bg so rows don't show through.
 */
export function StickySectionHeader({
  padding,
  marginTop,
  children,
}: {
  padding: string;
  marginTop?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        background: 'var(--color-bg)',
        padding,
        borderBottom: '2px solid var(--color-text)',
        marginTop,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  size = 11,
  tracking = '.12em',
  children,
}: {
  size?: number;
  tracking?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        font: `800 ${size}px var(--font-heading)`,
        letterSpacing: tracking,
        color: 'var(--color-accent-700)',
      }}
    >
      {children}
    </div>
  );
}

/** Expand/collapse chevron. Rotates 180° when its row is open. */
export function Chevron({ open, size = 8 }: { open: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        flex: 'none',
        fontSize: size,
        color: 'var(--color-neutral-600)',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform .15s',
      }}
    >
      ▼
    </span>
  );
}

/** One labelled figure in a 5-column expand grid. */
export function StatCell({
  label,
  labelSize = 8,
  value,
  valueFont,
  accent = false,
}: {
  label: string;
  labelSize?: number;
  value: ReactNode;
  valueFont: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          font: `800 ${labelSize}px var(--font-heading)`,
          letterSpacing: '.06em',
          color: accent ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          font: valueFont,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
          color: accent ? 'var(--color-accent-700)' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
