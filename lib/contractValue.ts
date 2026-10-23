import { ppgPath } from '@/lib/aging';
import { deadCap } from '@/lib/cap';
import type { ContractKind } from '@/lib/contractKinds';
import { isRookieContract } from '@/lib/rookieScale';

/**
 * Contract value (DESIGN-BACKLOG.md "Contract value"): what a player's
 * production costs on this league's own market, minus what he's paid.
 *
 * League-wide, once per build:
 * 1. PPG is blended with projections (lib/ppgEstimate.ts).
 * 2. Replacement level: fill every team's starting lineup (minimums, then
 *    flex and superflex spots) with the best players league-wide; the
 *    replacement PPG at a position is the average of the next 3 players
 *    there. PAR = PPG − replacement PPG (points above replacement a game).
 * 3. Price curve per position, read off the contracts that were bid on
 *    (not rookie deals, minimums or taxi): the k-th most PAR is worth the
 *    k-th biggest salary, interpolated between (fitCurve). A position with
 *    under 8 such contracts uses all positions together. PAR ≤ 0 is worth
 *    the minimum.
 * 4. Bench value: a player below starter level still beats what's on
 *    waivers. Waiver level = the average of the best 3 healthy free agents
 *    at the position (blended PPG, 2+ games, not IR / out / doubtful).
 *    Points above it are worth BENCH_STARTS fill-in starts a season at the
 *    position's own price per point. Market = the higher of the two prices.
 * VALUE = market − salary per season. Contract value is what keeping him is
 * worth: Σ over years left of (market_k − salary × 1.1^k), each later year
 * discounted DISCOUNT a year (injury, turnover, uncertainty). market_k
 * prices the PPG he's expected to score that year by his position's aging
 * curve (lib/aging.ts). Rookie deals add their team options (see below);
 * a waiver pickup's deal is one year, never extended. Only auction deals
 * (at their winning bid, before raises) and ones we can't place set the
 * price curve (lib/contractKinds.ts). It's set
 * against cutting him, to flag when that would save money:
 *  - cut: the dead cap (lib/cap.ts), half this season and half next for a
 *    multi-year deal cut in season, plus the production lost for the rest
 *    of this season: until the May auction, only a waiver-level player
 *    (worth the minimum) can replace him.
 */

export interface ValueInput {
  id: string;
  pos: string;
  salary: number;
  years: number;
  contractStatus: string;
  taxi: boolean;
  /** Blended points per game; null with no games. */
  ppg: number | null;
  /** On IR, out or doubtful: his PPG may not show what he is. */
  hurt?: boolean;
  /** Age in years today; none → no aging. */
  age?: number;
  /** Where the contract came from (lib/contractKinds.ts); none → read from contractStatus. */
  kind?: ContractKind;
  /** Auction deals: the winning bid, the base value before raises. */
  bid?: number;
  /** Rookie deals: the year he was drafted, for which team option applies. */
  draftYear?: number;
}

export interface ValueResult {
  /** Position rank by PPG among rostered players (1 = best); null with no games. */
  rank: number | null;
  /** Market price for his production, whole dollars; null with no games. */
  market: number | null;
  /** Market − salary, per season. */
  value: number | null;
  /** Keeping him: Σ over years left of (market_k − salary × 1.1^k) / 1.2^k, market_k aged. */
  contractValue: number | null;
  /**
   * What cutting him would save over keeping him, when that's more than the
   * fair band; otherwise null. Never for rookie deals (their value is growth
   * this model can't see yet) or hurt players (their PPG may not show what
   * they are).
   */
  cutSaves: number | null;
}

/** The starting lineup: total starters and each position's min–max. */
export interface LineupRules {
  max: number;
  positions: Record<string, { min: number; max: number }>;
}

/** |VALUE| under this reads "fair" (about 1% of the $2,200 cap). */
export const FAIR_BAND = 25;
/** Each later contract year counts this much less (20% a year). */
export const DISCOUNT = 0.2;
/** Fill-in starts a bench player makes in a season (byes, injuries). */
const BENCH_STARTS = 4;
/** Fantasy weeks in a season (14 regular + 3 playoff). */
const SEASON_GAMES = 17;
/** Free agents averaged for waiver level. */
const WAIVER_DEPTH = 3;
/** Bid-on contracts a position needs for its own price curve. */
const MIN_POS_CONTRACTS = 8;
/** Players averaged past the last starter for replacement level. */
const REPLACEMENT_DEPTH = 3;

