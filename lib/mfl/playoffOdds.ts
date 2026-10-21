import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet, num } from './client';
import type { League } from './league';
import { bestLineup, sumPoints } from './lineup';
import { getLeagueSchedule, getWeeklyResults } from './matchups';
import { getPlayers } from './players';
import { getRosters } from './rosters';
import { getProjections } from './scores';

/**
 * Playoff odds: play the rest of the season thousands of times and count how
 * often each team gets in, gets a bye, wins its division and wins it all.
 *
 * Each simulated week draws every team's score from a normal curve. Its centre
 * blends what the team has actually scored this season with its projected
 * best lineup for that week (Sleeper projections, so byes and injuries count);
 * the spread is how much scores have swung around team averages this season.
 * Scores, not just wins, are simulated because victory points pay the top
 * half of each week's scorers.
 *
 * The format is the league's: division winners and one wild card per
 * conference get in, the better division winner in each conference gets the
 * bye, and each conference plays down to one team before the final (MFL's
 * bracket pairs 3v6 and 4v5, the winners meeting seeds 1 and 2). Inferred from
 * the 2023–2025 brackets, which all seed this way.
 */

export interface TeamOdds {
  franchiseId: string;
  playoffs: number;
  bye: number;
  division: number;
  title: number;
  /** Average final victory points (or wins, without VP). */
  avgFinal: number;
}

export interface PlayoffOdds {
  sims: number;
  /** First and last regular-season week simulated; null once it is over. */
  weeks: [number, number] | null;
  teams: TeamOdds[];
}

const SIMS = 10000;

interface BracketGame {
  id: string;
  week: number;
  home: Slot;
  away: Slot;
}
type Slot = { seed: number } | { winnerOf: string };

interface RawBrackets {
  playoffBrackets?: { playoffBracket?: RawBracketInfo | RawBracketInfo[] };
}
interface RawBracketInfo { id?: string; name?: string; teamsInvolved?: string }
interface RawBracket {
  playoffBracket?: { playoffRound?: RawRound | RawRound[] };
}
interface RawRound { week?: string; playoffGame?: RawGame | RawGame[] }
interface RawGame { game_id?: string; home?: RawSlot; away?: RawSlot }
interface RawSlot { seed?: string; winner_of_game?: string }

/** Six teams, seeds 1 and 2 on byes — what the league has used every season. */
const DEFAULT_BRACKET: BracketGame[] = [
  { id: '1', week: 15, home: { seed: 3 }, away: { seed: 6 } },
  { id: '2', week: 15, home: { seed: 4 }, away: { seed: 5 } },
  { id: '3', week: 16, home: { seed: 1 }, away: { winnerOf: '1' } },
  { id: '4', week: 16, home: { seed: 2 }, away: { winnerOf: '2' } },
  { id: '5', week: 17, home: { winnerOf: '4' }, away: { winnerOf: '3' } },
];

/** The championship bracket from MFL; the default when it can't be read. */
async function getBracket(): Promise<{ games: BracketGame[]; teams: number }> {
  try {
    const list = await mflGet<RawBrackets>('playoffBrackets', { ttl: TTL.LEAGUE, season: SEASON });
    const brackets = asArray(list.playoffBrackets?.playoffBracket);
    // The title bracket is the biggest one (the others are consolation games).
    const main = brackets.slice().sort((a, b) => num(b.teamsInvolved) - num(a.teamsInvolved))[0];
    if (!main?.id) return { games: DEFAULT_BRACKET, teams: 6 };
    const body = await mflGet<RawBracket>('playoffBracket', {
      params: { BRACKET_ID: main.id },
      ttl: TTL.LEAGUE,
      season: SEASON,
      cacheKey: `playoffBracket:${SEASON}:${main.id}`,
    });
    const slot = (s: RawSlot | undefined): Slot | null =>
      s?.seed ? { seed: num(s.seed) } : s?.winner_of_game ? { winnerOf: s.winner_of_game } : null;
    const games: BracketGame[] = [];
    for (const r of asArray(body.playoffBracket?.playoffRound)) {
      for (const g of asArray(r.playoffGame)) {
        const home = slot(g.home);
        const away = slot(g.away);
        if (!g.game_id || !home || !away) return { games: DEFAULT_BRACKET, teams: 6 };
        games.push({ id: g.game_id, week: num(r.week), home, away });
      }
    }
    return games.length ? { games, teams: num(main.teamsInvolved, 6) } : { games: DEFAULT_BRACKET, teams: 6 };
  } catch {
    return { games: DEFAULT_BRACKET, teams: 6 };
  }
}

