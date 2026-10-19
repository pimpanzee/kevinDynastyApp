import type { Breakdown, RuleSet } from '@/lib/scoring';

/**
 * View models the screens render. Everything here is already formatted for
 * display — the MFL layer does the joining, gating and rounding so components
 * stay presentational.
 */

export type Phase = 'pre' | 'live' | 'final';

export type WeekStatus = 'past' | 'current' | 'future';

export interface WeekOption {
  n: number;
  /** "Week 11 · current" */
  label: string;
  /** Right-hand note: "LIVE", "THU 8:15", or the user's result that week. */
  note: string;
  /** For a finished week, every franchise's result, so a chosen team can be shown. */
  notes?: Record<string, string>;
  status: WeekStatus;
}

/** One franchise as the score block renders it. */
export interface SideView {
  franchiseId: string;
  name: string;
  /** Franchise icon URL, when the owner has set one. */
  icon?: string;
  /** Big number: live or final score, or the projected total pre-kickoff. */
  num: string;
  /** Small line beneath it — usually the projection. */
  sub: string;
  /** "7-3 · 2 YTP" */
  meta: string;
  /** "51%" while in doubt, "W"/"L" once decided, "" when unknown. */
  win: string;
  scoreValue: number;
  /**
   * Once games are under way: points banked plus what the starters still to
   * play are projected to add. The top-6 race ranks by this until the side
   * is `done`.
   */
  projectedFinal?: number;
  /** Every starter's game is over, so `scoreValue` is the side's final score. */
  done?: boolean;
  /**
   * Projected points for every rostered player, by id — present only while
   * the week can still go live, for the browser's live overlay.
   */
  projections?: Record<string, number>;
}

export interface MatchupView {
  index: number;
  isMine: boolean;
  final: boolean;
  home: SideView;
  away: SideView;
  /** Width of the probability bar, or null when there is nothing to show. */
  bar: string | null;
  /** Tail label under a row: "FINAL" or a kickoff time. */
  tail: string | null;
}

export interface WeekView {
  week: number;
  phase: Phase;
  leagueName: string;
  /** Status-bar clock, e.g. "SUN 1:07 ET". */
  clock: string;
  /** Status strip: "LIVE", "KICKOFF THU 8:15 ET", "FINAL". */
  head: string;
  /** "2 YET TO PLAY", blank once a week is done. */
  playersLeft: string;
  /** Index 0 is the user's own matchup. */
  matchups: MatchupView[];
  /** The user's franchise, for the live overlay's yet-to-play count. */
  myFranchiseId: string;
  weeks: WeekOption[];
  /** Set when the app is running on a simulated clock. */
  simulatedAt: string | null;
  /** [start, end] spans in ms while games are being played — when to poll. */
  liveWindow: Array<[number, number]> | null;
  /**
   * Until a week is over: each franchise's starters as of the build, and every
   * rostered player flagged as unlikely to score (lib/lineupAlerts.ts).
   */
  lineupAlerts?: {
    starters: Record<string, string[]>;
    problems: Record<string, import('@/lib/lineupAlerts').LineupProblem>;
  };
}

export interface BoxPlayerView {
  name: string;
  /** "SEA · FINAL" or "DET · 4:25 ET · yet to play" */
  line: string;
  pts: string;
  /** `pts` unrounded, for the breakdown total. */
  ptsExact?: number;
  /** Pre-game projection, "proj 12.4". */
  proj: string;
  /** Live projection once his game is under way: points so far plus what's left of `proj`. */
  projNow?: string;
  /** Box-score line: "32/52 CMP, 412 YD, 1 TD". Absent before kickoff. */
  byline?: string;
  /** How the stats became points, for the tap-to-open sheet. */
  breakdown?: Breakdown;
  /** NFL injury designation: Q, D, O or IR. */
  injury?: string;
  /** For patching the row from live scores; absent on an empty slot. */
  live?: {
    id: string; team: string; kickoff: string; position: string; sleeperId?: string;
    /** NFL opponent that week and whether the player's team is at home, for the game line. Absent on a bye. */
    opp?: string; home?: boolean;
  };
}

export interface BoxRowView {
  pos: string;
  home: BoxPlayerView;
  away: BoxPlayerView;
}

