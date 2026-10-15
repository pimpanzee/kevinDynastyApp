import type { ReactNode } from 'react';
import { DISPLAY } from './format';

/** Volt skew mark + condensed caps label, summary on the right. */
export default function SectionHead({ label, right, gap = true }: { label: ReactNode; right?: ReactNode; gap?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', marginTop: gap ? 8 : 0 }}>
      <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
      <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>{label}</span>
      {right !== undefined && <span style={{ marginLeft: 'auto', font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-3)' }}>{right}</span>}
    </div>
  );
}
