/**
 * Head-to-head and all-time records from the league's history (the relay's
 * GET /history, worker/src/history.js). Pure functions; lib/useHistory.ts
 * fetches the data.
 */

/** [season, week, home, homeScore, away, awayScore, kind]; kind is "regular" or a playoff bracket's name. */
export type HistoryGame = [number, number, string, number, string, number, string];

export interface HistorySeason {
  names: Record<string, string>;
  regEnd: number;
  end: number;
  champion: string | null;
  runnerUp: string | null;
  complete: boolean;
}

export interface History {
  seasons: Record<string, HistorySeason>;
  games: HistoryGame[];
}

/** A game from one team's side. */
export interface Meeting {
  season: number;
  week: number;
  us: number;
  them: number;
  playoff: boolean;
  kind: string;
}

export interface HeadToHead {
  /** Meetings oldest first. */
  meetings: Meeting[];
  wins: number;
  losses: number;
  ties: number;
  /** Playoff meetings only. */
  playoff: { wins: number; losses: number; ties: number };
  /** Who won the most recent run of meetings, and how many in a row: 'us', 'them' or null after a tie. */
  streak: { who: 'us' | 'them' | null; n: number };
  last: Meeting | null;
  /** Biggest win margin by either side. */
  blowout: (Meeting & { margin: number; who: 'us' | 'them' }) | null;
  closest: (Meeting & { margin: number }) | null;
  avgUs: number;
  avgThem: number;
}

const isPlayoff = (kind: string) => kind !== 'regular';
const before = (g: HistoryGame, cut?: { season: number; week: number }) => !cut || g[0] < cut.season || (g[0] === cut.season && g[1] < cut.week);

/**
 * Every meeting of `us` and `them`, from `us`'s side, and what they add up to.
 * With `cut`, only games before that season and week (so a matchup's own game
 * doesn't count toward its history).
 */
export function headToHead(history: History, us: string, them: string, cut?: { season: number; week: number }): HeadToHead {
  const meetings: Meeting[] = [];
  for (const g of history.games) {
    if (!before(g, cut)) continue;
    const [season, week, home, hs, away, as, kind] = g;
    if (home === us && away === them) meetings.push({ season, week, us: hs, them: as, playoff: isPlayoff(kind), kind });
    else if (home === them && away === us) meetings.push({ season, week, us: as, them: hs, playoff: isPlayoff(kind), kind });
  }
  meetings.sort((a, b) => a.season - b.season || a.week - b.week);

  const out: HeadToHead = {
    meetings, wins: 0, losses: 0, ties: 0, playoff: { wins: 0, losses: 0, ties: 0 },
    streak: { who: null, n: 0 }, last: meetings.at(-1) ?? null, blowout: null, closest: null, avgUs: 0, avgThem: 0,
  };
  for (const m of meetings) {
    const r = m.us > m.them ? 'wins' : m.us < m.them ? 'losses' : 'ties';
    out[r] += 1;
    if (m.playoff) out.playoff[r] += 1;
    const margin = Math.abs(m.us - m.them);
    if (margin > 0 && (!out.blowout || margin > out.blowout.margin)) out.blowout = { ...m, margin, who: m.us > m.them ? 'us' : 'them' };
    if (!out.closest || margin < out.closest.margin) out.closest = { ...m, margin };
    out.avgUs += m.us / meetings.length;
    out.avgThem += m.them / meetings.length;
  }
  for (let i = meetings.length - 1; i >= 0; i -= 1) {
    const m = meetings[i];
    const who = m.us > m.them ? 'us' : m.us < m.them ? 'them' : null;
    if (i === meetings.length - 1) out.streak = { who, n: who ? 1 : 0 };
    else if (who && who === out.streak.who) out.streak.n += 1;
    else break;
  }
  return out;
}

export interface AllTime {
  /** Regular season only. */
  wins: number;
  losses: number;
  ties: number;
  titles: number[];
  finals: number[];
  /** Seasons with a game in a playoff bracket. */
  playoffSeasons: number[];
  seasons: number;
}

/** One team's record across every stored season. */
export function allTime(history: History, id: string): AllTime {
  const out: AllTime = { wins: 0, losses: 0, ties: 0, titles: [], finals: [], playoffSeasons: [], seasons: 0 };
  const playoffs = new Set<number>();
  const seasons = new Set<number>();
  for (const [season, , home, hs, away, as, kind] of history.games) {
    if (home !== id && away !== id) continue;
    seasons.add(season);
    if (isPlayoff(kind)) {
      if (kind !== 'Consolation') playoffs.add(season);
      continue;
    }
    const [us, them] = home === id ? [hs, as] : [as, hs];
    if (us > them) out.wins += 1;
    else if (us < them) out.losses += 1;
    else out.ties += 1;
  }
  for (const [y, s] of Object.entries(history.seasons)) {
    if (s.champion === id) out.titles.push(Number(y));
    if (s.champion === id || s.runnerUp === id) out.finals.push(Number(y));
  }
  out.playoffSeasons = [...playoffs].sort();
  out.seasons = seasons.size;
  return out;
}

export const record = (r: { wins: number; losses: number; ties: number }) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
