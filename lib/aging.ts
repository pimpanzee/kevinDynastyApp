/**
 * Aging curves: how a player's PPG tends to change from one season to the
 * next, by position and age. Rough shapes from public research on NFL
 * aging (RBs peak early and fall fast after 27; WRs peak around 25–28 and
 * slide slowly; TEs develop late; QBs hold into their early 30s). Starting
 * guesses, to be tuned on league history.
 *
 * Each entry is [age up to, change in PPG over the next season].
 */
const CURVES: Record<string, Array<[number, number]>> = {
  QB: [[23, 0.08], [25, 0.05], [32, 0], [33, -0.03], [34, -0.06], [99, -0.1]],
  RB: [[23, 0.05], [24, 0.02], [25, 0], [26, -0.05], [27, -0.1], [28, -0.15], [99, -0.2]],
  WR: [[23, 0.08], [24, 0.05], [26, 0.02], [27, 0], [28, -0.03], [29, -0.06], [30, -0.1], [99, -0.15]],
  TE: [[23, 0.1], [25, 0.07], [27, 0.02], [28, 0], [29, -0.05], [30, -0.08], [99, -0.15]],
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
