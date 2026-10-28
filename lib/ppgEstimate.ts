import { getNflSchedule } from '@/lib/mfl/schedule';
import { getPlayers, lookup } from '@/lib/mfl/players';
import { scorePoints, type Stats } from '@/lib/scoring';
import { getSeasonTotals } from '@/lib/seasonTotals';
import { getScoringRules, getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';

/**
 * A steadier PPG for contract value: this season's points per game, pulled
 * toward Sleeper's projection by a number of "prior games" per position. A
 * few hot or cold weeks move the estimate less; as games pile up, this
 * season's numbers take over. With 4+ games his single best game is left
 * out, so one 2-touchdown fluke doesn't count as a trend.
 *
 *   estimate = (season pts [− best game] + k × projected PPG) / (games [− 1] + k)
 *
 * The projection is Sleeper's projection for the next week he's projected
 * to play (byes and ruled-out weeks skipped, up to 3 weeks out), scored
 * with this league's rules. With none ahead (long injury, season over), the
 * last three finished weeks' projections stand in. No projection at all →
 * season PPG.
 *
 * Tuned by backtest (2026-10-23): replaying 2021–2025, predicting each
 * player's rest-of-season PPG after weeks 2–12. Against plain season PPG,
 * the average miss fell 18% (QB) to 22% (TE); tuned on 2021–23, the same
 * gain held on 2024–25.
 */

/** How many games the projection counts as (backtest-tuned). */
export const PRIOR_GAMES: Record<string, number> = { QB: 5, RB: 10, WR: 11, TE: 16 };
const LOOK = 3;
/** Games played before the best one is left out. */
const DROP_BEST_FROM = 4;

export function blendPpg(pos: string, pts: number, gp: number, best: number, prior: number | null): number | null {
  if (gp <= 0) return null;
  const drop = gp >= DROP_BEST_FROM;
  const p = drop ? pts - best : pts;
  const n = drop ? gp - 1 : gp;
  if (prior === null) return p / n;
  const k = PRIOR_GAMES[pos] ?? 10;
  return (p + k * prior) / (n + k);
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
    // The next week he's projected to play; else the last finished weeks.
    const next = projected(aheadTables).slice(0, 1);
    const pts = next.length ? next : projected(behindTables);
    const prior = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
    estimates.set(id, blendPpg(pos, t.pts, t.gp, t.best, prior));
  }
  return (id) => estimates.get(id) ?? null;
}

let cache: ReturnType<typeof load> | null = null;
/** Blended PPG by MFL player id; null with no games played. */
export const getPpgEstimator = () => (cache ??= load());
