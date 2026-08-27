import type { Game, Side, WeekMatchups } from '@/lib/types';
import { winPct } from './derive';

/* ── Week 11 · live ───────────────────────────────────────────────────────
   From "Weekly Matchups.dc.html". Source tuples were
   [home, away, hScore, aScore, state, tag, hRec, aRec, hProj, aProj, hWin, aWin]
   with parallel gameYtp / gamePre arrays; unpacked into objects here.       */

const WEEK_11_HOME: Side = {
  name: 'Ridge Runners', rec: '7-3', score: '90.1', proj: '112.4', left: '2', win: '51%',
};
const WEEK_11_AWAY: Side = {
  name: 'Mahomes Depot', rec: '6-4', score: '88.1', proj: '118.9', left: '3', win: '49%',
};

const WEEK_11_GAMES: Game[] = [
  { home: 'Hurts So Good', away: 'Dak to the Future', hScore: '112.4', aScore: '104.9', state: 'FINAL', hRec: '8-2', aRec: '5-5', hProj: '112.4', aProj: '104.9', hWin: '100%', aWin: '—', hLeft: '0', aLeft: '0', hPre: '108.6', aPre: '101.2' },
  { home: 'Trust the Process', away: 'Zero RB Zealots', hScore: '88.6', aScore: '91.2', state: 'IN PROGRESS · 4 LEFT', hRec: '6-4', aRec: '4-6', hProj: '115.0', aProj: '108.3', hWin: '62%', aWin: '38%', hLeft: '2', aLeft: '2', hPre: '110.3', aPre: '106.5' },
  { home: 'Puka Chu', away: 'Waiver Wire Warlords', hScore: '76.0', aScore: '63.5', state: 'IN PROGRESS · 6 LEFT', hRec: '5-5', aRec: '3-7', hProj: '104.8', aProj: '99.1', hWin: '58%', aWin: '42%', hLeft: '3', aLeft: '3', hPre: '102.4', aPre: '100.8' },
  { home: 'Bijan Mustard', away: 'Tanking Softly', hScore: '121.7', aScore: '70.4', state: 'FINAL', hRec: '9-1', aRec: '2-8', hProj: '121.7', aProj: '70.4', hWin: '100%', aWin: '—', hLeft: '0', aLeft: '0', hPre: '115.9', aPre: '88.7' },
  { home: "Kelce's Angels", away: 'Rookie Szn', hScore: '59.8', aScore: '66.2', state: 'IN PROGRESS · 5 LEFT', hRec: '4-6', aRec: '5-5', hProj: '96.2', aProj: '110.4', hWin: '24%', aWin: '76%', hLeft: '2', aLeft: '3', hPre: '99.5', aPre: '104.2' },
  { home: 'Sunk Cost Fantasy', away: 'Third Round Reach', hScore: '99.3', aScore: '97.8', state: 'IN PROGRESS · 2 LEFT', hRec: '7-3', aRec: '6-4', hProj: '106.0', aProj: '113.7', hWin: '41%', aWin: '59%', hLeft: '1', aLeft: '1', hPre: '104.1', aPre: '109.0' },
];

/* ── Week 10 · final ──────────────────────────────────────────────────────
   From "Weekly Matchups - Past.dc.html". Source tuples were
   [home, away, hScore, aScore, hRec, aRec, hProj, aProj].                   */

