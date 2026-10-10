import { barWidth, fmtScore, formatClock, scoreBar, shareLeft, winPct } from '@/lib/format';
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
  /** Starters' full projection, and what of it is still to be played. */
  projected: number;
  remaining: number;
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
    projected,
    remaining,
    projectedFinal: f.score + remaining,
    ytp: f.ytp,
    done: f.ytp === 0 && f.playing === 0 && f.secondsRemaining === 0,
    view: {
      ...side,
      num: fmtScore(f.score),
      sub: fmtScore(projected || f.score),
      meta: `${record} · ${f.ytp} YTP`,
      scoreValue: f.score,
      projectedFinal: f.score + remaining,
      done: f.ytp === 0 && f.playing === 0 && f.secondsRemaining === 0,
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
    [h.view.win, a.view.win] = winPct(h.projectedFinal, a.projectedFinal, shareLeft(h.remaining + a.remaining, h.projected + a.projected));
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

/* ── Lineups ────────────────────────────────────────────────────────────── */

/**
 * The relay's liveScoring marks each player starter or bench as soon as an
 * owner sets a lineup — before kickoff too — so lineup changes reach the page
 * within minutes instead of waiting for the next build. These re-split the
 * prebuilt rows (and, before kickoff, the projected totals) to match.
 */

/** A franchise's current starters, or null when it hasn't set any. */
export function startersOf(f: LiveFranchise | undefined): Set<string> | null {
  if (!f) return null;
  const ids = Object.entries(f.players).filter(([, [, starter]]) => starter).map(([id]) => id);
  return ids.length ? new Set(ids) : null;
}

/** Before kickoff: projected total, YTP and odds from the submitted starters. */
function preSide(side: SideView, starters: Set<string> | null): { view: SideView; projected: number } | null {
  if (!starters || !side.projections) return null;
  const projected = Number([...starters].reduce((t, id) => t + (side.projections![id] ?? 0), 0).toFixed(2));
  const record = side.meta.split(' · ')[0];
  return {
    projected,
    view: { ...side, num: fmtScore(projected), scoreValue: projected, meta: `${record} · ${starters.size} YTP` },
  };
}

export function applyLineupsToWeek(view: WeekView, live: LiveData): WeekView {
  if (live.week !== view.week || view.phase !== 'pre') return view;
  const matchups = view.matchups.map((m): MatchupView => {
    const h = preSide(m.home, startersOf(live.franchises[m.home.franchiseId]));
    const a = preSide(m.away, startersOf(live.franchises[m.away.franchiseId]));
    if (!h && !a) return m;
    const home = h?.view ?? m.home;
    const away = a?.view ?? m.away;
    [home.win, away.win] = winPct(home.scoreValue, away.scoreValue);
    return { ...m, home, away };
  });
  return { ...view, matchups };
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];
const positionRank = (pos: string) => {
  const i = POSITION_ORDER.indexOf(pos);
  return i === -1 ? POSITION_ORDER.length : i;
};

/** Pair the two sides into home | POS | away rows, as the server does. */
function pairRows(home: BoxPlayerView[], away: BoxPlayerView[], bench: boolean): BoxRowView[] {
  const empty: BoxPlayerView = { name: '', line: '', pts: '', proj: '' };
  const rows: BoxRowView[] = [];
  for (let i = 0; i < Math.max(home.length, away.length); i++) {
    const h = home[i];
    const a = away[i];
    const hp = h?.live?.position ?? '';
    const ap = a?.live?.position ?? '';
    const pos = bench ? 'BN' : h && a ? (hp === ap ? hp : `${hp}/${ap}`) : hp || ap;
    rows.push({ pos, home: h ?? empty, away: a ?? empty });
  }
  return rows;
}

export function applyLineupsToDetail(view: MatchupDetailView, live: LiveData): MatchupDetailView {
  if (live.week !== view.week || view.phase === 'final') return view;
  const homeStarters = startersOf(live.franchises[view.home.franchiseId]);
  const awayStarters = startersOf(live.franchises[view.away.franchiseId]);
  if (!homeStarters && !awayStarters) return view;

  const pre = view.phase === 'pre';
  const points = (p: BoxPlayerView) =>
    pre ? Number(p.proj.replace(/[^\d.-]/g, '')) || 0 : (p.ptsExact ?? (Number(p.pts) || 0));
  const order = (a: BoxPlayerView, b: BoxPlayerView) =>
    positionRank(a.live?.position ?? '') - positionRank(b.live?.position ?? '') || points(b) - points(a);

  const split = (side: 'home' | 'away', starters: Set<string> | null) => {
    const all = [...view.starters, ...view.bench].map((r) => r[side]).filter((p) => p.live);
    if (!starters) {
      return {
        starters: view.starters.map((r) => r[side]).filter((p) => p.name),
        bench: view.bench.map((r) => r[side]).filter((p) => p.name),
      };
    }
    return {
      starters: all.filter((p) => starters.has(p.live!.id)).sort(order),
      bench: all.filter((p) => !starters.has(p.live!.id)).sort(order),
    };
  };
  const home = split('home', homeStarters);
  const away = split('away', awayStarters);

  const next: MatchupDetailView = {
    ...view,
    starters: pairRows(home.starters, away.starters, false),
    bench: pairRows(home.bench, away.bench, true),
  };
  if (pre) {
    const h = preSide(view.home, homeStarters);
    const a = preSide(view.away, awayStarters);
    next.home = h?.view ?? view.home;
    next.away = a?.view ?? view.away;
    const [hw, aw] = winPct(next.home.scoreValue, next.away.scoreValue);
    next.home = { ...next.home, win: hw };
    next.away = { ...next.away, win: aw };
    next.bar = hw;
  }
  return next;
}
