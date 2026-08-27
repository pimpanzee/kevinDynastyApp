/** Phase of a week. Derived from week status, never set by a UI control. */
export type Phase = 'pre' | 'live' | 'final';

export type WeekStatus = 'past' | 'current' | 'future';

export interface Week {
  /** NFL week number, and the value used in the URL. */
  n: number;
  /** Dropdown label, e.g. "Week 11 · current". */
  label: string;
  /** Right-hand dropdown note, e.g. "LIVE" or "W 118.2–101.6". */
  note: string;
  status: WeekStatus;
}

/** One side of a matchup as the list and detail header need it. */
export interface Side {
  name: string;
  /** Win-loss record, e.g. "7-3". */
  rec: string;
  /** Live/final score. */
  score: string;
  /** Projected total. */
  proj: string;
  /** Players yet to play. */
  left: string;
  /** Win probability, e.g. "51%". */
  win: string;
}

/** An "around the league" game. Field order mirrors the design's tuples. */
export interface Game {
  home: string;
  away: string;
  hScore: string;
  aScore: string;
  /** "FINAL" or "IN PROGRESS · N LEFT". */
  state: string;
  hRec: string;
  aRec: string;
  /** Live projection (live weeks) or final projection (past weeks). */
  hProj: string;
  aProj: string;
  hWin: string;
  aWin: string;
  /** Players yet to play per side. */
  hLeft: string;
  aLeft: string;
  /** Pre-kickoff projection, used for the `pre` phase. */
  hPre: string;
  aPre: string;
  /** Kickoff time, future weeks only. */
  kick?: string;
}

/** A week's full matchup set: the user's game plus the six league games. */
export interface WeekMatchups {
  week: number;
  /** Status-strip label: "LIVE", "KICKOFF THU 8:15 ET", "FINAL". */
  head: string;
  /** Status-bar clock on the right, e.g. "SUN 1:07 ET". */
  clock: string;
  /** Right-hand count on the status strip, blank on past weeks. */
  playersLeft: string;
  home: Side;
  away: Side;
  /** Trash-talk / result note. Null when the design renders none. */
  note: string | null;
  games: Game[];
}

export interface RosterPlayer {
  name: string;
  team: string;
  pos: string;
  ecr: string;
  proj: string;
  pts: string;
  bye: number;
  salary: number;
  years: number;
  status?: string;
  /** Matchup strength, 1–5, rendered as stars. */
  matchup: number;
}

export interface StandingsTeam {
  name: string;
  record: string;
  pf: string;
  pa: string;
  div: string;
  conf: string;
  /** Power points — a power-ranking metric, distinct from points for. */
  pp: string;
  pct: string;
  gb: string;
  streak: string;
  avgPf: string;
  avgPa: string;
}

export interface StandingsGroup {
  label: string;
  teams: StandingsTeam[];
}