const WEEK_10_GAMES: Game[] = [
  { home: 'Hurts So Good', away: 'Puka Chu', hScore: '134.8', aScore: '96.3', state: 'FINAL', hRec: '8-2', aRec: '5-5', hProj: '121.4', aProj: '108.7', hWin: '100%', aWin: '—', hLeft: '0', aLeft: '0', hPre: '121.4', aPre: '108.7' },
  { home: 'Trust the Process', away: 'Bijan Mustard', hScore: '87.2', aScore: '113.6', state: 'FINAL', hRec: '5-5', aRec: '9-1', hProj: '110.9', aProj: '119.2', hWin: '—', aWin: '100%', hLeft: '0', aLeft: '0', hPre: '110.9', aPre: '119.2' },
  { home: 'Dak to the Future', away: 'Tanking Softly', hScore: '102.7', aScore: '99.4', state: 'FINAL', hRec: '5-5', aRec: '2-8', hProj: '105.3', aProj: '92.8', hWin: '100%', aWin: '—', hLeft: '0', aLeft: '0', hPre: '105.3', aPre: '92.8' },
  { home: "Kelce's Angels", away: 'Sunk Cost Fantasy', hScore: '78.5', aScore: '124.1', state: 'FINAL', hRec: '4-6', aRec: '7-3', hProj: '96.6', aProj: '111.5', hWin: '—', aWin: '100%', hLeft: '0', aLeft: '0', hPre: '96.6', aPre: '111.5' },
  { home: 'Zero RB Zealots', away: 'Waiver Wire Warlords', hScore: '116.9', aScore: '115.2', state: 'FINAL', hRec: '4-6', aRec: '3-7', hProj: '107.8', aProj: '103.4', hWin: '100%', aWin: '—', hLeft: '0', aLeft: '0', hPre: '107.8', aPre: '103.4' },
  { home: 'Rookie Szn', away: 'Third Round Reach', hScore: '64.3', aScore: '88.7', state: 'FINAL', hRec: '5-5', aRec: '6-4', hProj: '94.1', aProj: '106.2', hWin: '—', aWin: '100%', hLeft: '0', aLeft: '0', hPre: '94.1', aPre: '106.2' },
];

/* ── Week 12 · pre-kickoff ────────────────────────────────────────────────
   From "Weekly Matchups - Future.dc.html". Source tuples were
   [home, away, hProj, aProj, hRec, aRec, kickoff]. Nothing has kicked off,
   so the "score" a row shows is its projection.                             */

/** Nothing has kicked off, so win probability comes from the projections. */
function preGame(g: Omit<Game, 'hWin' | 'aWin'>): Game {
  const [hWin, aWin] = winPct(g.hPre, g.aPre);
  return { ...g, hWin, aWin };
}

const WEEK_12_GAMES: Game[] = [
  preGame({ home: 'Hurts So Good', away: 'Trust the Process', hScore: '119.4', aScore: '108.2', state: 'PRE', hRec: '9-2', aRec: '6-5', hProj: '119.4', aProj: '108.2', hLeft: '9', aLeft: '9', hPre: '119.4', aPre: '108.2', kick: 'THU 8:15 ET' }),
  preGame({ home: 'Bijan Mustard', away: 'Dak to the Future', hScore: '124.7', aScore: '101.9', state: 'PRE', hRec: '10-1', aRec: '5-6', hProj: '124.7', aProj: '101.9', hLeft: '9', aLeft: '9', hPre: '124.7', aPre: '101.9', kick: 'SUN 1:00 ET' }),
  preGame({ home: 'Puka Chu', away: "Kelce's Angels", hScore: '103.6', aScore: '98.4', state: 'PRE', hRec: '6-5', aRec: '4-7', hProj: '103.6', aProj: '98.4', hLeft: '9', aLeft: '9', hPre: '103.6', aPre: '98.4', kick: 'SUN 1:00 ET' }),
  preGame({ home: 'Zero RB Zealots', away: 'Rookie Szn', hScore: '110.1', aScore: '112.8', state: 'PRE', hRec: '5-6', aRec: '6-5', hProj: '110.1', aProj: '112.8', hLeft: '9', aLeft: '9', hPre: '110.1', aPre: '112.8', kick: 'SUN 1:00 ET' }),
  preGame({ home: 'Waiver Wire Warlords', away: 'Tanking Softly', hScore: '96.2', aScore: '89.5', state: 'PRE', hRec: '3-8', aRec: '2-9', hProj: '96.2', aProj: '89.5', hLeft: '9', aLeft: '9', hPre: '96.2', aPre: '89.5', kick: 'SUN 4:25 ET' }),
  preGame({ home: 'Sunk Cost Fantasy', away: 'Third Round Reach', hScore: '107.3', aScore: '114.6', state: 'PRE', hRec: '8-3', aRec: '6-5', hProj: '107.3', aProj: '114.6', hLeft: '9', aLeft: '9', hPre: '107.3', aPre: '114.6', kick: 'SUN 8:20 ET' }),
];

