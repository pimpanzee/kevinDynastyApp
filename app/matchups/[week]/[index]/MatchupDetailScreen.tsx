'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader from '@/components/ScoreHeader';
import ScoreSheet from '@/components/ScoreSheet';
import StatusBar from '@/components/StatusBar';
import TeamWatermarks from '@/components/TeamWatermarks';
import { applyLiveToDetail, applyStatsToDetail } from '@/lib/live';
import { useMyTeam } from '@/lib/myTeam';
import type { BoxPlayerView, BoxRowView, MatchupDetailView } from '@/lib/types';
import { useLive, useLiveStats } from '@/lib/useLive';

/** Which player's breakdown is open: section, row, side. */
type Open = { bench: boolean; row: number; side: 'home' | 'away' } | null;

export default function MatchupDetailScreen({ view: built }: { view: MatchupDetailView }) {
  const live = useLive(built.week, built.liveWindow);
  const stats = useLiveStats(built.scoring?.statsUrl, built.liveWindow);
  const scored = live ? applyLiveToDetail(built, live) : built;
  const team = useMyTeam(built.myFranchiseId);
  const isMine = built.home.franchiseId === team || built.away.franchiseId === team;
  const view = stats ? applyStatsToDetail(scored, stats) : scored;

  // Held by position rather than as a copy, so an open sheet follows live updates.
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const openPlayer: BoxPlayerView | undefined =
    open ? (open.bench ? view.bench : view.starters)[open.row]?.[open.side] : undefined;
  const pageHref = (n: number) => `/matchups/${view.week}/${(n + view.total) % view.total}/`;

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <StatusBar label={view.clock} simulatedAt={view.simulatedAt} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 14px', borderBottom: '2px solid var(--color-divider)' }}>
        {/* Back returns to the week this matchup was opened from. */}
        <Link
          href={`/matchups/${view.week}/`}
          aria-label="Back to matchups"
          style={{ display: 'flex', alignItems: 'center', height: 44, paddingRight: 4, font: '800 15px/1 var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          ←
        </Link>
        <span style={{ font: '800 11px var(--font-heading)', letterSpacing: '.12em' }}>WEEK {view.week} MATCHUP</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          {view.liveDot && <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />}
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>{view.tag}</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', borderBottom: '1px solid var(--color-divider)' }}>
        <Link href={pageHref(view.index - 1)} aria-label="Previous matchup" style={pagerStyle('right')}>‹</Link>
        <div style={{ textAlign: 'center', font: '800 9.5px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-600)' }}>
          MATCHUP {view.index + 1} OF {view.total}
          {isMine ? ' · YOURS' : ''}
        </div>
        <Link href={pageHref(view.index + 1)} aria-label="Next matchup" style={pagerStyle('left')}>›</Link>
      </div>

      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '2px solid var(--color-divider)' }}>
        <TeamWatermarks home={view.home.icon} away={view.away.icon} />
        <div style={{ position: 'relative', padding: '12px 14px 14px' }}>
          <ScoreHeader
            home={{ name: view.home.name, meta: view.home.meta, num: view.home.num, sub: view.home.sub }}
            away={{ name: view.away.name, meta: view.away.meta, num: view.away.num, sub: view.away.sub }}
            win={[view.home.win, view.away.win]}
            bar={view.bar}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {view.starters.map((r, i) => (
          <PlayerRow key={`s-${i}-${r.home.name}-${r.away.name}`} row={r} onScore={(side) => setOpen({ bench: false, row: i, side })} />
        ))}

        <div style={{
          borderTop: '2px solid var(--color-divider)', borderBottom: '2px solid var(--color-divider)',
          padding: '11px 14px 7px', font: '800 10px var(--font-heading)', letterSpacing: '.14em',
          color: 'var(--color-neutral-600)',
        }}>
          BENCH
        </div>

        {view.bench.map((r, i) => (
          <PlayerRow key={`b-${i}-${r.home.name}-${r.away.name}`} row={r} bench onScore={(side) => setOpen({ bench: true, row: i, side })} />
        ))}

        <div style={{ height: 20 }} />
      </div>

      {openPlayer?.breakdown && <ScoreSheet week={view.week} player={openPlayer} onClose={close} />}
    </PhoneFrame>
  );
}

