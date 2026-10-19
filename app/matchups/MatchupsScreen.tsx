'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderButton } from '@/components/HeaderBar';
import LineupAlert from '@/components/LineupAlert';
import MedianRace from '@/components/MedianRace';
import PhoneFrame from '@/components/PhoneFrame';
import TeamAvatar from '@/components/TeamAvatar';
import WeekMenu from '@/components/WeekMenu';
import { barWidth } from '@/lib/format';
import { applyLineupsToWeek, applyLiveToWeek, startersOf } from '@/lib/live';
import { startersWithIssues } from '@/lib/lineupAlerts';
import { mineOnLeft, personalizeWeek, useMyTeam } from '@/lib/myTeam';
import type { MatchupView, Phase, SideView, WeekView } from '@/lib/types';
import { useLive } from '@/lib/useLive';

type GameState = 'future' | 'active' | 'past';

/** Per matchup: a game decided early in a live week is already past. */
function gameState(phase: Phase, m: MatchupView): GameState {
  if (phase === 'pre') return 'future';
  return phase === 'final' || m.final ? 'past' : 'active';
}

/** Pre-game: a dash with the projection under it. Live: score over projection. Final: score alone. */
function scoreLines(side: SideView, state: GameState): { num: string; proj: string } {
  if (state === 'future') return { num: '—', proj: side.num };
  if (state === 'active') return { num: side.num, proj: side.sub.replace(/^proj\s*/i, '') };
  return { num: side.num, proj: '' };
}

/** Odds bar split: win probability while in doubt, the score split once final. */
function split(m: MatchupView, state: GameState): number | null {
  if (state === 'past') {
    const t = m.home.scoreValue + m.away.scoreValue;
    return t > 0 ? Math.round((m.home.scoreValue / t) * 100) : null;
  }
  const w = parseInt(barWidth(m.home.win), 10);
  return /^\d+%$/.test(m.home.win) ? w : null;
}

/** A side's record line without the yet-to-play count (league rows before kickoff, finished games). */
const recordOnly = (meta: string) => meta.replace(/\s·\s\d+ YTP$/, '');

const DISPLAY = (size: number, weight = 700) => `${weight} ${size}px/1 var(--font-display)`;

