import { TTL, cached } from './cache';
import type { League } from './league';
import { getWeeklyResults } from './matchups';

/**
 * Standings computed from weekly results rather than read from
 * TYPE=leagueStandings.
 *
 * MFL's standings endpoint always reports the finished season and ignores any
 * week parameter, so under a simulated clock it leaks the future — at week 11
 * it would show a team as 12-2. Aggregating the weeks that have actually
 * completed keeps the table honest at whatever moment the app is pointed at,
 * and reproduces every field the design shows.
 *
 * Verified against MFL's own season figures: this league scores the submitted
 * lineup (`bestLineup = No`), and `score` decides all 84 regular-season
 * matchups. Power points are the running sum of each week's optimal lineup.
 */

export interface StandingsRow {
  franchiseId: string;
  record: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  divRecord: string;
  confRecord: string;
  /** Power points: the sum of weekly optimal-lineup totals. */
  pp: number;
  pct: string;
  streak: string;
  avgPf: number;
  avgPa: number;
  games: number;
  /** Victory points (head-to-head result plus weekly scoring bucket), 0 when unused. */
  vp: number;
}

interface Tally {
  wins: number; losses: number; ties: number;
  pf: number; pa: number; pp: number;
  div: [number, number, number];
  conf: [number, number, number];
  /** Outcomes in week order, for the streak. */
  outcomes: Array<'W' | 'L' | 'T'>;
  vp: number;
}

const blank = (): Tally => ({
  wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, pp: 0, vp: 0,
  div: [0, 0, 0], conf: [0, 0, 0], outcomes: [],
});

function record(t: [number, number, number]): string {
  return `${t[0]}-${t[1]}-${t[2]}`;
}

function streak(outcomes: Array<'W' | 'L' | 'T'>): string {
  if (outcomes.length === 0) return '—';
  const last = outcomes[outcomes.length - 1];
  let n = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === last; i--) n++;
  return `${last}${n}`;
}

function pctString(wins: number, losses: number, ties: number): string {
  const games = wins + losses + ties;
  if (games === 0) return '.000';
  const pct = (wins + ties / 2) / games;
  return pct.toFixed(3).replace(/^0/, '');
}

/**
 * Aggregate weeks 1..throughWeek. Only completed weeks should be passed — a
 * week still in progress has not produced a result yet, exactly as a real
 * standings table would not move until the games finish.
 */
export async function computeStandings(throughWeek: number, league: League): Promise<Map<string, StandingsRow>> {
  // The aggregate for a given cut-off never changes once those weeks are done.
  // Cached as entries rather than a Map: the cache persists to disk as JSON,
  // and a Map does not survive that round trip.
  const entries = await cached<Array<[string, StandingsRow]>>(
    // v2: rows carry victory points; older cached rows don't.
    `standings2:${league.id}:${throughWeek}`,
    TTL.FINAL_RESULTS,
    async () => [...(await buildStandings(throughWeek, league))],
  );
  return new Map(entries);
}

