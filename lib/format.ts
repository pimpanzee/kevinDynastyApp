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
 * this is derived, not reported: a normal model over the projected final
 * margin. `left` is the share of both sides' projected points still to be
 * played (1 before kickoff, falling to 0): the uncertainty shrinks with it,
 * since points already scored can't move. Clamped to 3–97% before kickoff
 * and 1–99% once games are under way. Indicative only.
 */
export function winPct(home: number, away: number, left = 1): [string, string] {
  const share = Math.max(0, Math.min(1, left));
  const sd = MARGIN_SD * Math.sqrt(share);
  const p = sd < 0.5 ? (home === away ? 0.5 : home > away ? 1 : 0) : normalCdf((home - away) / sd);
  const lo = share >= 1 ? 3 : 1;
  const w = Math.max(lo, Math.min(100 - lo, Math.round(p * 100)));
  return [`${w}%`, `${100 - w}%`];
}

/** Share of both sides' projected points still to be played, for winPct. */
export function shareLeft(remaining: number, projected: number): number {
  return projected > 0 ? remaining / projected : 1;
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

const ET = 'America/New_York';

/** "SUN 1:07 ET" — the status-bar clock format used across the designs. */
export function formatClock(d: Date): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ET })
    .format(d)
    .toUpperCase();
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: ET,
  })
    .format(d)
    .replace(/\s?[AP]M$/, '');
  return `${day} ${time} ET`;
}

/** "SUN 1:00 ET" — kickoff labels on matchup rows. */
export function formatKickoff(ms: number): string {
  return formatClock(new Date(ms));
}
