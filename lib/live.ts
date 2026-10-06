import { barWidth, fmtScore, formatClock, scoreBar, winPct } from '@/lib/format';
import type { BoxPlayerView, BoxRowView, MatchupDetailView, MatchupView, SideView, WeekView } from '@/lib/types';
import { scoreBreakdown, statLine, trimStats, type Stats } from '@/lib/scoring';

/**
 * Live-score overlay. Pages are prebuilt, so during games the browser polls
 * the relay in worker/ and patches scores, odds and player lines into the
 * view the build produced. Everything here mirrors what lib/mfl/view.ts does
 * on the server, from MFL's liveScoring instead of weeklyResults.
 */

/** What the relay returns — see normalise() in worker/src/index.js. */
export interface LiveData {
  week: number;
  fetchedAt: number;
  stale: boolean;
  franchises: Record<string, LiveFranchise>;
}

interface LiveFranchise {
  score: number;
  ytp: number;
  playing: number;
  secondsRemaining: number;
  /** playerId → [score, isStarter (1/0), gameSecondsRemaining] */
  players: Record<string, [number, number, number]>;
}

/** A full NFL game, as MFL counts gameSecondsRemaining. */
const GAME_SECONDS = 3600;

interface LiveSide {
  view: SideView;
  live: number;
  projectedFinal: number;
  ytp: number;
  done: boolean;
}

function liveSide(side: SideView, f: LiveFranchise | undefined): LiveSide | null {
  if (!f) return null;
  const proj = side.projections ?? {};
  let projected = 0;
  // What the starters still to come are projected to add, so the odds move
  // through the day rather than sitting on the pre-game number.
  let remaining = 0;
  for (const [id, [, starter, secs]] of Object.entries(f.players)) {
    if (!starter) continue;
    const p = proj[id] ?? 0;
    projected += p;
    remaining += p * Math.min(1, secs / GAME_SECONDS);
  }
  const record = side.meta.split(' · ')[0];
  return {
    live: f.score,
    projectedFinal: f.score + remaining,
    ytp: f.ytp,
    done: f.ytp === 0 && f.playing === 0 && f.secondsRemaining === 0,
    view: {
      ...side,
      num: fmtScore(f.score),
      sub: fmtScore(projected || f.score),
      meta: `${record} · ${f.ytp} YTP`,
      scoreValue: f.score,
    },
  };
}

/** Score both sides and settle the odds, or the result once both are done. */
function scoreMatchup(home: SideView, away: SideView, live: LiveData) {
  const h = liveSide(home, live.franchises[home.franchiseId]);
  const a = liveSide(away, live.franchises[away.franchiseId]);
  if (!h || !a) return null;
  const decided = h.done && a.done;
  if (decided) {
    h.view.win = h.live >= a.live ? 'W' : 'L';
    a.view.win = a.live > h.live ? 'W' : 'L';
  } else {
    [h.view.win, a.view.win] = winPct(h.projectedFinal, a.projectedFinal);
  }
  return { h, a, decided, bar: decided ? scoreBar(h.live, a.live) : barWidth(h.view.win) };
}

export function applyLiveToWeek(view: WeekView, live: LiveData): WeekView {
  if (live.week !== view.week) return view;
  let myYtp = 0;
  const matchups = view.matchups.map((m): MatchupView => {
    const s = scoreMatchup(m.home, m.away, live);
    if (!s) return m;
    if (m.isMine) myYtp = s.h.view.franchiseId === view.myFranchiseId ? s.h.ytp : s.a.ytp;
    return { ...m, final: s.decided, home: s.h.view, away: s.a.view, bar: s.bar, tail: s.decided ? 'FINAL' : null };
  });
  return {
    ...view,
    phase: 'live',
    head: 'LIVE',
    clock: formatClock(new Date(live.fetchedAt)),
    playersLeft: `${myYtp} YET TO PLAY`,
    matchups,
  };
}

export function applyLiveToDetail(view: MatchupDetailView, live: LiveData): MatchupDetailView {
  if (live.week !== view.week) return view;
  const s = scoreMatchup(view.home, view.away, live);
  if (!s) return view;

  const players: Record<string, [number, number, number]> = {
    ...live.franchises[view.home.franchiseId]?.players,
    ...live.franchises[view.away.franchiseId]?.players,
  };
  const patch = (p: BoxPlayerView): BoxPlayerView => {
    const l = p.live && players[p.live.id];
    if (!p.live || !l) return p;
    const [score, , secs] = l;
    const line =
      secs === 0
        ? `${p.live.team} · FINAL`
        : secs >= GAME_SECONDS
          ? `${p.live.team} · ${p.live.kickoff} · yet to play`
          : `${p.live.team} · in play`;
    const pts = secs >= GAME_SECONDS ? 0 : score;
    return { ...p, pts: fmtScore(pts), ptsExact: pts, line };
  };
  const patchRows = (rows: BoxRowView[]) => rows.map((r) => ({ ...r, home: patch(r.home), away: patch(r.away) }));

  return {
    ...view,
    phase: 'live',
    clock: formatClock(new Date(live.fetchedAt)),
    tag: s.decided ? 'FINAL' : 'LIVE',
    liveDot: !s.decided,
    home: s.h.view,
    away: s.a.view,
    bar: s.bar,
    starters: patchRows(view.starters),
    bench: patchRows(view.bench),
  };
}

/**
 * Rescore bylines and breakdowns from live stats. Runs after the score
 * overlay, so each breakdown adds up to the points the row now shows; a
 * player whose game has not started keeps a blank byline.
 */
export function applyStatsToDetail(view: MatchupDetailView, stats: Record<string, Stats>): MatchupDetailView {
  const rules = view.scoring?.rules;
  if (!rules) return view;
  const patch = (p: BoxPlayerView): BoxPlayerView => {
    const id = p.live?.sleeperId;
    if (!p.live || !id || p.pts === '—' || p.line.includes('yet to play')) return p;
    const s = trimStats(stats[id]);
    return {
      ...p,
      byline: statLine(p.live.position, s),
      breakdown: scoreBreakdown(p.live.position, s, rules, p.ptsExact ?? Number(p.pts)),
    };
  };
  const patchRows = (rows: BoxRowView[]) => rows.map((r) => ({ ...r, home: patch(r.home), away: patch(r.away) }));
  return { ...view, starters: patchRows(view.starters), bench: patchRows(view.bench) };
}
