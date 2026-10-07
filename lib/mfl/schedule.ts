import { GAME_DURATION_MS, SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet, num } from './client';

/**
 * NFL schedule: which teams play when. This is what turns a timestamp into an
 * NFL week, and what tells us whether a given player's game has finished, is
 * in play, or has not kicked off — the three per-player states the box score
 * design distinguishes.
 */

export interface NflGame {
  /** Kickoff, in epoch ms. */
  kickoff: number;
  teams: [string, string];
  /** The home side, when MFL marks one. */
  home?: string;
}

export interface NflWeek {
  week: number;
  games: NflGame[];
}

interface RawNflSchedule {
  fullNflSchedule?: { nflSchedule?: RawWeek | RawWeek[] };
  nflSchedule?: RawWeek | RawWeek[];
}
interface RawWeek {
  week?: string;
  matchup?: RawGame | RawGame[];
}
interface RawGame {
  kickoff?: string;
  team?: Array<{ id?: string; isHome?: string }>;
}

/** The whole season's schedule in one request, cached for a day. */
export async function getNflSchedule(season: string = SEASON): Promise<NflWeek[]> {
  const body = await mflGet<RawNflSchedule>('nflSchedule', {
    params: { W: 'ALL' },
    league: false,
    season,
    ttl: TTL.SCHEDULE,
    cacheKey: `nflSchedule:${season}:ALL`,
  });

  const weeks = asArray(body.fullNflSchedule?.nflSchedule ?? body.nflSchedule);
  return weeks
    .map((w) => ({
      week: num(w.week),
      games: asArray(w.matchup)
        .map((g) => {
          const raw = asArray(g.team);
          const teams = raw.map((t) => t.id ?? '');
          const home = raw.find((t) => t.isHome === '1')?.id;
          return { kickoff: num(g.kickoff) * 1000, teams: [teams[0] ?? '', teams[1] ?? ''] as [string, string], home };
        })
        .filter((g) => g.kickoff > 0),
    }))
    .filter((w) => w.week > 0 && w.games.length > 0)
    .sort((a, b) => a.week - b.week);
}

export type GameState = 'done' | 'in_play' | 'pending';

/** Map each NFL team to its kickoff for a given week. */
export function teamKickoffs(week: NflWeek | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of week?.games ?? []) {
    map.set(g.teams[0], g.kickoff);
    map.set(g.teams[1], g.kickoff);
  }
  return map;
}

/**
 * Where a team's game sits relative to `now`. A game is treated as complete
 * once GAME_DURATION_MS has elapsed since kickoff — MFL exposes no historical
 * clock, so this is the honest approximation.
 */
export function gameState(kickoff: number | undefined, now: number): GameState {
  if (kickoff === undefined) return 'pending';
  if (now >= kickoff + GAME_DURATION_MS) return 'done';
  if (now >= kickoff) return 'in_play';
  return 'pending';
}

/**
 * The NFL week containing `now`: the last week whose first game has kicked off.
 * Before the season starts this is week 1, which reads as entirely upcoming.
 */
export function currentWeek(schedule: NflWeek[], now: number): number {
  let current = schedule[0]?.week ?? 1;
  for (const w of schedule) {
    const first = Math.min(...w.games.map((g) => g.kickoff));
    if (first <= now) current = w.week;
    else break;
  }
  return current;
}

export function weekPhase(schedule: NflWeek[], week: number, now: number): 'pre' | 'live' | 'final' {
  const current = currentWeek(schedule, now);
  if (week < current) return 'final';
  if (week > current) return 'pre';
  const w = schedule.find((x) => x.week === week);
  if (!w) return 'pre';
  const last = Math.max(...w.games.map((g) => g.kickoff));
  // Every game kicked off and finished — the week is done even though it is
  // still the most recent one.
  return now >= last + GAME_DURATION_MS ? 'final' : 'live';
}

/** First kickoff of a week, for the "KICKOFF THU 8:15 ET" strip. */
export function firstKickoff(schedule: NflWeek[], week: number): number | undefined {
  const w = schedule.find((x) => x.week === week);
  if (!w || w.games.length === 0) return undefined;
  return Math.min(...w.games.map((g) => g.kickoff));
}

/**
 * The highest week for which every game has finished. Standings are built from
 * these weeks only — a week still in progress has not produced a result yet,
 * just as a real standings table does not move until the games are done.
 */
export function lastCompletedWeek(schedule: NflWeek[], now: number): number {
  let last = 0;
  for (const w of schedule) {
    const done = w.games.every((g) => now >= g.kickoff + GAME_DURATION_MS);
    if (!done) break;
    last = w.week;
  }
  return last;
}