async function buildStandings(throughWeek: number, league: League): Promise<Map<string, StandingsRow>> {
  const tallies = new Map<string, Tally>();
  for (const f of league.franchises) tallies.set(f.id, blank());

  const divisionOf = new Map(league.franchises.map((f) => [f.id, f.divisionId]));
  const conferenceOf = new Map(league.franchises.map((f) => [f.id, f.conferenceId]));

  for (let week = league.startWeek; week <= throughWeek; week++) {
    const results = await getWeeklyResults(week);
    if (!results) continue;

    for (const matchup of results) {
      if (matchup.length !== 2) continue;
      const [a, b] = matchup;
      const ta = tallies.get(a.franchiseId);
      const tb = tallies.get(b.franchiseId);
      if (!ta || !tb) continue;

      const sameDivision = divisionOf.get(a.franchiseId) === divisionOf.get(b.franchiseId);
      const sameConference = conferenceOf.get(a.franchiseId) === conferenceOf.get(b.franchiseId);

      const apply = (self: Tally, own: typeof a, opp: typeof b) => {
        self.pf += own.score;
        self.pa += opp.score;
        self.pp += own.optPts;
        const outcome: 'W' | 'L' | 'T' = own.score > opp.score ? 'W' : own.score < opp.score ? 'L' : 'T';
        self.outcomes.push(outcome);
        const slot = outcome === 'W' ? 0 : outcome === 'L' ? 1 : 2;
        if (outcome === 'W') self.wins++;
        else if (outcome === 'L') self.losses++;
        else self.ties++;
        if (sameDivision) self.div[slot]++;
        if (sameConference) self.conf[slot]++;
      };

      apply(ta, a, b);
      apply(tb, b, a);
    }

    // Victory points: the head-to-head result, plus the week's scoring bucket.
    const vp = league.victoryPoints;
    if (vp && week >= vp.startWeek && week <= vp.endWeek) {
      const sides = results.flatMap((m) => (m.length === 2 ? [[m[0], m[1]], [m[1], m[0]]] : []));
      for (const [own, opp] of sides) {
        const t = tallies.get(own.franchiseId);
        if (t) t.vp += own.score > opp.score ? vp.win : own.score < opp.score ? vp.loss : vp.tie;
      }
      if (vp.buckets.length > 0) {
        const ranked = sides.map(([own]) => own).sort((x, y) => y.score - x.score);
        const size = ranked.length / vp.buckets.length;
        ranked.forEach((side, i) => {
          const t = tallies.get(side.franchiseId);
          if (t) t.vp += vp.buckets[Math.min(vp.buckets.length - 1, Math.floor(i / size))] ?? 0;
        });
      }
    }
  }

  const rows = new Map<string, StandingsRow>();
  for (const [id, t] of tallies) {
    const games = t.wins + t.losses + t.ties;
    rows.set(id, {
      franchiseId: id,
      record: `${t.wins}-${t.losses}-${t.ties}`,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pf: Number(t.pf.toFixed(2)),
      pa: Number(t.pa.toFixed(2)),
      divRecord: record(t.div),
      confRecord: record(t.conf),
      pp: Number(t.pp.toFixed(2)),
      pct: pctString(t.wins, t.losses, t.ties),
      streak: streak(t.outcomes),
      avgPf: games ? Number((t.pf / games).toFixed(2)) : 0,
      avgPa: games ? Number((t.pa / games).toFixed(2)) : 0,
      games,
      vp: t.vp,
    });
  }
  return rows;
}

/**
 * Games back of the division leader — MFL does not report it, so it is derived
 * the conventional way from the win and loss differentials.
 */
export function gamesBack(row: StandingsRow, leader: StandingsRow): string {
  if (row.franchiseId === leader.franchiseId) return '—';
  const gb = (leader.wins - row.wins + (row.losses - leader.losses)) / 2;
  return gb <= 0 ? '—' : gb.toFixed(1);
}

/**
 * The league's own sort (standingsSort = VICTORY_POINTS,H2H,DIVPCT,CONFPCT,PTS):
 * victory points when it uses them, then win percentage, then points for.
 */
export function sortDivision(rows: StandingsRow[]): StandingsRow[] {
  return rows.slice().sort((a, b) => {
    if (b.vp !== a.vp) return b.vp - a.vp;
    const pa = a.games ? (a.wins + a.ties / 2) / a.games : 0;
    const pb = b.games ? (b.wins + b.ties / 2) / b.games : 0;
    return pb !== pa ? pb - pa : b.pf - a.pf;
  });
}

/** Victory points behind the division leader. */
export function vpBack(row: StandingsRow, leader: StandingsRow): string {
  const d = leader.vp - row.vp;
  return row.franchiseId === leader.franchiseId || d <= 0 ? '—' : String(d);
}
