/**
 * Aging curves: how a player's output tends to change from one season to
 * the next, by position and age, relative to the average player.
 *
 * Measured (2026-10-23) on every 8+ game season with 8+ PPG from 2010–2025
 * (Sleeper stats, league scoring): next season's points, games missed
 * included, by age, against the position's average, smoothed over
 * neighbouring ages. Missed games count, so older players' injuries and
 * retirements show up as decline. TE samples are small past 29.
 *
 * Each entry is [age up to, change over the next season].
 */
const CURVES: Record<string, Array<[number, number]>> = {
  QB: [[22, 0.12], [23, 0.04], [32, 0], [33, -0.06], [34, -0.07], [99, -0.1]],
  RB: [[21, 0.15], [22, 0.12], [23, 0.08], [24, 0.04], [25, 0.02], [26, -0.03], [27, -0.09], [28, -0.15], [99, -0.2]],
  WR: [[21, 0.15], [22, 0.08], [23, 0.05], [27, 0.02], [28, -0.07], [29, -0.1], [30, -0.15], [99, -0.17]],
  TE: [[24, 0], [27, 0.02], [29, 0], [30, -0.05], [99, -0.1]],
};

/** PPG change over the season after a player turns `age` (whole years). */
export function yearlyChange(pos: string, age: number): number {
  const curve = CURVES[pos];
  if (!curve) return 0;
  return (curve.find(([upTo]) => Math.floor(age) <= upTo) ?? curve[curve.length - 1])[1];
}

/** Expected PPG for this season and each one after, `years` in all. No age → flat. */
export function ppgPath(pos: string, ppg: number, age: number | undefined, years: number): number[] {
  const out = [ppg];
  for (let k = 1; k < years; k++) out.push(age === undefined ? ppg : out[k - 1] * (1 + yearlyChange(pos, age + k - 1)));
  return out;
}
