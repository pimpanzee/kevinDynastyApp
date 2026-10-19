import type { CSSProperties } from 'react';
import { posColor } from '@/components/pos';
import { DISPLAY, money } from '@/components/team/format';
import type { TradeAsset } from '@/lib/trade';

/** What each side gives, in two columns. */
export default function TradeSides({ out, inn, style, labels = ['YOU GIVE', 'YOU GET'] }: { out: TradeAsset[]; inn: TradeAsset[]; style?: CSSProperties; labels?: [string, string] }) {
  const col = (label: string, tone: string, xs: TradeAsset[], i: number) => (
    <div style={{ minWidth: 0, padding: '12px 12px 12px 16px', borderLeft: i ? '1px solid var(--line)' : undefined }}>
      <div style={{ font: DISPLAY(10), letterSpacing: '.1em', color: tone }}>{label}</div>
      {xs.map((a) => (
        <div key={a.key} style={{ marginTop: 8, minWidth: 0 }}>
          <div style={{ font: '600 13.5px/1.25 var(--font-body)', ...clip }}>{a.name}</div>
          <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', ...clip }}>
            <b style={{ fontWeight: 700, color: posColor(a.pos) }}>{a.pos}</b> · {a.kind === 'pick' ? a.meta : `${a.meta.split(' · ')[0]} · ${money(a.salary)} · ${a.meta.split(' · ')[1]}`}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', ...style }}>
      {col(labels[0], 'var(--fall)', out, 0)}
      {col(labels[1], 'var(--rise)', inn, 1)}
    </div>
  );
}

const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