export interface MatchupDetailView {
  week: number;
  phase: Phase;
  clock: string;
  /** "LIVE" / "FINAL" / "KICKOFF THU 8:15 ET" */
  tag: string;
  liveDot: boolean;
  index: number;
  total: number;
  isMine: boolean;
  home: SideView;
  away: SideView;
  bar: string;
  starters: BoxRowView[];
  bench: BoxRowView[];
  /** The build's default team; the browser may substitute the user's choice. */
  myFranchiseId: string;
  simulatedAt: string | null;
  liveWindow: Array<[number, number]> | null;
  /** While games can be live: what the browser needs to rescore fresh stats. */
  scoring?: { rules: RuleSet; statsUrl: string };
  /** Sleeper's NFL scores for the week, for each player's game line. Absent before kickoff. */
  scoresUrl?: string;
}

export interface StandingsTeamView {
  franchiseId: string;
  rank: number;
  name: string;
  record: string;
  pf: string;
  pa: string;
  div: string;
  conf: string;
  pp: string;
  pct: string;
  gb: string;
  streak: string;
  avgPf: string;
  avgPa: string;
  /** Victory points, when the league uses them; null otherwise. */
  vp: number | null;
  /** Victory points behind the division leader. */
  vpBack: string;
  icon: string | null;
}

export interface StandingsView {
  groups: Array<{ label: string; teams: StandingsTeamView[] }>;
  /** The build's default franchise; the viewer's own choice replaces it in the browser. */
  myFranchiseId: string;
  simulatedAt: string | null;
}

/* ── Players ─────────────────────────────────────────────────────────────── */

/** The stats the Players screen shows, keyed as Sleeper names them. */
export type PlayerStatKey =
  | 'pass_yd' | 'pass_td' | 'pass_int'
  | 'rush_att' | 'rush_yd' | 'rush_td'
  | 'rec_tgt' | 'rec' | 'rec_yd' | 'rec_td';

export type PlayerStats = Partial<Record<PlayerStatKey, number>>;

export interface PlayerGame {
  /** "@ BUF" away, "BUF" at home. */
  opp: string;
  /** "SUN 1:00 ET" */
  kickoff: string;
}

export interface PlayerRow {
  id: string;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  nflTeam: string;
  bye: number | null;
  injury?: string;
  /** The franchise rostering him (taxi and IR included); absent when available. */
  owner?: string;
  /** The projection week's game; null on his bye. */
  next: PlayerGame | null;
  /** Last week's game; null on his bye. */
  last: PlayerGame | null;
  /** Projected points in league scoring, null with no projection, and the line behind them. */
  proj: { pts: number | null; stats: PlayerStats };
  /** Last week: null when he didn't play. Points are MFL's. */
  lastWeek: { pts: number; stats: PlayerStats } | null;
  /** Season to date: games played, MFL's points, stat totals. */
  season: { gp: number; pts: number; stats: PlayerStats };
}

export interface PlayersData {
  /** The week projections are for: the next one not yet finished. */
  projWeek: number;
  /** The most recent finished week, or null before week 1 ends. */
  lastWeek: number | null;
  /** False when Sleeper has no projections for projWeek yet. */
  hasProj: boolean;
  franchises: Array<{ id: string; abbrev: string; name: string; icon: string | null }>;
  /** The build's default team; the viewer's own choice replaces it in the browser. */
  myFranchiseId: string;
  players: PlayerRow[];
  builtAt: string;
}

/* ── Player card ─────────────────────────────────────────────────────────── */

export interface PlayerCardWeek {
  week: number;
  /** "@ BUF" away, "BUF" at home; null on his bye. */
  opp: string | null;
  /** True for weeks not yet played. */
  future: boolean;
  /** Projected points that week in league scoring; null with no projection. */
  proj?: number | null;
  /** Null when he didn't play (or the week is ahead). */
  game: {
    /** MFL's points, in this league's scoring. */
    fpts: number;
    /** Position rank that week by MFL points. */
    rank: number | null;
    /** Share of the team's offensive snaps, 0–100. */
    snp: number | null;
    /** Sleeper stat keys; zeros omitted. */
    stats: Record<string, number>;
  } | null;
}

export interface PlayerCardData {
  id: string;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  nflTeam: string;
  jersey?: number;
  /** Sleeper's headshot; the card falls back to initials if it fails. */
  headshot?: string;
  /** ESPN's player id: the card reads his latest news from ESPN when it opens. */
  espnId?: string;
  bio: { age?: number; height?: number; weight?: number; exp?: number };
  injury?: string;
  bye: number | null;
  /** Franchise name, or absent when he's on waivers. */
  owner?: { id: string; name: string };
  /** Rostered players only. `code` is MFL's contractStatus, shown as-is. */
  contract?: { salary: number; years: number; code: string; status: 'Active' | 'Taxi' | 'IR' };
  season: { gp: number; fpts: number; rank: number | null; ovrRank?: number | null };
  /** Free agents: the market price of his production (contract value), a bidding guide. */
  market?: number;
  log: PlayerCardWeek[];
}