export default function MatchupsScreen({ view: built }: { view: WeekView }) {
  const live = useLive(built.week, built.liveWindow);
  const team = useMyTeam(built.myFranchiseId);
  // Scores once games are under way; lineups (and pre-game projections) any time.
  const scored = live?.started ? applyLiveToWeek(built, live) : built;
  const view = personalizeWeek(live ? applyLineupsToWeek(scored, live) : scored, team);
  const router = useRouter();
  const [weekOpen, setWeekOpen] = useState(false);

  // Starters who won't score: the live lineup when the relay has one, else the build's.
  const alerts = built.lineupAlerts && view.phase !== 'final'
    ? startersWithIssues(
        [...(startersOf(live?.franchises[team]) ?? built.lineupAlerts.starters[team] ?? [])],
        built.lineupAlerts.problems,
      )
    : [];

  const pickWeek = (n: number) => {
    setWeekOpen(false);
    if (n !== view.week) router.push(`/matchups/${n}/`);
  };

  const first = view.matchups[0];
  // Your matchup always has you on the left, home or away.
  const mine = first?.isMine ? mineOnLeft(first, team) : first;
  const rest = view.matchups.slice(1);

  // Arriving from a matchup page's week picker on your own game: open yours in this week.
  useEffect(() => {
    if (mine?.isMine && new URLSearchParams(window.location.search).get('open') === 'mine') {
      router.replace(`/matchups/${view.week}/${mine.index}/`);
    }
  }, [mine?.isMine, mine?.index, router, view.week]);

  return (
    <PhoneFrame>
      <HeaderBar right={<HeaderButton aria-expanded={weekOpen} onClick={() => setWeekOpen((v) => !v)}>WEEK {view.week}</HeaderButton>} />
      {weekOpen && <WeekMenu weeks={view.weeks} current={view.week} onPick={pickWeek} onClose={() => setWeekOpen(false)} />}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {mine && alerts.length > 0 && (
          <LineupAlert alerts={alerts} href={`/matchups/${view.week}/${mine.index}/`} />
        )}

        {mine && <MyCard m={mine} state={gameState(view.phase, mine)} href={`/matchups/${view.week}/${mine.index}/`} flush={alerts.length === 0} />}

        <MedianRace view={view} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', marginTop: 8 }}>
          <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
          <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>AROUND THE LEAGUE</span>
        </div>

        {rest.map((m) => (
          <GameRow key={m.index} m={m} state={gameState(view.phase, m)} href={`/matchups/${view.week}/${m.index}/`} />
        ))}
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}

/**
 * Your matchup. You are always on the left and always volt; the opponent
 * brightens when they lead. The bar's bright half is whoever is favoured
 * (once final, the score split).
 *
 * `flush`: nothing sits above it, so it butts against the header (whose
 * bottom border is the only line) and its fill carries up into the
 * pull-down bounce instead of a strip of page background.
 */
function MyCard({ m, state, href, flush }: { m: MatchupView; state: GameState; href: string; flush: boolean }) {
  const me = scoreLines(m.home, state);
  const opp = scoreLines(m.away, state);
  const pre = state === 'future';
  const oppLeads = m.away.scoreValue > m.home.scoreValue;
  const oppTone = pre ? 'var(--ink-3)' : oppLeads ? 'var(--ink)' : 'var(--ink-2)';
  const pct = split(m, state);
  const fav = (pct ?? 50) >= 50;
  const scoreFont = `800 ${pre ? 28 : 52}px/46px var(--font-display)`;
  const sub = { font: '500 12px/1 var(--font-body)', color: 'var(--ink-3)', marginTop: 5, fontVariantNumeric: 'tabular-nums' } as const;
  const nameRow = (side: SideView, right: boolean, mineChip: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexDirection: right ? 'row-reverse' : 'row', textAlign: right ? 'right' : 'left' }}>
      <TeamAvatar name={side.name} icon={side.icon ?? null} size={30} mine={mineChip} />
      <div style={{ minWidth: 0 }}>
        <div style={{ font: DISPLAY(17), letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: right ? oppTone === 'var(--ink-3)' ? 'var(--ink)' : oppTone : 'var(--ink)' }}>{side.name.toUpperCase()}</div>
        <div style={{ font: '500 11px/1.2 var(--font-body)', color: 'var(--ink-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{state === 'past' ? recordOnly(side.meta) : side.meta}</div>
      </div>
    </div>
  );
  return (
    <Link href={href} aria-label={`Your matchup: ${m.home.name} ${me.num}, ${m.away.name} ${opp.num}`} style={{ display: 'block', background: 'var(--bg-100)', borderTop: flush ? 'none' : '1px solid var(--edge)', borderBottom: '1px solid var(--edge)', position: 'relative' }}>
      {flush && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: '100vh', background: 'var(--bg-100)' }} />}
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'end', gap: 12 }}>
          {nameRow(m.home, false, true)}
          {nameRow(m.away, true, false)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginTop: 12 }}>
          <div>
            <div style={{ font: scoreFont, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: pre ? 'var(--ink-3)' : 'var(--volt)' }}>{me.num}</div>
            {me.proj && <div style={sub}>{me.proj}</div>}
          </div>
          <div style={{ padding: '0 10px', font: DISPLAY(13), letterSpacing: '.1em', fontVariantNumeric: 'tabular-nums', color: state === 'past' ? 'var(--ink)' : 'var(--ink-2)' }}>
            {state === 'past' ? 'FINAL' : pct != null ? `${pct}% / ${100 - pct}%` : ''}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: scoreFont, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: oppTone }}>{opp.num}</div>
            {opp.proj && <div style={sub}>{opp.proj}</div>}
          </div>
        </div>
        {pct != null && (
          <div style={{ display: 'flex', gap: 2, height: 7, marginTop: 12 }}>
            <span style={{ width: `${pct}%`, background: fav ? 'var(--ink)' : 'var(--bg-300)' }} />
            <span style={{ flex: 1, background: fav ? 'var(--bg-300)' : 'var(--ink)' }} />
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * One other matchup: MFL's home team on top, never re-sorted by score so rows
 * don't jump during live updates. The trailing side dims once scoring starts.
 */
function GameRow({ m, state, href }: { m: MatchupView; state: GameState; href: string }) {
  const pre = state === 'future';
  const homeLeads = m.home.scoreValue >= m.away.scoreValue;
  const pct = state === 'past' ? null : split(m, state);
  const line = (side: SideView, leads: boolean) => {
    const { num, proj } = scoreLines(side, state);
    const tone = pre || leads ? 'var(--ink)' : 'var(--ink-2)';
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <TeamAvatar name={side.name} icon={side.icon ?? null} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '600 14px/1.2 var(--font-body)', color: tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{side.name}</div>
          <div style={{ font: '500 11px/1.2 var(--font-body)', color: 'var(--ink-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{state === 'active' ? side.meta : recordOnly(side.meta)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: DISPLAY(18), fontVariantNumeric: 'tabular-nums', color: tone }}>{num}</div>
          {proj && <div style={{ font: '500 11px/1.2 var(--font-body)', color: 'var(--ink-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{proj}</div>}
        </div>
      </div>
    );
  };
  const lFav = (pct ?? 0) >= 50;
  return (
    <Link href={href} style={{ display: 'block', padding: '8px 16px 9px', borderBottom: '1px solid var(--line)' }}>
      {line(m.home, homeLeads)}
      {line(m.away, !homeLeads)}
      {pct != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ width: 30, flex: 'none', font: DISPLAY(12, 800), fontVariantNumeric: 'tabular-nums', color: lFav ? 'var(--ink)' : 'var(--ink-3)' }}>{pct}%</span>
          <span style={{ flex: 1, display: 'flex', gap: 2, height: 5 }}>
            <span style={{ width: `${pct}%`, background: lFav ? 'var(--ink)' : 'var(--bg-300)' }} />
            <span style={{ flex: 1, background: lFav ? 'var(--bg-300)' : 'var(--ink)' }} />
          </span>
          <span style={{ width: 30, flex: 'none', textAlign: 'right', font: DISPLAY(12, 800), fontVariantNumeric: 'tabular-nums', color: lFav ? 'var(--ink-3)' : 'var(--ink)' }}>{100 - pct}%</span>
        </div>
      )}
      {state === 'past' && <div style={{ marginTop: 6, font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)' }}>FINAL</div>}
    </Link>
  );
}
