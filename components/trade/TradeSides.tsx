import type { CSSProperties } from 'react';
import { PlayerLink } from '@/components/PlayerCard';
import { posColor } from '@/components/pos';
import { DISPLAY, money } from '@/components/team/format';
import { retainedAmount, type TradeAsset } from '@/lib/trade';

/**
 * What each side gives, in two columns. Tapping a player opens his card.
 * `retained` maps a retained player's key to who keeps 30% ("You", a team name).
 */
export default function TradeSides({ out, inn, style, labels = ['YOU GIVE', 'YOU GET'], retained }: {
  out: TradeAsset[]; inn: TradeAsset[]; style?: CSSProperties; labels?: [string, string]; retained?: ReadonlyMap<string, string>;
}) {
  const col = (label: string, tone: string, xs: TradeAsset[], i: number) => (
    <div style={{ minWidth: 0, padding: '12px 12px 12px 16px', borderLeft: i ? '1px solid var(--line)' : undefined }}>
      <div style={{ font: DISPLAY(10), letterSpacing: '.1em', color: tone }}>{label}</div>
      {xs.map((a) => {
        const by = retained?.get(a.key);
        return (
          <div key={a.key} style={{ marginTop: 8, minWidth: 0 }}>
            <PlayerLink playerId={a.kind === 'player' ? a.key : undefined} style={{ display: 'block', minWidth: 0 }}>
              <div style={{ font: '600 13.5px/1.25 var(--font-body)', ...clip }}>{a.name}</div>
              <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', ...clip }}>
                <b style={{ fontWeight: 700, color: posColor(a.pos) }}>{a.pos}</b> · {a.kind === 'pick' ? a.meta : `${a.meta.split(' · ')[0]} · ${money(a.salary)} · ${a.meta.split(' · ')[1]}`}
              </div>
            </PlayerLink>
            {by && <div style={{ marginTop: 3, font: '600 11px/1.3 var(--font-body)', color: 'var(--volt)', fontVariantNumeric: 'tabular-nums', ...clip }}>{by} keep{by === 'You' ? '' : 's'} 30% · {money(retainedAmount(a))}</div>}
          </div>
        );
      })}
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
