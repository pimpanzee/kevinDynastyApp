/**
 * The league's standings order, shared by the server (standings, playoff
 * odds) and the Standings screen, so it holds no server-only imports.
 */

/** Win share of a "W-L-T" record, ties as halves. */
export function recordPct(r: string): number {
  const [w = 0, l = 0, t = 0] = r.split('-').map(Number);
  return w + l + t ? (w + t / 2) / (w + l + t) : 0;
}

/**
 * The league's sort as MFL's own standings apply it: victory points when the
 * league uses them (else win percentage), then division record, conference
 * record and points for. The settings list H2H after VP, but MFL's standings
 * skip it — at 6 VP each in 2026 it ranks RatCats over Nick at Nite, who beat
 * them — so this matches what MFL shows, which is what seeds the playoffs.
 */
export function compareTeams(
  a: { vp: number | null; record: string; div: string; conf: string; pf: number },
  b: typeof a,
): number {
  if ((b.vp ?? 0) !== (a.vp ?? 0)) return (b.vp ?? 0) - (a.vp ?? 0);
  if (a.vp === null) {
    const d = recordPct(b.record) - recordPct(a.record);
    if (d) return d;
  }
  return recordPct(b.div) - recordPct(a.div) || recordPct(b.conf) - recordPct(a.conf) || b.pf - a.pf;
}
