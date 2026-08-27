import { rnd } from './derive';

/**
 * Boxscore mock data, ported from "Matchup Detail.dc.html".
 *
 * Known mock limitation: this data only exists for Week 11. Drilling into a
 * Week 9/10/12 matchup re-renders these same players under that week's phase.
 * Real MFL `weeklyResults` / `liveScoring` data removes this.
 */

/** [name, teamAndOpponent, statusLine, livePts, projPts, inPlayFlag] */
export type PlayerTuple = [string, string, string, string, string, number];

/** Each starter row pairs a slot label with the home and away player. */
export const STARTERS: Array<[string, PlayerTuple, PlayerTuple]> = [
  ['QB', ['J. Daniels', 'WSH @NYG', 'FINAL · 281yd 2TD 41ru', '24.6', '21.4', 0],
         ['J. Love', 'GB @MIN', 'FINAL · 244yd 2TD 1INT', '19.8', '20.2', 0]],
  ['RB', ['B. Robinson', 'ATL vs TB', 'Q3 8:22 · 74yd TD 3rec', '18.2', '15.9', 1],
         ['S. Barkley', 'PHI vs DAL', 'Q4 11:03 · 118yd TD', '22.4', '18.7', 1]],
  ['RB', ['J. Gibbs', 'DET @CHI', '4:25 ET · yet to play', '0.0', '16.4', 0],
         ['K. Walker', 'SEA @LAR', 'FINAL · 52yd 4rec', '7.7', '13.1', 0]],
  ['WR', ['P. Nacua', 'LAR vs SEA', 'FINAL · 6rec 71yd', '12.1', '14.8', 0],
         ['J. Jefferson', 'MIN vs GB', 'FINAL · 7rec 102yd', '15.2', '17.9', 0]],
  ['WR', ['M. Nabers', 'NYG vs WSH', 'FINAL · 5rec 44yd', '9.4', '13.2', 0],
         ['G. Wilson', 'NYJ @BUF', '4:25 ET · yet to play', '0.0', '12.4', 0]],
  ['TE', ['T. McBride', 'ARI @SF', 'Q2 2:40 · 4rec 35yd', '6.5', '11.1', 1],
         ['B. Bowers', 'LV @DEN', '4:25 ET · yet to play', '0.0', '12.8', 0]],
  ['FLX', ['D. London', 'ATL vs TB', 'Q3 8:22 · 5rec 63yd', '11.3', '12.0', 1],
          ['R. Odunze', 'CHI vs DET', '4:25 ET · yet to play', '0.0', '10.1', 0]],
  ['K', ['C. Boswell', 'PIT @CLE', 'FINAL · 2/2 FG', '8.0', '8.4', 0],
        ['J. Tucker', 'BAL vs CIN', 'FINAL · 3/3 FG 2XP', '11.0', '8.2', 0]],
  ['DEF', ['Broncos D/ST', 'DEN vs LV', '4:25 ET · yet to play', '0.0', '8.6', 0],
          ['Eagles D/ST', 'PHI vs DAL', 'Q4 · 2 SK 1 INT', '12.0', '9.0', 1]],
];

/** Final-phase overrides, keyed by player name: [statLine, points]. */
export const FINALS: Record<string, [string, string]> = {
  'B. Robinson': ['FINAL · 96yd 2TD 4rec', '21.4'],
  'S. Barkley': ['FINAL · 152yd 2TD', '26.8'],
  'J. Gibbs': ['FINAL · 71yd TD 2rec', '14.2'],
  'G. Wilson': ['FINAL · 6rec 66yd', '9.6'],
  'T. McBride': ['FINAL · 6rec 52yd', '9.2'],
  'B. Bowers': ['FINAL · 8rec 81yd TD', '15.1'],
  'D. London': ['FINAL · 7rec 86yd', '14.6'],
  'R. Odunze': ['FINAL · 3rec 33yd', '6.3'],
  'Broncos D/ST': ['FINAL · 3 SK 1 FR', '11.0'],
  'Eagles D/ST': ['FINAL · 3 SK 1 INT 1 TD', '14.0'],
};

/** [name, pos, teamAndOpponent, proj, liveLine, livePts, finalLine, finalPts] */
export type BenchTuple = [string, string, string, string, string, string, string, string];

export const BENCH: Array<[BenchTuple, BenchTuple]> = [
  [['T. Hill', 'WR', 'MIA vs NE', '13.6', 'Q2 5:10 · 3rec 41yd', '5.4', 'FINAL · 6rec 88yd', '14.8'],
   ['C. Kirk', 'WR', 'JAX vs TEN', '9.8', 'FINAL · 4rec 52yd', '7.2', 'FINAL · 4rec 52yd', '7.2']],
  [['Z. Charbonnet', 'RB', 'SEA @LAR', '8.1', 'FINAL · 44yd 1rec', '6.4', 'FINAL · 44yd 1rec', '6.4'],
   ['T. Spears', 'RB', 'TEN @JAX', '10.4', 'FINAL · 61yd TD', '12.1', 'FINAL · 61yd TD', '12.1']],
  [['D. Schultz', 'TE', 'HOU vs IND', '7.2', '4:25 ET · yet to play', '0.0', 'FINAL · 5rec 47yd', '9.7'],
   ['H. Henry', 'TE', 'NE @MIA', '6.9', 'Q2 5:10 · 2rec 18yd', '2.8', 'FINAL · 4rec 39yd', '5.9']],
  [['J. Fields', 'QB', 'NYJ @BUF', '17.4', '4:25 ET · yet to play', '0.0', 'FINAL · 208yd TD 58ru', '18.6'],
   ['B. Nix', 'QB', 'DEN vs LV', '16.2', '4:25 ET · yet to play', '0.0', 'FINAL · 244yd 3TD', '24.1']],
];