/**
 * Starters each position supplies league-wide: every team's minimums from the
 * best players, then the open spots (flex, superflex) from the best left,
 * within each position's max.
 */
export function startersByPos(pool: Array<{ pos: string; ppg: number }>, lineup: LineupRules, teams: number): Map<string, number> {
  const byPos = new Map<string, number[]>();
  for (const p of pool) {
    if (!lineup.positions[p.pos]) continue;
    if (!byPos.has(p.pos)) byPos.set(p.pos, []);
    byPos.get(p.pos)!.push(p.ppg);
  }
  for (const list of byPos.values()) list.sort((a, b) => b - a);
  const used = new Map<string, number>();
  let filled = 0;
  for (const [pos, lim] of Object.entries(lineup.positions)) {
    const n = Math.min(lim.min * teams, byPos.get(pos)?.length ?? 0);
    used.set(pos, n);
    filled += n;
  }
  const open = Math.max(0, lineup.max * teams - filled);
  for (let i = 0; i < open; i++) {
    let best: string | null = null;
    let bestPpg = -Infinity;
    for (const [pos, lim] of Object.entries(lineup.positions)) {
      const n = used.get(pos) ?? 0;
      const next = byPos.get(pos)?.[n];
      if (next === undefined || n >= lim.max * teams) continue;
      if (next > bestPpg) { bestPpg = next; best = pos; }
    }
    if (!best) break;
    used.set(best, (used.get(best) ?? 0) + 1);
  }
  return used;
}

/** Replacement PPG by position: the average of the next few past the last starter. */
export function replacementLevels(pool: Array<{ pos: string; ppg: number }>, lineup: LineupRules, teams: number): Map<string, number> {
  const starters = startersByPos(pool, lineup, teams);
  const out = new Map<string, number>();
  for (const [pos, n] of starters) {
    const list = pool.filter((p) => p.pos === pos).map((p) => p.ppg).sort((a, b) => b - a);
    const next = list.slice(n, n + REPLACEMENT_DEPTH);
    out.set(pos, next.length ? next.reduce((a, b) => a + b, 0) / next.length : (list[list.length - 1] ?? 0));
  }
  return out;
}

export interface PriceCurve {
  /** Price points, best first: PAR a game and the salary it commands. Ends at (0, minimum). */
  par: number[];
  salary: number[];
  /** Contracts the curve was built on. */
  n: number;
}

/**
 * The league's price for production, read off its own auctions: line up the
 * bid-on contracts from most to least points above replacement, and the
 * salaries from highest to lowest; the k-th best production is worth the
 * k-th biggest salary (in a working auction the best player draws the top
 * bid). Busts drop to the bottom of the production order, so their money
 * prices the players who did produce. Monotone by construction and bounded
 * by salaries owners really paid.
 */
export function fitCurve(points: Array<{ pos: string; par: number; salary: number }>, minSalary: number): PriceCurve | null {
  const pts = points.filter((p) => p.salary > minSalary);
  if (pts.length < 8) return null;
  const pars = pts.map((p) => p.par).filter((x) => x > 0).sort((x, y) => y - x);
  if (!pars.length) return null;
  const salaries = pts.map((p) => p.salary).sort((x, y) => y - x).slice(0, pars.length);
  return { par: [...pars, 0], salary: [...salaries, minSalary], n: pts.length };
}

export function priceOf(curve: PriceCurve, par: number, minSalary: number): number {
  if (par <= 0) return minSalary;
  const { par: xs, salary: ys } = curve;
  if (par >= xs[0]) return ys[0];
  // xs falls from xs[0] to 0: find the pair around par and interpolate.
  let i = 1;
  while (i < xs.length - 1 && xs[i] > par) i++;
  const [x0, x1, y0, y1] = [xs[i - 1], xs[i], ys[i - 1], ys[i]];
  return x0 === x1 ? (y0 + y1) / 2 : y1 + ((par - x1) / (x0 - x1)) * (y0 - y1);
}

