import { getNflSchedule } from '@/lib/mfl/schedule';
import { getPlayers, lookup } from '@/lib/mfl/players';
import { scorePoints, type Stats } from '@/lib/scoring';
import { getSeasonTotals } from '@/lib/seasonTotals';
import { getScoringRules, getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';

/**
 * A steadier PPG for contract value: this season's points per game, pulled
 * toward Sleeper's projection by a fixed number of "prior games" per
 * position. A few hot or cold weeks move the estimate less; as games pile
 * up, this season's numbers take over.
 *
 *   estimate = (season pts + k × projected PPG) / (games played + k)
 *
 * The projection is Sleeper's weekly projections, scored with this league's
 * rules, averaged over the next three weeks he's projected to play (byes and
 * ruled-out weeks skipped). With none ahead (long injury, season over), the
 * last three finished weeks' projections stand in. No projection at all →
 * plain season PPG.
 */

/** How many games the projection counts as. Positions that swing more week to week lean on it longer. */
export const PRIOR_GAMES: Record<string, number> = { QB: 5, RB: 6, WR: 7, TE: 8 };
const LOOK = 3;

export function blendPpg(pos: string, pts: number, gp: number, prior: number | null): number | null {
  if (gp <= 0) return null;
  if (prior === null) return pts / gp;
  const k = PRIOR_GAMES[pos] ?? 6;
  return (pts + k * prior) / (gp + k);
}

async function load(): Promise<(id: string) => number | null> {
  const [{ done, totals }, nfl, sleeperIds, rules, players] = await Promise.all([
    getSeasonTotals(), getNflSchedule(), getSleeperIds(), getScoringRules(), getPlayers(),
  ]);
  const last = nfl.length ? Math.max(...nfl.map((w) => w.week)) : 18;
  const ahead: number[] = [];
  for (let w = done + 1; w <= Math.min(done + LOOK, last); w++) ahead.push(w);
  const behind: number[] = [];
  for (let w = done; w >= Math.max(1, done - LOOK + 1); w--) behind.push(w);

  const table = (week: number, settled: boolean) =>
    getSleeperTable('projections', week, settled).catch(() => ({}) as Record<string, Stats>);
  const [aheadTables, behindTables] = await Promise.all([
    Promise.all(ahead.map((w) => table(w, false))),
    Promise.all(behind.map((w) => table(w, true))),
  ]);

  const estimates = new Map<string, number | null>();
  for (const [id, t] of totals) {
    if (t.gp <= 0) continue;
    const pos = lookup(players, id).position;
    const sid = sleeperIds[id];
    const projected = (tables: Array<Record<string, Stats>>) => {
      if (!sid) return [];
      return tables
        .map((tb) => tb[sid])
        .filter((s): s is Stats => !!s && (s.gp ?? 1) > 0)
        .map((s) => scorePoints(pos, s, rules))
        .filter((p) => p > 0);
    };
    let pts = projected(aheadTables);
    if (!pts.length) pts = projected(behindTables);
    const prior = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
    estimates.set(id, blendPpg(pos, t.pts, t.gp, prior));
  }
  return (id) => estimates.get(id) ?? null;
}

let cache: ReturnType<typeof load> | null = null;
/** Blended PPG by MFL player id; null with no games played. */
export const getPpgEstimator = () => (cache ??= load());
