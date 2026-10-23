import { bestLineup } from '@/lib/mfl/lineup';
import type { TitleEquity } from '@/lib/mfl/playoffOdds';
import type { TeamPlayer, TeamsData } from '@/lib/types';

/**
 * Reading title equity (lib/mfl/playoffOdds.ts) for a trade, in the browser.
 *
 * A trade changes each team's best lineup. The change in expected weekly
 * lineup points is looked up on that team's curve (odds and winnings at a
 * range of weekly point changes, from the simulations) to give playoff odds,
 * title odds and expected league winnings after the trade.
 */

export interface SeasonOutlook { playoffs: number; title: number; winnings: number }

/**
 * Expected weekly points of a roster's best lineup. Only active players can
 * start; anyone on IR (slot or MFL injury tag) counts as zero, since most
 * won't be back for long enough to matter.
 */
export function lineupPoints(roster: TeamPlayer[], lineup: TeamsData['lineup']): number {
  const pool = roster
    .filter((p) => p.slot === 'ACTIVE' && p.injury !== 'IR')
    .map((p) => ({ id: p.id, position: p.pos, points: p.est ?? 0 }));
  return bestLineup(pool, lineup).reduce((t, p) => t + p.points, 0);
}

/** Odds and winnings with `delta` weekly points added, read between the simulated points. */
export function outlook(eq: TitleEquity, teamId: string, delta: number): SeasonOutlook | null {
  const row = eq.teams[teamId];
  if (!row) return null;
  const xs = eq.shifts;
  const d = Math.max(xs[0], Math.min(xs[xs.length - 1], delta));
  let k = 0;
  while (k < xs.length - 2 && d > xs[k + 1]) k++;
  const f = (d - xs[k]) / (xs[k + 1] - xs[k]);
  const at = (ys: number[]) => ys[k] + f * (ys[k + 1] - ys[k]);
  return { playoffs: at(row.playoffs), title: at(row.title), winnings: at(row.winnings) };
}

export interface TeamImpact {
  /** Change in expected weekly lineup points. */
  delta: number;
  before: SeasonOutlook;
  after: SeasonOutlook;
}

/** One side of a trade: the team's roster loses `out` and gains `inn`. */
export function teamImpact(eq: TitleEquity, teamId: string, roster: TeamPlayer[], out: string[], inn: TeamPlayer[], lineup: TeamsData['lineup']): TeamImpact | null {
  const before = lineupPoints(roster, lineup);
  const after = lineupPoints([...roster.filter((p) => !out.includes(p.id)), ...inn], lineup);
  const delta = after - before;
  const b = outlook(eq, teamId, 0);
  const a = outlook(eq, teamId, delta);
  return a && b ? { delta, before: b, after: a } : null;
}
