'use client';

import { useEffect } from 'react';
import type { BoxPlayerView } from '@/lib/types';

/**
 * Bottom sheet showing how one player's stats became their fantasy points:
 * each scoring stat, the league's points per unit, and what it earned.
 */
export default function ScoreSheet({
  week,
  player,
  onClose,
}: {
  week: number;
  player: BoxPlayerView;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const b = player.breakdown;
  if (!b) return null;

  const label = { font: '800 9px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-600)' };
  const cols = '1fr 48px 58px 62px';
  const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'flex-end',
        background: 'color-mix(in srgb, var(--color-neutral-900) 50%, transparent)',
      }}
    >
      <div
        role="dialog"
        aria-label={`${player.name} score breakdown`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '80%', overflow: 'auto', background: 'var(--color-bg)',
          borderTop: '2px solid var(--color-text)', paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
          animation: 'sheet-up .18s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderBottom: '2px solid var(--color-divider)' }}>
          <span style={{ font: '800 11px var(--font-heading)', letterSpacing: '.12em' }}>
            WEEK {week}
            <span style={{ color: 'var(--color-neutral-500)', margin: '0 8px' }}>|</span>
            SCORE BREAKDOWN
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            autoFocus
            style={{
              marginLeft: 'auto', width: 44, height: 44, marginRight: -14, border: 0, background: 'none',
              font: '800 18px/1 var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '14px 14px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '800 20px/1.1 var(--font-heading)', letterSpacing: '-.01em' }}>{player.name}</div>
            <div style={{ ...label, marginTop: 5 }}>
              {player.live?.position ? `${player.live.position} · ` : ''}{player.line.toUpperCase()}
            </div>
          </div>
          <div style={{ font: '800 32px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
            {b.total}
          </div>
        </div>

        {player.byline && (
          <div style={{ margin: '0 14px 12px', padding: '7px 10px', borderLeft: '3px solid var(--color-accent)', background: 'var(--color-surface)', font: '600 11.5px/1.4 var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
            {player.byline}
          </div>
        )}

        <div style={{ margin: '0 14px', borderTop: '2px solid var(--color-text)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '9px 0 7px', borderBottom: '1px solid var(--color-divider)' }}>
            <span />
            <span style={{ ...label, ...num }}>STAT</span>
            <span style={{ ...label, ...num }}>PTS PER</span>
            <span style={{ ...label, ...num }}>POINTS</span>
          </div>

          {b.rows.length === 0 && (
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-neutral-600)', borderBottom: '1px solid var(--color-divider)' }}>
              No scoring plays.
            </div>
          )}

          {b.rows.map((r, i) => (
            <div
              key={`${r.label}-${i}`}
              style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 12.5, fontWeight: 600 }}
            >
              <span>{r.label}</span>
              <span style={{ ...num, color: 'var(--color-neutral-700)' }}>{r.stat}</span>
              <span style={{ ...num, color: 'var(--color-neutral-700)', fontSize: r.per === 'FLAT' ? 9.5 : undefined, letterSpacing: r.per === 'FLAT' ? '.08em' : undefined }}>
                {r.per}
              </span>
              <span style={{ ...num, fontWeight: 800, color: r.points.startsWith('-') ? 'var(--color-accent)' : undefined }}>{r.points}</span>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'baseline', padding: '11px 0', borderTop: '1px solid var(--color-text)' }}>
            <span style={{ font: '800 11px var(--font-heading)', letterSpacing: '.12em' }}>TOTAL</span>
            <span />
            <span />
            <span style={{ ...num, font: '800 16px var(--font-heading)' }}>{b.total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
