/**
 * Lineup alerts: a starter who won't (or likely won't) score. Shared by the
 * build, which flags every rostered player, and the browser, which checks
 * the user's current starters against those flags.
 */

export type LineupIssue = 'IR' | 'OUT' | 'BYE' | 'DOUBTFUL' | 'NO PROJ';

export interface LineupProblem {
  name: string;
  issue: LineupIssue;
  /** His game's kickoff (ms); once it's under way the alert is moot. Null on a bye. */
  kickoff: number | null;
}

/** The worst thing wrong with a starter, or null if he looks fine. */
export function lineupIssue(p: { injury?: string; bye: boolean; proj: number | null }): LineupIssue | null {
  if (p.injury === 'IR') return 'IR';
  if (p.injury === 'O') return 'OUT';
  if (p.bye) return 'BYE';
  if (p.injury === 'D') return 'DOUBTFUL';
  if (!p.proj) return 'NO PROJ';
  return null;
}

/** Alerts for one franchise's starters whose games haven't kicked off. */
export function startersWithIssues(
  starters: string[],
  problems: Record<string, LineupProblem>,
  now = Date.now(),
): Array<LineupProblem & { id: string }> {
  return starters
    .filter((id) => problems[id] && (problems[id].kickoff === null || problems[id].kickoff! > now))
    .map((id) => ({ id, ...problems[id] }));
}
