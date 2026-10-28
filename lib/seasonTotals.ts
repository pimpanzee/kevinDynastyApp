import { resolveNow } from '@/lib/mfl/clock';
import { getNflSchedule, lastCompletedWeek } from '@/lib/mfl/schedule';
import { mflScores } from '@/lib/players';
import { getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';

/**
 * Season-to-date fantasy points and games played for every player, summed
 * from the finished weeks (MFL points, Sleeper's `gp`). Summed rather than
 * read as YTD so a simulated clock never sees games that hadn't happened.
 * Shared by My Team, the League team pages and contract value.
 */
/** `best`: his highest single game (contract value discounts one big game). */
export interface SeasonTotal { pts: number; gp: number; best: number }

async function load() {
  const now = resolveNow().getTime();
  const [nfl, sleeperIds] = await Promise.all([getNflSchedule(), getSleeperIds()]);
  const done = lastCompletedWeek(nfl, now);
  const totals = new Map<string, SeasonTotal>();
  for (let week = 1; week <= done; week++) {
    const [points, stats] = await Promise.all([mflScores(week, true), getSleeperTable('stats', week, true)]);
    const seen = new Set<string>();
    for (const [id, pts] of points) {
      const sid = sleeperIds[id];
      const played = (sid && (stats[sid]?.gp ?? 0) > 0) || pts !== 0;
      const t = totals.get(id) ?? { pts: 0, gp: 0, best: 0 };
      t.pts += pts;
      if (played) { t.gp += 1; t.best = Math.max(t.best, pts); }
      totals.set(id, t);
      seen.add(id);
    }
    // Played but scored exactly nothing and MFL left him out: still a game.
    for (const [id, sid] of Object.entries(sleeperIds)) {
      if (seen.has(id) || !((stats[sid]?.gp ?? 0) > 0)) continue;
      const t = totals.get(id) ?? { pts: 0, gp: 0, best: 0 };
      t.gp += 1;
      totals.set(id, t);
    }
  }
  for (const t of totals.values()) t.pts = Math.round(t.pts * 100) / 100;
  return { done, totals };
}

let cache: ReturnType<typeof load> | null = null;
export const getSeasonTotals = () => (cache ??= load());
