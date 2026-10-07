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
}

export interface BoxPlayerView {
  name: string;
  /** "SEA · FINAL" or "DET · 4:25 ET · yet to play" */
  line: string;
  pts: string;
  /** `pts` unrounded, for the breakdown total. */
  ptsExact?: number;
  proj: string;
  /** Box-score line: "32/52 CMP, 412 YD, 1 TD". Absent before kickoff. */
  byline?: string;
  /** How the stats became points, for the tap-to-open sheet. */
  breakdown?: Breakdown;
  /** For patching the row from live scores; absent on an empty slot. */
  live?: { id: string; team: string; kickoff: string; position: string; sleeperId?: string };
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
}

export interface RosterPlayerView {
  playerId: string;
  name: string;
  /** "SEA · WR" */
  teamPos: string;
  salaryFmt: string;
  yearsLabel: string;
  /** Expand row: projected points for the current week. */
  proj: string;
  /** Expand row: season points to date. */
  pts: string;
}

export interface RosterView {
  franchises: Array<{ id: string; name: string; isMine: boolean }>;
  franchiseId: string;
  name: string;
  isMine: boolean;
  groups: Array<{ label: string; players: RosterPlayerView[] }>;
  taxi: RosterPlayerView[];
  footer: { count: number; adj: string; total: string; cap: string };
  simulatedAt: string | null;
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
}

export interface StandingsView {
  groups: Array<{ label: string; teams: StandingsTeamView[] }>;
  simulatedAt: string | null;
}
