/**
 * Pure helpers ported verbatim from the design files' script blocks.
 *
 * The two `Math.sin` PRNGs below are deliberate: they are what make the
 * synthesized rosters and the non-your-matchup boxscores deterministic.
 * Swapping in `Math.random()` would reshuffle every render and break
 * hydration. Keep the constants exactly as the mockups had them.
 */

/** Win-probability split from two projections, clamped to 6–94%. */
export function winPct(h: string | number, a: string | number): [string, string] {
  const w = Math.max(6, Math.min(94, Math.round(50 + (Number(h) - Number(a)) * 1.6)));
  return [w + '%', 100 - w + '%'];
}

/** Bar split from two final scores, clamped to 6–94%. */
export function pctBar(a: string | number, b: string | number): string {
  return Math.max(6, Math.min(94, Math.round((Number(a) / (Number(a) + Number(b))) * 100))) + '%';
}

/** PRNG used by Matchup Detail's boxscore generator. */
export function rnd(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** PRNG used by Roster's franchise synthesizer. */
export function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function fmtMoney(n: number): string {
  return '$' + n.toFixed(2);
}