const WEEK_11: WeekMatchups = {
  week: 11,
  head: 'LIVE',
  clock: 'SUN 1:07 ET',
  playersLeft: WEEK_11_HOME.left + ' YET TO PLAY',
  home: WEEK_11_HOME,
  away: WEEK_11_AWAY,
  note: 'Two points up with Gibbs still on the bus. Depot has four bodies left. Enjoy the view while it lasts.',
  games: WEEK_11_GAMES,
};

const WEEK_10: WeekMatchups = {
  week: 10,
  head: 'FINAL',
  clock: 'TUE 9:41 ET',
  playersLeft: '',
  home: { name: 'Ridge Runners', rec: '7-3', score: '118.2', proj: '112.4', left: '0', win: '100%' },
  away: { name: 'Mahomes Depot', rec: '6-4', score: '101.6', proj: '118.9', left: '0', win: '—' },
  // The Past design authored a `resultText` note but never rendered it.
  // Left unrendered here so the screen matches the mockup.
  note: null,
  games: WEEK_10_GAMES,
};

/**
 * Week 9 has no mock data of its own — the design's week picker pointed it at
 * the same Past (Final) file as Week 10. Per the agreed handling it reuses
 * Week 10's six league games under a Week 9 heading, with the user's own
 * result taken from the dropdown note ("L 94.0–110.7"). Records are Week 10's
 * rolled back by one game. Real MFL data replaces all of this.
 */
const WEEK_9: WeekMatchups = {
  week: 9,
  head: 'FINAL',
  clock: 'TUE 9:41 ET',
  playersLeft: '',
  home: { name: 'Ridge Runners', rec: '6-3', score: '94.0', proj: '108.9', left: '0', win: '—' },
  away: { name: 'Mahomes Depot', rec: '6-3', score: '110.7', proj: '105.2', left: '0', win: '100%' },
  note: null,
  games: WEEK_10_GAMES,
};

const [W12_HOME_WIN, W12_AWAY_WIN] = winPct('115.8', '109.3');

const WEEK_12: WeekMatchups = {
  week: 12,
  head: 'KICKOFF THU 8:15 ET',
  clock: 'WED 9:41 ET',
  playersLeft: '9 YET TO PLAY',
  home: { name: 'Ridge Runners', rec: '8-3', score: '115.8', proj: '115.8', left: '9', win: W12_HOME_WIN },
  away: { name: 'Mahomes Depot', rec: '6-5', score: '109.3', proj: '109.3', left: '9', win: W12_AWAY_WIN },
  note: 'Nothing has happened yet. These are the projections you go in with.',
  games: WEEK_12_GAMES,
};

const BY_WEEK: Record<number, WeekMatchups> = {
  9: WEEK_9,
  10: WEEK_10,
  11: WEEK_11,
  12: WEEK_12,
};

export function getWeekMatchups(week: number): WeekMatchups {
  return BY_WEEK[week] ?? WEEK_11;
}

/**
 * The pager order on Matchup Detail: index 0 is the user's own game,
 * 1–6 are the "around the league" games, matching the design's `?m=N`.
 */
export function matchupList(week: number) {
  const w = getWeekMatchups(week);
  const yours: Game & { yours: true } = {
    yours: true,
    home: w.home.name,
    away: w.away.name,
    hScore: w.home.score,
    aScore: w.away.score,
    state: w.head,
    hRec: w.home.rec,
    aRec: w.away.rec,
    hProj: w.home.proj,
    aProj: w.away.proj,
    hWin: w.home.win,
    aWin: w.away.win,
    hLeft: w.home.left,
    aLeft: w.away.left,
    hPre: w.home.proj,
    aPre: w.away.proj,
  };
  const rest = w.games.map((g) => ({ ...g, yours: false as const }));
  return [yours, ...rest];
}
