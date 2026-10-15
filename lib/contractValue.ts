import { isRookieContract } from '@/lib/rookieScale';

/**
 * Contract value (DESIGN-BACKLOG.md "Contract value"): what a player's
 * production costs on this league's own market, minus what he's paid.
 *
 * League-wide, once per build: rank rostered players within their position
 * by PPG; a rank's market price is the median salary of the players ranked
 * within ±3 of it (±5 when that band has fewer than 4 salaries), counting
 * only contracts that were bid on — rookie-draft deals, minimum salaries
 * and the taxi squad are scored against the market but never set it.
 * VALUE = market − salary per season; contract value sums that over the
 * years left, with the cap hit rising 10% a year.
 */

export interface ValueInput {
  id: string;
  pos: string;
  salary: number;
  years: number;
  contractStatus: string;
  taxi: boolean;
  /** Points per game played; null with no games. */
  ppg: number | null;
}

export interface ValueResult {
  /** Position rank by PPG among rostered players (1 = best); null with no games. */
  rank: number | null;
  /** Market price for that rank, whole dollars; null when no band qualifies. */
  market: number | null;
  /** Market − salary, per season. */
  value: number | null;
  /** Σ over years left of (market − salary × 1.1^k). */
  contractValue: number | null;
}

/** |VALUE| under this reads "fair" (about 1% of the $2,200 cap). */
export const FAIR_BAND = 25;

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function computeContractValues(players: ValueInput[], minSalary: number): Map<string, ValueResult> {
  return buildMarket(players, minSalary).values;
}

/**
 * The league market: every rostered player's VALUE, and `priceFor`, the
 * market price of a given PPG at a position — for a free agent, what his
 * production would cost (where he'd slot into the rostered ranking).
 */
export function buildMarket(players: ValueInput[], minSalary: number): {
  values: Map<string, ValueResult>;
  priceFor: (pos: string, ppg: number) => number | null;
} {
  const out = new Map<string, ValueResult>();
  const pricers = new Map<string, { ranked: ValueInput[]; priceAt: (rank: number) => number | null }>();
  const byPos = new Map<string, ValueInput[]>();
  for (const p of players) {
    if (!byPos.has(p.pos)) byPos.set(p.pos, []);
    byPos.get(p.pos)!.push(p);
  }

  for (const list of byPos.values()) {
    const ranked = list.filter((p) => p.ppg !== null).sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
    const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
    // Who sets the price: bid-on contracts only.
    const sample = ranked
      .map((p, i) => ({ rank: i + 1, salary: p.salary, market: !p.taxi && !isRookieContract(p.contractStatus) && p.salary > minSalary }))
      .filter((s) => s.market);
    const band = (rank: number, width: number) => sample.filter((s) => Math.abs(s.rank - rank) <= width).map((s) => s.salary);
    const priceAt = (rank: number): number | null => {
      // Nearest band at or up the rankings with enough salaries.
      for (let r = rank; r >= 1; r--) {
        const narrow = r === rank ? band(r, 3) : [];
        if (narrow.length >= 4) return median(narrow);
        const wide = band(r, 5);
        if (wide.length >= 4) return median(wide);
      }
      return null;
    };
    pricers.set(list[0].pos, { ranked, priceAt });

    for (const p of list) {
      const rank = rankOf.get(p.id) ?? null;
      const market = rank === null ? null : priceAt(rank);
      if (market === null || rank === null) {
        out.set(p.id, { rank, market: null, value: null, contractValue: null });
        continue;
      }
      const m = Math.round(market);
      let total = 0;
      for (let k = 0; k < Math.max(p.years, 1); k++) total += m - p.salary * 1.1 ** k;
      out.set(p.id, { rank, market: m, value: m - p.salary, contractValue: total });
    }
  }
  const priceFor = (pos: string, ppg: number) => {
    const m = pricers.get(pos);
    if (!m) return null;
    const rank = m.ranked.filter((p) => (p.ppg ?? 0) > ppg).length + 1;
    const price = m.priceAt(rank);
    return price === null ? null : Math.round(price);
  };
  return { values: out, priceFor };
}

/** "+$150", "−$88", or "fair" inside the band. */
export function valueLabel(v: number | null): { text: string; tone: 'rise' | 'fall' | 'fair' | 'none' } {
  if (v === null) return { text: '—', tone: 'none' };
  if (Math.abs(v) < FAIR_BAND) return { text: 'fair', tone: 'fair' };
  return { text: `${v > 0 ? '+' : '−'}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`, tone: v > 0 ? 'rise' : 'fall' };
}
