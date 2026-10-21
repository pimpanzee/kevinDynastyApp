/**
 * The league's tiebreakers, from the rule book. Shared by the server
 * (standings, playoff odds) and the Standings screen, so no server imports.
 *
 * Victory points come first (2026 on), then overall record, then:
 * - division winners (and the top seed in each conference):
 *   head-to-head, division record, conference record, points for;
 * - the wild card: conference record, points for, head-to-head.
 * Strength of victory, the division list's last step, is left out — it only
 * matters when two teams also tie on points to the hundredth.
 */

export interface SortKey {
  id: string;
  /** Victory points, or null when the league doesn't use them. */
  vp: number | null;
  record: string;
  div: string;
  conf: string;
  pf: number;
  /** Head-to-head against each opponent met: wins minus losses. */
  h2h: Record<string, number>;
}

/** Win share of a "W-L-T" record, ties as halves. */
export function recordPct(r: string): number {
  const [w = 0, l = 0, t = 0] = r.split('-').map(Number);
  return w + l + t ? (w + t / 2) / (w + l + t) : 0;
}

const lead = (a: SortKey, b: SortKey) => (b.vp ?? 0) - (a.vp ?? 0) || recordPct(b.record) - recordPct(a.record);
const headToHead = (a: SortKey, b: SortKey) => (b.h2h[a.id] ?? 0) - (a.h2h[b.id] ?? 0);

/** Division order (who wins it, who gets the bye). Negative when `a` ranks higher. */
export function compareDivision(a: SortKey, b: SortKey): number {
  return lead(a, b) || headToHead(a, b) || recordPct(b.div) - recordPct(a.div)
    || recordPct(b.conf) - recordPct(a.conf) || b.pf - a.pf;
}

/** Wild-card order among a conference's non-division-winners. */
export function compareWildcard(a: SortKey, b: SortKey): number {
  return lead(a, b) || recordPct(b.conf) - recordPct(a.conf) || b.pf - a.pf || headToHead(a, b);
}

/** The first step that separates two teams in wild-card order, for the race line. */
export function wildcardTiebreak(a: SortKey, b: SortKey): string | null {
  if ((a.vp ?? 0) !== (b.vp ?? 0)) return null;
  if (recordPct(a.record) !== recordPct(b.record)) return 'record';
  if (recordPct(a.conf) !== recordPct(b.conf)) return 'conference record';
  if (a.pf !== b.pf) return 'points';
  return headToHead(a, b) ? 'head-to-head' : null;
}
