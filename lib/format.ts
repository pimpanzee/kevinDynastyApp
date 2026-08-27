/** Display helpers shared by the view builders. */

export function fmtMoney(n: number): string {
  return '$' + n.toFixed(2);
}

/** Team and player scores render to one decimal, as in the designs. */
export function fmtScore(n: number): string {
  return n.toFixed(1);
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Weekly fantasy margins are roughly normal with a standard deviation around
 * thirty points, which is what turns a projected margin into a sensible
 * probability rather than a near-certainty.
 */
const MARGIN_SD = 30;

/**
 * Win probability from the projected margin. MFL exposes no such figure, so
 * this is derived, not reported: a normal model over the projection
 * differential, clamped so the bar never reads as a lock. Indicative only.
 */
export function winPct(home: number, away: number): [string, string] {
  const p = normalCdf((home - away) / MARGIN_SD);
  const w = Math.max(3, Math.min(97, Math.round(p * 100)));
  return [`${w}%`, `${100 - w}%`];
}

/** Bar split for a decided game, from the two final scores. */
export function scoreBar(home: number, away: number): string {
  const total = home + away;
  if (total <= 0) return '50%';
  return Math.max(6, Math.min(94, Math.round((home / total) * 100))) + '%';
}

/** A percentage string as a bar width, tolerating "—" and blanks. */
export function barWidth(pct: string): string {
  return /^\d+%$/.test(pct) ? pct : '0%';
}