/* ── Transactions ────────────────────────────────────────────────────────── */

export interface TxPlayer {
  type: 'player';
  id: string;
  /** "Jonathan Taylor", or "Unknown player" for an id the player database lacks. */
  name: string;
  /** Empty when unknown. */
  pos: string;
  nflTeam: string;
  injury?: string;
  /** Whether a player card was built for him, so the name can open it. */
  card: boolean;
  /** His contract today, wherever he's rostered (absent when he's a free agent). */
  salary?: number;
  years?: number;
}

export interface TxPick {
  type: 'pick';
  /** "2027 R1" */
  label: string;
  /** "Nosmo King's", or "PICK 1.05" for a current-year pick. */
  from: string;
}

export type TxAsset = TxPlayer | TxPick;

/**
 * One in-season roster move. For IR and taxi moves, `drops` went onto IR or
 * the taxi squad and `adds` came back off it to the active roster.
 */
export interface TxMove {
  id: string;
  kind: 'waivers' | 'add' | 'drop' | 'trade' | 'ir' | 'taxi';
  /** Epoch seconds. Waiver claims from one run share the run's timestamp. */
  timestamp: number;
  /** The franchise that made the move; for a trade, the first side. */
  franchiseId: string;
  adds: TxPlayer[];
  drops: TxPlayer[];
  /** Winning blind bid, in dollars. */
  bid?: number;
  trade?: { sides: Array<{ franchiseId: string; gave: TxAsset[] }> };
  byCommish?: boolean;
  /** The NFL week the move counts toward: the week being played, or the next one between weeks. */
  week: number;
  /** "WED OCT 7" (ET). */
  day: string;
  /** "WED OCT 7 · 7:00 PM" (ET). */
  when: string;
}

export interface TransactionsData {
  /** The NFL week in progress or up next at build time — "THIS WEEK". */
  currentWeek: number;
  franchises: Array<{ id: string; name: string; abbrev: string; icon: string | null }>;
  /** The build's default team; the viewer's own choice replaces it in the browser. */
  myFranchiseId: string;
  /** Newest first. */
  moves: TxMove[];
  builtAt: string;
}

/* ── My Team / team pages ────────────────────────────────────────────────── */

export interface TeamPlayer {
  id: string;
  name: string;
  pos: string;
  /** MFL NFL team code. */
  team: string;
  bye: number | null;
  injury?: string;
  /** Position rank by PPG among rostered players. */
  rank: number | null;
  gp: number;
  pts: number;
  ppg: number | null;
  salary: number;
  /** Contract years left, never below 1. */
  years: number;
  /** MFL contractStatus, as-is (blank when none). */
  status: string;
  slot: 'ACTIVE' | 'IR' | 'TAXI';
  market: number | null;
  /** Per-season surplus: market − salary. */
  value: number | null;
  contractValue: number | null;
}

export interface TeamPick {
  round: number;
  held: boolean;
  /** "Own pick", "via Second Wind", "Traded to Iron Lung FC". */
  title: string;
  /** Projected slot, "1.10"; blank when traded away. */
  slot: string;
  salary: number;
}

export interface TeamView {
  id: string;
  name: string;
  icon: string | null;
  record: string;
  /** Null when the league doesn't use victory points. */
  vp: number | null;
  avgPf: number;
  pp: number;
  counts: { roster: number; ir: number; taxi: number };
  adj: number;
  used: number;
  room: number;
  split: Array<{ label: string; amount: number }>;
  roster: TeamPlayer[];
  /** Player ids, best and worst contract value first. */
  best: string[];
  worst: string[];
  committed: Array<{ year: number; contracts: number; picks: number }>;
  expiring: string[];
  picks: Array<{ year: number; picks: TeamPick[]; count: number; total: number }>;
}

export interface TeamsData {
  season: number;
  cap: number;
  limits: { rosterMin: number; rosterMax: number; ir: number; taxi: number };
  /** Starter rules: total and per-position minimum and maximum. */
  lineup: { min: number; max: number; positions: Record<string, { min: number; max: number }> };
  myFranchiseId: string;
  teams: TeamView[];
}

/* ── Ratings ─────────────────────────────────────────────────────────────── */

export interface RatingsView {
  /** Ratings are through this week. */
  week: number;
  rows: Array<{
    franchiseId: string;
    name: string;
    icon: string | null;
    rank: number;
    /** Places gained since last week (negative = dropped). */
    move: number;
    pwr: number;
    elo: number;
    allPlay: string;
    luck: number;
  }>;
  myFranchiseId: string;
}
