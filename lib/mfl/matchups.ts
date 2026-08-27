import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, isNotYetAvailable, mflGet, num } from './client';

/**
 * League schedule (who plays whom) and weekly results (what they scored).
 *
 * These are kept separate because a week that has not been played yet has a
 * schedule but no results, and under a simulated clock we must not read
 * results for a week that, as far as the app is concerned, has not happened.
 */

export interface SchedulePair {
  /** [home, away] franchise ids. */
  franchiseIds: [string, string];
}

interface RawSchedule {
  schedule?: { weeklySchedule?: RawWeek | RawWeek[] };
}
interface RawWeek { week?: string; matchup?: RawMatchup | RawMatchup[] }
interface RawMatchup { franchise?: RawSide | RawSide[] }
interface RawSide { id?: string; isHome?: string; result?: string; score?: string }

/** The full season's pairings, cached for a day. */
export async function getLeagueSchedule(season: string = SEASON): Promise<Map<number, SchedulePair[]>> {
  const body = await mflGet<RawSchedule>('schedule', { ttl: TTL.SCHEDULE, season });

  const out = new Map<number, SchedulePair[]>();
  for (const w of asArray(body.schedule?.weeklySchedule)) {
    const week = num(w.week);
    if (!week) continue;
    const pairs = asArray(w.matchup).map((m) => {
      const sides = asArray(m.franchise);
      const home = sides.find((s) => s.isHome === '1') ?? sides[0];
      const away = sides.find((s) => s !== home) ?? sides[1];
      return { franchiseIds: [home?.id ?? '', away?.id ?? ''] as [string, string] };
    });
    out.set(week, pairs);
  }
  return out;
}

export interface ResultPlayer {
  playerId: string;
  /** Final points for the week. Under a simulated clock this is the full
   *  game's score and must be gated on whether the game had finished. */
  score: number;
  started: boolean;
}

export interface ResultSide {
  franchiseId: string;
  isHome: boolean;
  /** MFL's final score for the week — the submitted lineup's total. */
  score: number;
  /** Optimal-lineup total. This league's "power points" is the sum of these. */
  optPts: number;
  result: string;
  players: ResultPlayer[];
}

interface RawResults {
  weeklyResults?: { week?: string; matchup?: RawResultMatchup | RawResultMatchup[] };
}
interface RawResultMatchup { franchise?: RawResultSide | RawResultSide[] }
interface RawResultSide {
  id?: string;
  isHome?: string;
  score?: string;
  opt_pts?: string;
  result?: string;
  player?: RawResultPlayer | RawResultPlayer[];
}
interface RawResultPlayer { id?: string; score?: string; status?: string }

/**
 * Box scores for one week. Returns null when the week has not been played —
 * MFL answers with an error rather than an empty body, which is not a failure.
 */
export async function getWeeklyResults(week: number, season: string = SEASON): Promise<ResultSide[][] | null> {
  try {
    const body = await mflGet<RawResults>('weeklyResults', {
      params: { W: week },
      // A finished week never changes, so it can be cached hard.
      ttl: TTL.FINAL_RESULTS,
      season,
      cacheKey: `weeklyResults:${season}:${week}`,
    });

    const matchups = asArray(body.weeklyResults?.matchup);
    if (matchups.length === 0) return null;

    const parsed = matchups.map((m) =>
      asArray(m.franchise).map((f) => ({
        franchiseId: f.id ?? '',
        isHome: f.isHome === '1',
        score: num(f.score),
        optPts: num(f.opt_pts),
        result: f.result ?? '',
        players: asArray(f.player)
          .filter((p) => p.id)
          .map((p) => ({
            playerId: p.id as string,
            score: num(p.score),
            started: p.status === 'starter',
          })),
      })),
    );

    // A scheduled-but-unplayed week comes back with pairings and no players.
    const hasDetail = parsed.some((m) => m.some((f) => f.players.length > 0));
    return hasDetail ? parsed : null;
  } catch (e) {
    if (isNotYetAvailable(e)) return null;
    throw e;
  }
}