/** Dollars a season per point a game above replacement, read off the curve. */
export function ratePerPar(curve: PriceCurve, minSalary: number): number {
  let dollars = 0;
  let par = 0;
  for (let i = 0; i < curve.par.length - 1; i++) { dollars += curve.salary[i] - minSalary; par += curve.par[i]; }
  return par > 0 ? dollars / par : 0;
}

/** Keeping him, and what cutting him would save over that (see the header). */
export function contractTotal(markets: number[], salary: number, lostIfCut: number): { keep: number; cutSaves: number } {
  const n = Math.max(markets.length, 1);
  let keep = 0;
  for (let k = 0; k < n; k++) keep += (markets[k] - salary * 1.1 ** k) / (1 + DISCOUNT) ** k;
  const dead = deadCap(salary, n);
  const cut = (n > 1 ? -(dead / 2 + dead / 2 / (1 + DISCOUNT)) : -dead) - lostIfCut;
  return { keep, cutSaves: cut - keep };
}

/**
 * The league market: every rostered player's VALUE, and `priceFor`, the
 * market price of a given PPG at a position (a free agent's bidding guide).
 * `pool` is every player with games this season, rostered or not, for
 * replacement level; `waivers` the free agents among them with 2+ games.
 */
export function buildMarket(
  players: ValueInput[],
  pool: Array<{ pos: string; ppg: number }>,
  waivers: Array<{ pos: string; ppg: number }>,
  lineup: LineupRules,
  teams: number,
  minSalary: number,
  /** Share of this season's fantasy weeks still to play (1 before week 1). */
  seasonLeft: number,
): {
  values: Map<string, ValueResult>;
  priceFor: (pos: string, ppg: number) => number | null;
  replacement: Map<string, number>;
  waiver: Map<string, number>;
  curves: Map<string, PriceCurve | null>;
} {
  const replacement = replacementLevels(pool, lineup, teams);
  const parOf = (pos: string, ppg: number) => ppg - (replacement.get(pos) ?? ppg);
  // Who sets the price: bid-on contracts only. Each position reads its own
  // auctions (the league pays QBs far more per point than TEs); a position
  // with too few falls back to all positions together.
  const bids = players
    .filter((p) => p.ppg !== null && !p.taxi && setsPrice(p) && p.salary > minSalary)
    // An auction deal's price is its winning bid: today's salary carries
    // years of 10% raises a new contract wouldn't.
    .map((p) => ({ pos: p.pos, par: parOf(p.pos, p.ppg!), salary: p.bid ?? p.salary }));
  const pooled = fitCurve(bids, minSalary);
  const curves = new Map<string, PriceCurve | null>();
  for (const pos of replacement.keys()) {
    const mine = bids.filter((b) => b.pos === pos);
    curves.set(pos, (mine.length >= MIN_POS_CONTRACTS ? fitCurve(mine, minSalary) : null) ?? pooled);
  }

  // Waiver level: the best few free agents really on the wire.
  const waiver = new Map<string, number>();
  for (const [pos, repl] of replacement) {
    const top = waivers.filter((w) => w.pos === pos).map((w) => w.ppg).sort((a, b) => b - a).slice(0, WAIVER_DEPTH);
    waiver.set(pos, Math.min(repl, top.length ? top.reduce((a, b) => a + b, 0) / top.length : repl));
  }
  const marketFor = (pos: string, ppg: number): number | null => {
    const curve = curves.get(pos) ?? pooled;
    if (!curve) return null;
    const starter = priceOf(curve, parOf(pos, ppg), minSalary);
    const aboveWaiver = Math.max(0, ppg - (waiver.get(pos) ?? ppg));
    const bench = minSalary + aboveWaiver * (BENCH_STARTS / SEASON_GAMES) * ratePerPar(curve, minSalary);
    return Math.max(starter, bench);
  };

  // 2024+ first-rounders' 5th-year option costs the average of the top 10
  // salaries at the position.
  const topTen = new Map<string, number>();
  for (const pos of replacement.keys()) {
    const sal = players.filter((p) => p.pos === pos).map((p) => p.salary).sort((a, b) => b - a).slice(0, 10);
    if (sal.length) topTen.set(pos, sal.reduce((a, b) => a + b, 0) / sal.length);
  }

  const out = new Map<string, ValueResult>();
  const byPos = new Map<string, ValueInput[]>();
  for (const p of players) {
    if (!byPos.has(p.pos)) byPos.set(p.pos, []);
    byPos.get(p.pos)!.push(p);
  }
  for (const list of byPos.values()) {
    const ranked = list.filter((p) => p.ppg !== null).sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
    const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
    for (const p of list) {
      const rank = rankOf.get(p.id) ?? null;
      const price = p.ppg === null ? null : marketFor(p.pos, p.ppg);
      if (price === null) {
        out.set(p.id, { rank, market: null, value: null, contractValue: null, cutSaves: null });
        continue;
      }
      const m = Math.round(price);
      // Cut mid-season, the only stand-in is a waiver-level player (worth the
      // minimum) until the May auction can buy his production back.
      const kind = kindOf(p);
      // A waiver pickup's deal is one year and can never be extended.
      const years = kind === 'waiver' ? 1 : Math.max(p.years, 1);
      // Team options after the deal (league rules, Article 4.2.2), each taken
      // only when he's worth more than it costs:
      // - 2024+ draftees in the first half of a 2+2 deal ("R.0"): the +2
      //   years at the usual 10% raises;
      // - first-rounders: a 5th year at the position's top-10 average salary
      //   (2024+ draftees) or a 4th year at +10% (2022–23 draftees).
      const options: number[][] = [];
      if (kind === 'rookie') {
        const late = (p.draftYear ?? 0) >= 2024;
        const firstHalf = /^\d\.0$/.test(p.contractStatus.trim());
        if (late && firstHalf) options.push([years, years + 1].map((k) => p.salary * 1.1 ** k));
        const after = years + options.flat().length;
        if (roundOf(p.contractStatus) === 1) {
          const price = late ? topTen.get(p.pos) : p.salary * 1.1 ** after;
          if (price !== undefined) options.push([price]);
        }
      }
      // Later years price the PPG his aging curve expects then.
      const markets = ppgPath(p.pos, p.ppg!, p.age, years + options.flat().length)
        .map((ppg, k) => (k === 0 ? m : Math.round(marketFor(p.pos, ppg) ?? m)));
      const { keep: kept, cutSaves } = contractTotal(markets.slice(0, years), p.salary, Math.max(0, m - minSalary) * seasonLeft);
      let keep = kept;
      let k = years;
      for (const prices of options) {
        let block = 0;
        for (const price of prices) { block += (markets[k] - price) / (1 + DISCOUNT) ** k; k++; }
        keep += Math.max(0, block);
      }
      const flag = cutSaves >= FAIR_BAND && !p.hurt && kind !== 'rookie';
      out.set(p.id, { rank, market: m, value: m - p.salary, contractValue: keep, cutSaves: flag ? cutSaves : null });
    }
  }
  const priceFor = (pos: string, ppg: number) => {
    const price = replacement.has(pos) ? marketFor(pos, ppg) : null;
    return price === null ? null : Math.round(price);
  };
  return { values: out, priceFor, replacement, waiver, curves };
}

function kindOf(p: ValueInput): ContractKind {
  return p.kind ?? (isRookieContract(p.contractStatus) ? 'rookie' : 'other');
}

/** Only contracts someone bid on at auction (or that we can't place) set the price; rookie deals and 1-year waiver pickups don't. */
function setsPrice(p: ValueInput): boolean {
  const kind = kindOf(p);
  return kind === 'auction' || kind === 'other';
}

function roundOf(contractStatus: string): number | null {
  const m = contractStatus.trim().match(/^(\d)\.\d$|^Rd(\d)$/i);
  return m ? Number(m[1] ?? m[2]) : null;
}

/** "+$150", "−$88", or "fair" inside the band. */
export function valueLabel(v: number | null): { text: string; tone: 'rise' | 'fall' | 'fair' | 'none' } {
  if (v === null) return { text: '—', tone: 'none' };
  if (Math.abs(v) < FAIR_BAND) return { text: 'fair', tone: 'fair' };
  return { text: `${v > 0 ? '+' : '−'}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`, tone: v > 0 ? 'rise' : 'fall' };
}
