'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import MedianRace from '@/components/MedianRace';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader, { NO_SCORE } from '@/components/ScoreHeader';
import StatusBar from '@/components/StatusBar';
import { barWidth } from '@/lib/format';
import { applyLiveToWeek } from '@/lib/live';
import { personalizeWeek, useMyTeam } from '@/lib/myTeam';
import type { MatchupView, Phase, SideView, WeekView } from '@/lib/types';
import { useLive } from '@/lib/useLive';

type GameState = 'future' | 'active' | 'past';

/** Per matchup: a game decided early in a live week is already past. */
function gameState(phase: Phase, m: MatchupView): GameState {
  if (phase === 'pre') return 'future';
  return phase === 'final' || m.final ? 'past' : 'active';
}

/**
 * What each side shows. Future: no score yet, just the projection. Active:
 * the score with the projection under it. Past: the score alone.
 */
function scoreLines(side: SideView, state: GameState): { num: string; sub: string } {
  if (state === 'future') return { num: NO_SCORE, sub: `proj ${side.num}` };
  if (state === 'active') return { num: side.num, sub: `proj ${side.sub}` };
  return { num: side.num, sub: '' };
}

export default function MatchupsScreen({ view: built }: { view: WeekView }) {
  const live = useLive(built.week, built.liveWindow);
  const team = useMyTeam(built.myFranchiseId);
  const view = personalizeWeek(live ? applyLiveToWeek(built, live) : built, team);
  const router = useRouter();
  const [weekOpen, setWeekOpen] = useState(false);

  const isLive = view.phase === 'live';

  const pickWeek = (n: number) => {
    setWeekOpen(false);
    if (n !== view.week) router.push(`/matchups/${n}/`);
  };

  const mine = view.matchups[0];
  const rest = view.matchups.slice(1);
  const mineState = mine ? gameState(view.phase, mine) : 'future';

  return (
    <PhoneFrame>
      <StatusBar label={view.clock} simulatedAt={view.simulatedAt} />

      <HeaderBar
        right={
          <button
            onClick={() => setWeekOpen((v) => !v)}
            aria-expanded={weekOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32,
              background: 'none', border: '1px solid var(--color-divider)', padding: '0 11px',
              font: '800 11px var(--font-heading)', letterSpacing: '.06em',
              color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            WEEK {view.week} <span style={{ fontSize: 8 }}>▼</span>
          </button>
        }
      />

      {weekOpen && (
        <div style={{ borderBottom: '2px solid var(--color-divider)', background: 'var(--color-neutral-200)' }}>
          {view.weeks.map((w) => (
            <div
              key={w.n}
              onClick={() => pickWeek(w.n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickWeek(w.n); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                height: 44, padding: '0 14px', borderBottom: '1px solid var(--color-divider)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <span>{w.label}</span>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 10, letterSpacing: '.08em' }}>{w.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sized to its content, up to the space available; the nav takes the rest. */}
      <div style={{ flex: '0 1 auto', minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px 6px' }}>
          {isLive && <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />}
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: isLive ? 'var(--color-accent)' : 'var(--color-neutral-600)' }}>
            {view.head}
          </span>
          {view.playersLeft && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--color-neutral-600)' }}>{view.playersLeft}</span>
          )}
        </div>

        {mine && (
          <Link
            href={`/matchups/${view.week}/${mine.index}/`}
            style={{
              display: 'block',
              borderTop: '2px solid var(--color-divider)',
              borderBottom: '2px solid var(--color-divider)',
              padding: '12px 14px 14px',
              cursor: 'pointer',
            }}
          >
            <ScoreHeader
              home={{ name: mine.home.name, meta: mine.home.meta, ...scoreLines(mine.home, mineState) }}
              away={{ name: mine.away.name, meta: mine.away.meta, ...scoreLines(mine.away, mineState) }}
              win={mineState === 'past' ? null : [mine.home.win, mine.away.win]}
              bar={mine.bar}
              awayTone={mineState === 'past' ? 'var(--color-neutral-600)' : 'var(--color-neutral-800)'}
            />
          </Link>
        )}

        <MedianRace view={view} />

        <div style={{
          padding: '11px 14px 7px', font: '800 10px var(--font-heading)', letterSpacing: '.14em',
          color: 'var(--color-neutral-600)', borderBottom: '2px solid var(--color-divider)',
        }}>
          AROUND THE LEAGUE
        </div>

        {rest.map((m) => (
          <GameRow key={m.index} matchup={m} state={gameState(view.phase, m)} href={`/matchups/${view.week}/${m.index}/`} />
        ))}

      </div>

      <BottomNav fill />
    </PhoneFrame>
  );
}

function GameRow({
  matchup, state, href,
}: {
  matchup: MatchupView; state: GameState; href: string;
}) {
  const past = state === 'past';
  const homeWon = matchup.home.scoreValue > matchup.away.scoreValue;
  const hCol = past ? (homeWon ? 'var(--color-text)' : 'var(--color-neutral-600)') : 'var(--color-text)';
  const aCol = past ? (homeWon ? 'var(--color-neutral-600)' : 'var(--color-text)') : 'var(--color-neutral-800)';
  // Before kickoff the odds come from projections alone; draw them on the same bar.
  const bar = past ? null : (matchup.bar ?? barWidth(matchup.home.win));

  const line = (side: SideView, colour: string, first: boolean) => {
    const { num, sub } = scoreLines(side, state);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 10, alignItems: 'center', marginTop: first ? undefined : 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: colour, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{side.name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>{side.meta}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '800 18px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: state === 'future' ? 'var(--color-neutral-400)' : colour }}>{num}</div>
          {sub && (
            <div style={{ font: '400 11.5px/1 var(--font-body)', color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums', marginTop: 3, whiteSpace: 'nowrap' }}>
              {sub}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Link href={href} style={{ display: 'block', borderBottom: '1px solid var(--color-divider)', padding: '10px 14px', cursor: 'pointer' }}>
      {line(matchup.home, hCol, true)}
      {line(matchup.away, aCol, false)}

      {bar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, display: 'flex', height: 4, background: 'var(--color-neutral-300)' }}>
            <span style={{ background: 'var(--color-text)', width: bar }} />
          </div>
          <span style={{ font: '800 9.5px var(--font-heading)', color: 'var(--color-neutral-600)', width: 54, textAlign: 'right' }}>
            {matchup.home.win} / {matchup.away.win}
          </span>
        </div>
      )}
    </Link>
  );
}