/* ── Generated sides for the six "around the league" matchups ─────────────
   The design only authored a boxscore for the user's own game. Every other
   matchup's rows are generated from these pools, seeded so they are stable
   across renders.                                                           */

const POOL: Record<string, string[]> = {
  QB: ['J. Herbert', 'B. Purdy', 'K. Murray', 'T. Lawrence', 'G. Smith', 'B. Young', 'C. Stroud', 'D. Maye'],
  RB: ['D. Achane', 'R. Stevenson', 'T. Etienne', 'Z. Charbonnet', 'B. Irving', 'T. Pollard', 'J. Mixon', 'C. Brooks', 'T. Spears', 'J. Warren', 'T. Bigsby', 'B. Corum'],
  WR: ['T. Higgins', 'M. Pittman', 'J. Waddle', 'Z. Flowers', 'C. Sutton', 'C. Ridley', 'J. Meyers', 'R. Doubs', 'T. McLaurin', 'M. Evans', 'K. Shakir', 'T. Dell', 'R. Rice', 'C. Olave', 'A. Cooper', 'J. Palmer', 'D. Moore', 'K. Pickens'],
  TE: ['C. Kmet', 'D. Njoku', 'H. Fant', 'J. Reed', 'C. Loveland', 'I. Likely', 'D. Schultz'],
  K: ['H. Butker', 'J. Myers', 'Y. Koo', 'C. Santos', 'E. McPherson', 'J. Elliott', 'B. Aubrey'],
  DEF: ['Texans D/ST', 'Steelers D/ST', 'Jets D/ST', 'Vikings D/ST', 'Bears D/ST', 'Chiefs D/ST', 'Packers D/ST'],
};

const TMS = ['KC', 'BUF', 'SF', 'DAL', 'MIA', 'NYJ', 'CIN', 'BAL', 'HOU', 'DET', 'GB', 'TB', 'LAC', 'ARI'];
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLX', 'K', 'DEF'];
const BSLOTS = ['WR', 'RB', 'TE', 'QB'];

export interface GenPlayer {
  name: string;
  team: string;
  slot: string;
  proj: number;
  fin: number;
  live: number;
  state: 'pending' | 'mid' | 'done';
}

function pickName(slot: string, r: number, used: Record<string, number>): string {
  const key = slot === 'FLX' ? (r > 0.5 ? 'WR' : 'RB') : slot;
  const list = POOL[key];
  const i = Math.floor(r * list.length);
  for (let k = 0; k < list.length; k++) {
    const n = list[(i + k) % list.length];
    if (!used[n]) {
      used[n] = 1;
      return n;
    }
  }
  return list[i];
}

/**
 * Build one side of a generated boxscore and scale its columns so the
 * per-player numbers add up to the matchup's headline totals.
 */
export function genSide(
  seed: number,
  ytp: number,
  tProj: string | number,
  tLive: string | number,
  tFinal: string | number,
  count: number,
  used: Record<string, number>,
  allDone: boolean,
): GenPlayer[] {
  const n = count || 9;
  const P: GenPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const r1 = rnd(seed + i * 7.3);
    const r2 = rnd(seed + i * 3.1 + 11);
    const r3 = rnd(seed + i * 5.7 + 23);
    const slot = n === 4 ? BSLOTS[i % 4] : SLOTS[i % 9];
    const proj = 5.5 + r1 * 15;
    const fin = Math.max(0.4, proj * (0.4 + r2 * 1.3));
    const done = allDone || i < n - ytp;
    const mid = done && !allDone && r3 > 0.62;
    P.push({
      name: pickName(slot, r2, used),
      team: TMS[Math.floor(r3 * 14)],
      slot,
      proj,
      fin,
      live: !done ? 0 : mid ? fin * (0.35 + r1 * 0.4) : fin,
      state: !done ? 'pending' : mid ? 'mid' : 'done',
    });
  }
  const scale = (key: 'proj' | 'fin' | 'live', target: string | number) => {
    const raw = P.reduce((t, p) => t + p[key], 0);
    if (!raw || !target) {
      P.forEach((p) => { p[key] = Number(p[key].toFixed(1)); });
      return;
    }
    const f = Number(target) / raw;
    P.forEach((p) => { p[key] = Number((p[key] * f).toFixed(1)); });
    const drift = Number(target) - P.reduce((t, p) => t + p[key], 0);
    const last = P[P.length - 1];
    last[key] = Number((last[key] + drift).toFixed(1));
  };
  scale('proj', tProj);
  scale('fin', tFinal);
  scale('live', tLive);
  return P;
}
