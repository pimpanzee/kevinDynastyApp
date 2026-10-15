import { FRANCHISE_ID } from '@/lib/config';
import { resolveNow } from '@/lib/mfl/clock';
import { getLeague } from '@/lib/mfl/league';
import { getWeeklyResults } from '@/lib/mfl/matchups';
import { getNflSchedule, lastCompletedWeek } from '@/lib/mfl/schedule';
import type { RatingsView } from '@/lib/types';

/**
 * League › Ratings, this season only (DESIGN-BACKLOG.md "Ratings"):
 *
 * - PWR (0–100, 50 = average): z-score of each input across the league,
 *   weighted all-play win % 40% · last-3-weeks scoring 25% · PF 20% ·
 *   lineup efficiency (PF ÷ potential points) 15%; 50 + 15 × weighted z.
 * - ELO: everyone starts at 1500; the winner takes K × (1 − expected) from
 *   the loser, K = 32 scaled by margin (ln(|margin| + 1) / 2, kept to 0.5–1.5).
 * - ALL-PLAY: the record from playing every other team every week.
 * - LUCK: actual wins − all-play expected wins.
 */

interface Tally { pf: number; pp: number; wins: number; games: number; apW: number; apL: number; apT: number; elo: number; scores: number[] }

const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
};

async function tallyThrough(week: number, ids: string[], startWeek: number) {
  const t = new Map<string, Tally>(ids.map((id) => [id, { pf: 0, pp: 0, wins: 0, games: 0, apW: 0, apL: 0, apT: 0, elo: 1500, scores: [] }]));
  for (let w = startWeek; w <= week; w++) {
    const results = await getWeeklyResults(w);
    if (!results) continue;
    const sides = results.flat();
    for (const s of sides) {
      const x = t.get(s.franchiseId);
      if (!x) continue;
      x.pf += s.score;
      x.pp += s.optPts;
      x.scores.push(s.score);
      for (const o of sides) {
        if (o === s) continue;
        if (s.score > o.score) x.apW++;
        else if (s.score < o.score) x.apL++;
        else x.apT++;
      }
    }
    for (const m of results) {
      if (m.length !== 2) continue;
      const [a, b] = m;
      const ta = t.get(a.franchiseId), tb = t.get(b.franchiseId);
      if (!ta || !tb) continue;
      ta.games++; tb.games++;
      if (a.score > b.score) ta.wins++;
      else if (b.score > a.score) tb.wins++;
      else { ta.wins += 0.5; tb.wins += 0.5; }
      const expected = 1 / (1 + 10 ** ((tb.elo - ta.elo) / 400));
      const result = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5;
      const k = 32 * Math.min(1.5, Math.max(0.5, Math.log(Math.abs(a.score - b.score) + 1) / 2));
      const delta = k * (result - expected);
      ta.elo += delta;
      tb.elo -= delta;
    }
  }
  return t;
}

function powerRanks(t: Map<string, Tally>) {
  const ids = [...t.keys()];
  const inputs = ids.map((id) => {
    const x = t.get(id)!;
    const ap = x.apW + x.apL + x.apT;
    return {
      id,
      allPlay: ap ? (x.apW + x.apT / 2) / ap : 0,
      last3: mean(x.scores.slice(-3)),
      pf: x.pf,
      eff: x.pp ? x.pf / x.pp : 0,
    };
  });
  const z = (k: 'allPlay' | 'last3' | 'pf' | 'eff') => {
    const xs = inputs.map((i) => i[k]);
    const m = mean(xs), s = sd(xs);
    return (v: number) => (v - m) / s;
  };
  const [zA, zL, zP, zE] = [z('allPlay'), z('last3'), z('pf'), z('eff')];
  const pwr = new Map(inputs.map((i) => {
    const w = 0.4 * zA(i.allPlay) + 0.25 * zL(i.last3) + 0.2 * zP(i.pf) + 0.15 * zE(i.eff);
    return [i.id, Math.max(0, Math.min(100, Math.round(50 + 15 * w)))];
  }));
  // Rank by the unrounded blend's order: PWR, then PF.
  const order = ids.slice().sort((a, b) => pwr.get(b)! - pwr.get(a)! || t.get(b)!.pf - t.get(a)!.pf);
  return { pwr, rank: new Map(order.map((id, i) => [id, i + 1])) };
}

export async function getRatingsView(): Promise<RatingsView> {
  const now = resolveNow().getTime();
  const [league, nfl] = await Promise.all([getLeague(), getNflSchedule()]);
  const done = Math.min(lastCompletedWeek(nfl, now), league.lastRegularSeasonWeek);
  const ids = league.franchises.map((f) => f.id);
  const t = await tallyThrough(done, ids, league.startWeek);
  const { pwr, rank } = powerRanks(t);
  const prev = done > league.startWeek ? powerRanks(await tallyThrough(done - 1, ids, league.startWeek)).rank : null;

  const rows = ids.map((id) => {
    const x = t.get(id)!;
    const f = league.franchises.find((y) => y.id === id)!;
    const ap = x.apW + x.apL + x.apT;
    const apPct = ap ? (x.apW + x.apT / 2) / ap : 0;
    return {
      franchiseId: id, name: f.name, icon: f.icon ?? null,
      rank: rank.get(id)!, move: prev ? prev.get(id)! - rank.get(id)! : 0,
      pwr: pwr.get(id)!, elo: Math.round(x.elo),
      allPlay: `${x.apW}-${x.apL}${x.apT ? `-${x.apT}` : ''}`,
      luck: Math.round((x.wins - apPct * x.games) * 10) / 10,
    };
  }).sort((a, b) => a.rank - b.rank);

  return { week: done, rows, myFranchiseId: FRANCHISE_ID };
}
