import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/** The Settings list row: full width, hairline below, 52px minimum. */
export const menuRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 14px', width: '100%',
  cursor: 'pointer', background: 'none', borderWidth: '0 0 1px', borderStyle: 'solid', borderColor: 'var(--color-divider)',
  textAlign: 'left', color: 'var(--color-text)', font: 'inherit',
};

/** A row that opens another page: optional icon, title, one-line description, chevron. */
export default function MenuLink({ href, title, sub, icon }: { href: string; title: string; sub: string; icon?: ReactNode }) {
  return (
    <Link href={href} style={menuRowStyle}>
      {icon && (
        <span aria-hidden style={{ display: 'flex', width: 22, height: 22, flex: 'none', color: 'var(--color-neutral-700)' }}>{icon}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>{sub}</span>
      </span>
      <span aria-hidden style={{ font: '800 14px var(--font-heading)', color: 'var(--color-neutral-600)' }}>›</span>
    </Link>
  );
}
