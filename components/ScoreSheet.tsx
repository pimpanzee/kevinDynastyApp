'use client';

import BottomSheet from '@/components/BottomSheet';
import { posColor } from '@/components/pos';
import type { BoxPlayerView } from '@/lib/types';

/** "0.1 per yd", "6 per TD", "0.5 per catch", "−3 each"; FLAT for a range award. */
function rule(label: string, per: string): string {
  if (per === 'FLAT') return 'flat';
  const v = per.replace(/^-/, '−');
  if (/yards|yds|distance/i.test(label)) return `${v} per yd`;
  if (/\bTD\b/.test(label)) return `${v} per TD`;
  if (/receptions/i.test(label)) return `${v} per catch`;
  if (/2-pt/i.test(label)) return `${v} per 2-pt`;
  return `${v} each`;
}

/**
 * How one player's stats became their fantasy points: each stat they actually
 * recorded, the league rule, the raw number and the points, then the total.
 */
export default function ScoreSheet({ player, game, onClose }: { week: number; player: BoxPlayerView; game?: string; onClose: () => void }) {
  const b = player.breakdown;
  if (!b) return null;
  const pos = player.live?.position ?? '';
  const [team, ...rest] = player.line.split(' · ');
  const st = rest.filter((t) => t !== 'yet to play').join(' · ');
  const isLive = /in play/i.test(st);
  const status = /^FINAL$/i.test(st) ? 'Final' : isLive ? 'Live' : st === 'TBD' ? 'Bye' : st;
  const total = Number(b.total);
  const proj = Number(player.proj.replace(/[^\d.-]/g, ''));
  const diff = Number.isFinite(proj) && proj > 0 ? total - proj : null;
  const cols = 'minmax(0,1fr) 64px 56px';

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0 14px 16px' }}>
      <span style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, marginTop: 2, borderRadius: 2, background: 'var(--bg-300)', color: posColor(pos), font: '800 14px/1 var(--font-display)', letterSpacing: '.06em' }}>{pos}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: 0, font: '700 22px/1.05 var(--font-display)', letterSpacing: '.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</h2>
        <div style={{ marginTop: 4, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.live?.team ?? team}
          {status && <> · <span style={{ color: isLive ? 'var(--live)' : undefined }}>{status}</span></>}
          {game ? ` · ${game}` : ''}
        </div>
      </div>
    </div>
  );

  return (
    <BottomSheet label={`${player.name} score breakdown`} onClose={onClose} header={header}>
      <div style={{ borderTop: '1px solid var(--line)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, padding: '14px 16px 12px' }}>
        <div>
          <div style={{ font: '700 11px/1 var(--font-display)', letterSpacing: '.12em', color: 'var(--ink-3)' }}>FANTASY POINTS</div>
          <div style={{ marginTop: 6, font: '800 56px/48px var(--font-display)', letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }}>{b.total}</div>
        </div>
        {diff !== null && (
          <div style={{ marginLeft: 'auto', textAlign: 'right', paddingBottom: 3 }}>
            <div style={{ font: '500 12px/1 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>proj {proj.toFixed(1)}</div>
            <div style={{ marginTop: 6, font: '700 17px/1 var(--font-display)', letterSpacing: '.04em', fontVariantNumeric: 'tabular-nums', color: diff >= 0 ? 'var(--rise)' : 'var(--fall)' }}>
              {diff >= 0 ? '+' : '−'}{Math.abs(diff).toFixed(1)} VS PROJ
            </div>
          </div>
        )}
      </div>

      <div style={{ margin: '0 16px', borderTop: '1px solid var(--edge)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, height: 28, alignItems: 'center', font: '700 11px/1 var(--font-display)', letterSpacing: '.12em', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>
          <span>STAT</span><span style={{ textAlign: 'right' }}>TOTAL</span><span style={{ textAlign: 'right' }}>PTS</span>
        </div>
        {b.rows.length === 0 && (
          <div style={{ padding: '12px 0', font: '500 13px/1.3 var(--font-body)', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>No scoring plays.</div>
        )}
        {b.rows.map((r, i) => (
          <div key={`${r.label}-${i}`} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 40, borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '500 14px/1.2 var(--font-body)' }}>{r.label}</div>
              <div style={{ font: '500 11px/1.2 var(--font-body)', color: 'var(--ink-3)', marginTop: 1 }}>{rule(r.label, r.per)}</div>
            </div>
            <span style={{ textAlign: 'right', font: '500 14px/1 var(--font-body)', color: 'var(--ink-2)' }}>{r.stat}</span>
            <span style={{ textAlign: 'right', font: '700 17px/1 var(--font-display)', color: r.points.startsWith('-') ? 'var(--fall)' : 'var(--ink)' }}>{r.points.replace(/^-/, '−')}</span>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px', alignItems: 'center', height: 40, borderBottom: '1px solid var(--edge)', font: '700 13px/1 var(--font-display)', letterSpacing: '.12em' }}>
          <span>TOTAL</span><span style={{ textAlign: 'right', fontSize: 19, letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>{b.total}</span>
        </div>
      </div>

      {isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 16px 0', font: '500 12.5px/1.35 var(--font-body)', color: 'var(--ink-2)' }}>
          <span style={{ flex: 'none', font: '700 10px/1 var(--font-display)', letterSpacing: '.08em', padding: '3px 5px', background: 'var(--live)', color: '#fff', borderRadius: 2 }}>LIVE</span>
          <span>Game in progress — points update as stats come in.</span>
        </div>
      )}
      <div style={{ height: 24 }} />
    </BottomSheet>
  );
}
