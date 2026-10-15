'use client';

import { useEffect, useRef } from 'react';
import type { WeekOption } from '@/lib/types';

/**
 * The week picker that drops from the header's WEEK control: every week with
 * its note (LIVE, your result, a kickoff), the open week marked in volt.
 */
export default function WeekMenu({ weeks, current, onPick, onClose }: { weeks: WeekOption[]; current: number; onPick: (n: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div ref={ref} role="listbox" aria-label="Week" style={{ flex: 'none', maxHeight: '50dvh', overflowY: 'auto', background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
      {weeks.map((w) => {
        const on = w.n === current;
        return (
          <button
            key={w.n}
            type="button"
            role="option"
            aria-selected={on}
            aria-current={on ? 'true' : undefined}
            onClick={() => onPick(w.n)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 44, padding: '0 16px',
              background: on ? 'var(--bg-200)' : 'transparent', boxShadow: on ? 'inset 3px 0 0 var(--volt)' : undefined,
              border: 0, borderBottom: '1px solid var(--line)', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ font: '700 14px/1 var(--font-display)', letterSpacing: '.08em' }}>WEEK {w.n}</span>
            <span style={{ font: '700 11px/1 var(--font-display)', letterSpacing: '.1em', color: w.note === 'LIVE' ? 'var(--live)' : 'var(--ink-3)' }}>{w.note}</span>
          </button>
        );
      })}
    </div>
  );
}