/** Small seeded generator, so a rebuild with nothing new gives the same odds. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return { next, normal };
}

/**
 * Each team's projected best lineup for one week, from current rosters (taxi
 * and IR players can't start). Empty when Sleeper has nothing for that week.
 */
async function projectedTotals(league: League, week: number, rosters: Awaited<ReturnType<typeof getRosters>>): Promise<Map<string, number>> {
  const players = await getPlayers();
  const ids = [...rosters.values()].flat().map((s) => s.playerId);
  const projections = await getProjections(week, ids).catch(() => new Map<string, number>());
  const out = new Map<string, number>();
  if (projections.size === 0) return out;
  for (const f of league.franchises) {
    const pool = (rosters.get(f.id) ?? [])
      .filter((s) => s.status === 'ROSTER')
      .map((s) => ({ id: s.playerId, position: players.get(s.playerId)?.position ?? '', points: projections.get(s.playerId) ?? 0 }));
    out.set(f.id, sumPoints(bestLineup(pool, league.lineup)));
  }
  return out;
}

export async function computePlayoffOdds(league: League, completed: number): Promise<PlayoffOdds | null> {
  const ids = league.franchises.map((f) => f.id);
  const n = ids.length;
  if (n < 4) return null;
  const index = new Map(ids.map((id, i) => [id, i]));
  const div = league.franchises.map((f) => f.divisionId);
  const conf = league.franchises.map((f) => f.conferenceId);
  const lastReg = league.lastRegularSeasonWeek;
  const vp = league.victoryPoints;

  const [schedule, bracket] = await Promise.all([getLeagueSchedule(), getBracket()]);

  // ── What has happened ────────────────────────────────────────────────────
  // Played scores, keyed week → team index → score.
  const played = new Map<number, Map<number, number>>();
  const lastPlayed = Math.min(completed, league.endWeek);
  for (let w = league.startWeek; w <= lastPlayed; w++) {
    const results = await getWeeklyResults(w);
    if (!results) continue;
    const scores = new Map<number, number>();
    for (const m of results) for (const side of m) {
      const i = index.get(side.franchiseId);
      if (i !== undefined) scores.set(i, side.score);
    }
    played.set(w, scores);
  }

  // Season scoring so far (regular season), for each team's average and the spread.
  const sums = new Array(n).fill(0);
  const counts = new Array(n).fill(0);
  const all: Array<[number, number]> = [];
  for (const [w, scores] of played) {
    if (w > lastReg) continue;
    for (const [i, s] of scores) { sums[i] += s; counts[i]++; all.push([i, s]); }
  }
  const avg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const leagueMean = all.length ? all.reduce((t, [, s]) => t + s, 0) / all.length : 0;
  let spread = 28;
  if (all.length > n * 2) {
    const resid = all.reduce((t, [i, s]) => t + (s - avg[i]) ** 2, 0) / Math.max(1, all.length - n);
    spread = Math.max(18, Math.sqrt(resid));
  }

  // ── Expected score for each team in each week still to play ──────────────
  const firstOpen = lastPlayed + 1;
  const lastWeek = Math.max(lastReg, ...bracket.games.map((g) => g.week));
  const rosters = firstOpen <= lastWeek ? await getRosters() : new Map();
  const mean = new Map<number, number[]>();
  for (let w = firstOpen; w <= lastWeek; w++) {
    const proj = await projectedTotals(league, w, rosters);
    const projVals = [...proj.values()].filter((v) => v > 0);
    const projMean = projVals.length ? projVals.reduce((a, b) => a + b, 0) / projVals.length : 0;
    // Projections run low or high as a whole; put them on the league's real scale.
    const scale = projMean > 0 && leagueMean > 0 ? leagueMean / projMean : 1;
    mean.set(w, ids.map((id, i) => {
      const games = counts[i];
      const p = proj.get(id);
      const projected = p && p > 0 ? p * scale : null;
      if (projected === null) return games ? (games * avg[i] + 3 * leagueMean) / (games + 3) : leagueMean || 100;
      if (!games) return projected;
      const wActual = games / (games + 6);
      return wActual * avg[i] + (1 - wActual) * projected;
    }));
  }

  // Regular-season pairings as team-index pairs.
  const pairs = new Map<number, Array<[number, number]>>();
  for (let w = league.startWeek; w <= lastReg; w++) {
    pairs.set(w, (schedule.get(w) ?? [])
      .map((p) => [index.get(p.franchiseIds[0]), index.get(p.franchiseIds[1])])
      .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined));
  }

  // ── Simulate ──────────────────────────────────────────────────────────────
  const random = rng(completed * 7919 + n);
  const tally = {
    playoffs: new Array(n).fill(0), bye: new Array(n).fill(0),
    division: new Array(n).fill(0), title: new Array(n).fill(0), final: new Array(n).fill(0),
  };

  const wins = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  const ties = new Array(n).fill(0);
  const pf = new Array(n).fill(0);
  const vps = new Array(n).fill(0);
  const divWL = Array.from({ length: n }, () => [0, 0]);
  const confWL = Array.from({ length: n }, () => [0, 0]);
  const h2h = Array.from({ length: n }, () => new Array(n).fill(0));
  const weekScore = new Array(n).fill(0);

  const scoreFor = (w: number, i: number) => {
    const actual = played.get(w)?.get(i);
    if (actual !== undefined) return actual;
    const m = mean.get(w)?.[i] ?? (leagueMean || 100);
    return Math.max(0, m + spread * random.normal());
  };

  const pct = (wl: number[]) => (wl[0] + wl[1] ? wl[0] / (wl[0] + wl[1]) : 0);
  const better = (a: number, b: number) => {
    if (vp && vps[a] !== vps[b]) return vps[b] - vps[a];
    const ga = wins[a] + losses[a] + ties[a];
    const gb = wins[b] + losses[b] + ties[b];
    const pa = ga ? (wins[a] + ties[a] / 2) / ga : 0;
    const pb = gb ? (wins[b] + ties[b] / 2) / gb : 0;
    if (!vp && pa !== pb) return pb - pa;
    if (h2h[a][b] !== h2h[b][a]) return h2h[b][a] - h2h[a][b];
    if (div[a] === div[b] && pct(divWL[a]) !== pct(divWL[b])) return pct(divWL[b]) - pct(divWL[a]);
    if (pct(confWL[a]) !== pct(confWL[b])) return pct(confWL[b]) - pct(confWL[a]);
    if (vp && pa !== pb) return pb - pa;
    return pf[b] - pf[a];
  };

  const conferences = [...new Set(conf)];
  const divisions = [...new Set(div)];
  const confFormat = bracket.teams === 6 && conferences.length === 2
    && conferences.every((c) => divisions.filter((d) => conf[div.indexOf(d)] === c).length === 2);

  // Seeds that play in the opening round; the rest have a bye.
  bracket.games.sort((a, b) => a.week - b.week || Number(a.id) - Number(b.id));
  const opening = bracket.games[0]?.week;
  const openingSeeds = new Set(bracket.games.filter((g) => g.week === opening)
    .flatMap((g) => [g.home, g.away]).flatMap((x) => ('seed' in x ? [x.seed] : [])));

  for (let s = 0; s < SIMS; s++) {
    wins.fill(0); losses.fill(0); ties.fill(0); pf.fill(0); vps.fill(0);
    for (let i = 0; i < n; i++) { divWL[i][0] = divWL[i][1] = 0; confWL[i][0] = confWL[i][1] = 0; h2h[i].fill(0); }

    for (let w = league.startWeek; w <= lastReg; w++) {
      const games = pairs.get(w) ?? [];
      if (!games.length) continue;
      for (let i = 0; i < n; i++) weekScore[i] = -1;
      for (const [a, b] of games) {
        const sa = scoreFor(w, a);
        const sb = scoreFor(w, b);
        weekScore[a] = sa; weekScore[b] = sb;
        pf[a] += sa; pf[b] += sb;
        const r = sa > sb ? 1 : sa < sb ? -1 : 0;
        if (r === 0) { ties[a]++; ties[b]++; } else {
          const [win, lose] = r > 0 ? [a, b] : [b, a];
          wins[win]++; losses[lose]++; h2h[win][lose]++;
          if (div[a] === div[b]) { divWL[win][0]++; divWL[lose][1]++; }
          if (conf[a] === conf[b]) { confWL[win][0]++; confWL[lose][1]++; }
        }
        if (vp && w >= vp.startWeek && w <= vp.endWeek) {
          vps[a] += r > 0 ? vp.win : r < 0 ? vp.loss : vp.tie;
          vps[b] += r < 0 ? vp.win : r > 0 ? vp.loss : vp.tie;
        }
      }
      if (vp && vp.buckets.length && w >= vp.startWeek && w <= vp.endWeek) {
        const ranked = ids.map((_, i) => i).filter((i) => weekScore[i] >= 0).sort((x, y) => weekScore[y] - weekScore[x]);
        const size = ranked.length / vp.buckets.length;
        ranked.forEach((i, k) => { vps[i] += vp.buckets[Math.min(vp.buckets.length - 1, Math.floor(k / size))] ?? 0; });
      }
    }

    // ── Seeding ──
    const order = ids.map((_, i) => i).sort(better);
    const divWinner = new Map<string, number>();
    for (const i of order) if (!divWinner.has(div[i])) divWinner.set(div[i], i);
    for (const i of divWinner.values()) tally.division[i]++;
    for (let i = 0; i < n; i++) tally.final[i] += vp ? vps[i] : wins[i];

    let seeds: number[];
    if (confFormat) {
      const sides = conferences.map((c) => {
        const winners = [...divWinner.values()].filter((i) => conf[i] === c).sort(better);
        const wc = order.find((i) => conf[i] === c && !winners.includes(i))!;
        return { top: winners[0], other: winners[1], wc };
      }).sort((x, y) => better(x.top, y.top));
      // Seed 1's conference fills 3 and 6; the other conference 2, 4 and 5.
      seeds = [sides[0].top, sides[1].top, sides[0].other, sides[1].other, sides[1].wc, sides[0].wc];
    } else {
      const winners = [...divWinner.values()].sort(better);
      seeds = [...winners, ...order.filter((i) => !winners.includes(i))].slice(0, bracket.teams);
    }
    seeds.forEach((i, k) => {
      tally.playoffs[i]++;
      if (!openingSeeds.has(k + 1)) tally.bye[i]++;
    });

    // ── Bracket ──
    const winnerOf = new Map<string, number>();
    const who = (slot: Slot) => ('seed' in slot ? seeds[slot.seed - 1] : winnerOf.get(slot.winnerOf));
    let champ: number | undefined;
    for (const g of bracket.games) {
      const h = who(g.home);
      const a = who(g.away);
      if (h === undefined || a === undefined) continue;
      const sh = scoreFor(g.week, h);
      const sa = scoreFor(g.week, a);
      // MFL breaks a playoff tie for the higher seed (the home side).
      champ = sa > sh ? a : h;
      winnerOf.set(g.id, champ);
    }
    if (champ !== undefined) tally.title[champ]++;
  }

  return {
    sims: SIMS,
    weeks: firstOpen <= lastReg ? [firstOpen, lastReg] : null,
    teams: ids.map((id, i) => ({
      franchiseId: id,
      playoffs: tally.playoffs[i] / SIMS,
      bye: tally.bye[i] / SIMS,
      division: tally.division[i] / SIMS,
      title: tally.title[i] / SIMS,
      avgFinal: tally.final[i] / SIMS,
    })),
  };
}