function pagerStyle(border: 'left' | 'right'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44,
    [border === 'right' ? 'borderRight' : 'borderLeft']: '1px solid var(--color-divider)',
    font: '800 13px var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer',
  };
}

/**
 * Home player | position | away player, with each side's box-score byline
 * beneath. Tapping a score opens its breakdown. Bench rows are de-emphasised.
 */
function PlayerRow({
  row, bench = false, onScore,
}: {
  row: BoxRowView; bench?: boolean; onScore: (side: 'home' | 'away') => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px 1fr', borderBottom: '1px solid var(--color-divider)' }}>
      <PlayerSide player={row.home} side="home" bench={bench} onScore={() => onScore('home')} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: '800 9.5px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-neutral-600)',
        borderLeft: '1px solid var(--color-divider)', borderRight: '1px solid var(--color-divider)',
      }}>
        {row.pos}
      </div>

      <PlayerSide player={row.away} side="away" bench={bench} onScore={() => onScore('away')} />
    </div>
  );
}

function PlayerSide({
  player, side, bench, onScore,
}: {
  player: BoxPlayerView; side: 'home' | 'away'; bench: boolean; onScore: () => void;
}) {
  const away = side === 'away';
  const nameSize = bench ? 12 : 12.5;
  const ptsFont = bench ? '800 15px/1 var(--font-heading)' : '800 18px/1 var(--font-heading)';
  // The away side reads a step quieter, as in the design.
  const tone = bench ? 'var(--color-neutral-700)' : away ? 'var(--color-neutral-800)' : undefined;
  const nameTone = bench ? 'var(--color-neutral-700)' : away ? 'var(--color-neutral-800)' : undefined;

  const sub = { fontSize: 9.5, color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums' as const, marginTop: 3 };
  const clip = { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' };

  const name = (
    <div style={{ minWidth: 0, flex: 1, textAlign: away ? 'right' : undefined }}>
      <div style={{ fontSize: nameSize, fontWeight: 600, color: nameTone, ...clip }}>{player.name}</div>
      <div style={{ ...sub, ...clip }}>{player.line}</div>
    </div>
  );

  const scoreInner = (
    <>
      <div style={{ font: ptsFont, fontVariantNumeric: 'tabular-nums', color: tone }}>
        {player.pts}
        {player.breakdown && (
          // Dotted rule under a tappable score, the system's hint for "more here".
          <span aria-hidden style={{ display: 'block', height: 0, marginTop: 2, borderBottom: '1px dotted var(--color-neutral-500)' }} />
        )}
      </div>
      <div style={sub}>{player.proj}</div>
    </>
  );

  const score = player.breakdown ? (
    <button
      type="button"
      onClick={onScore}
      aria-label={`${player.name}: ${player.pts} points. Show score breakdown`}
      style={{
        border: 0, background: 'none', padding: '6px 4px', margin: '-6px -4px', font: 'inherit', color: 'inherit',
        textAlign: away ? 'left' : 'right', cursor: 'pointer',
      }}
    >
      {scoreInner}
    </button>
  ) : (
    <div style={{ textAlign: away ? 'left' : 'right' }}>{scoreInner}</div>
  );

  return (
    <div style={{ padding: away ? '10px 14px 10px 10px' : '10px 10px 10px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {away ? <>{score}{name}</> : <>{name}{score}</>}
      </div>
      {player.byline && (
        <div style={{
          marginTop: 5, fontSize: bench ? 9 : 9.5, lineHeight: 1.35, color: 'var(--color-neutral-700)',
          fontVariantNumeric: 'tabular-nums', textAlign: away ? 'right' : undefined, letterSpacing: '.01em',
        }}>
          {player.byline}
        </div>
      )}
    </div>
  );
}
