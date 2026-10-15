import type { TeamView } from '@/lib/types';
import SectionHead from './SectionHead';
import { DISPLAY, money } from './format';

/**
 * Each future draft: picks held (own or acquired) with the projected slot and
 * its rookie salary, and own picks traded away, dimmed.
 */
export default function PicksTab({ team }: { team: TeamView }) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {team.picks.map((y, i) => (
        <div key={y.year}>
          <SectionHead gap={i > 0} label={`${y.year} DRAFT`} right={`${y.count} ${y.count === 1 ? 'PICK' : 'PICKS'} · ${money(y.total)}`} />
          {y.picks.map((p, j) => (
            <div key={j} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderBottom: '1px solid var(--line)', opacity: p.held ? 1 : 0.5 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, borderRadius: 2, background: p.held ? 'var(--pos-pick)' : 'var(--bg-300)', color: p.held ? 'var(--on-volt)' : 'var(--ink-2)', font: DISPLAY(10), letterSpacing: '.08em' }}>R{p.round}</span>
              <div style={{ minWidth: 0, font: '600 14px/1.25 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
              {p.held && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ font: DISPLAY(14), letterSpacing: '.04em', fontVariantNumeric: 'tabular-nums' }}>PROJ {p.slot}</div>
                  <div style={{ font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{money(p.salary)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {team.picks.length === 0 && <div style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>No future picks on record.</div>}
      <div style={{ height: 20 }} />
    </div>
  );
}
