import { FRANCHISE_ID, GAME_DURATION_MS, SEASON } from '@/lib/config';
import { barWidth, fmtMoney, fmtScore, scoreBar, winPct } from '@/lib/format';
import type {
  BoxPlayerView, BoxRowView, MatchupDetailView, MatchupView, Phase, RosterPlayerView, RosterView,
  SideView, StandingsView, WeekOption, WeekView,
} from '@/lib/types';
import { formatClock, formatKickoff, isSimulated, resolveNow } from './clock';
import { getLeague, type League } from './league';
import { bestLineup, sumPoints } from './lineup';
import { getLeagueSchedule, getWeeklyResults, type ResultSide } from './matchups';
import { getPlayers, lookup, type Player } from './players';
import { getRosters, getSalaryAdjustments } from './rosters';
import { currentWeek, gameState, getNflSchedule, lastCompletedWeek, teamKickoffs, weekPhase, type NflWeek } from './schedule';
import { getProjections, getSeasonPoints } from './scores';
import { scoreBreakdown, statLine, type Breakdown, type RuleSet, type Stats } from '@/lib/scoring';
import { getScoringRules, getSleeperIds, getWeekStats, sleeperStatsUrl } from '@/lib/stats/sleeper';
import { computeStandings, gamesBack, sortDivision, type StandingsRow } from './standings';

/**
 * Assembles MFL responses into the view models the screens render.
 *
 * The governing rule is the simulated clock: nothing that had not happened by
 * `now` may reach the UI. A week after `now` is read from the schedule and
 * projections only — its results are never fetched — and the week containing
 * `now` has its box score gated player by player on whether that player's NFL
 * game had kicked off yet.
 */

interface Context {
  now: number;
  simulatedAt: string | null;
  league: League;
  players: Map<string, Player>;
  nfl: NflWeek[];
  current: number;
  /** Highest week with every game finished — the standings cut-off. */
  completed: number;
}

async function loadContext(nowOverride?: string | null): Promise<Context> {
  const now = resolveNow(nowOverride);
  const [league, players, nfl] = await Promise.all([getLeague(), getPlayers(), getNflSchedule()]);
  return {
    now: now.getTime(),
    simulatedAt: isSimulated(nowOverride) ? formatClock(now) : null,
    league,
    players,
    nfl,
    current: currentWeek(nfl, now.getTime()),
    completed: lastCompletedWeek(nfl, now.getTime()),
  };
}

/**
 * Standings as of `now`, built from the weeks that have finished. Never read
 * from TYPE=leagueStandings, which always reports the completed season.
 */
function standingsAsOfNow(ctx: Context) {
  return computeStandings(ctx.completed, ctx.league);
}

/**
 * When the browser should poll for live scores: while any game is being
 * played, one span per slate with overlapping slates merged — so Thursday
 * night, the Sunday window and Monday night, not the days between. Null on a
 * simulated clock (a replayed week has nothing live to fetch) and for a
 * finished week.
 */
function liveWindow(ctx: Context, week: number, phase: Phase): Array<[number, number]> | null {
  if (ctx.simulatedAt || phase === 'final') return null;
  const kickoffs = (ctx.nfl.find((w) => w.week === week)?.games.map((g) => g.kickoff) ?? [])
    .filter(Boolean)
    .sort((a, b) => a - b);
  const spans: Array<[number, number]> = [];
  for (const k of kickoffs) {
    const last = spans[spans.length - 1];
    if (last && k <= last[1]) last[1] = Math.max(last[1], k + GAME_DURATION_MS);
    else spans.push([k, k + GAME_DURATION_MS]);
  }
  return spans.length ? spans : null;
}

/**
 * Projections for every rostered player, keyed by id, for the browser's
 * live overlay to recompute projected totals and win odds. Only sent while a
 * week can still go live.
 */
function projectionMap(
  franchiseId: string,
  rosters: Map<string, Array<{ playerId: string }>>,
  projections: Map<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of rosters.get(franchiseId) ?? []) out[s.playerId] = projections.get(s.playerId) ?? 0;
  return out;
}

/** Weeks the picker offers: next, current, and the two most recent. */
function weekOptions(ctx: Context, results: Map<number, string>): WeekOption[] {
  const { league, current } = ctx;
  const candidates = [current + 1, current, current - 1, current - 2].filter(
    (n) => n >= league.startWeek && n <= league.endWeek,
  );
  return candidates.map((n) => {
    const status: WeekOption['status'] = n > current ? 'future' : n === current ? 'current' : 'past';
    return {
      n,
      label: `Week ${n}${status === 'current' ? ' · current' : status === 'future' ? ' · next' : ''}`,
      note: results.get(n) ?? '',
      status,
    };
  });
}

/**
 * Points a player has banked by `now`, and how their game stands.
 *
 * MFL keeps no historical in-game snapshot — only the final line — so a game
 * still in progress is prorated by elapsed game time. A player ten minutes
 * into kickoff shows a tenth of what they finished with. That is a model, not
 * a record of what the scoreboard actually read at that instant, and it only
 * applies while replaying a past week under a simulated clock. On the real
 * clock MFL's score is already the in-progress figure and is taken as is; the
 * browser then keeps it current from liveScoring (lib/live.ts).
 */
function gatedScore(
  player: Player,
  finalScore: number,
  kickoffs: Map<string, number>,
  ctx: Context,
): { points: number; state: 'done' | 'in_play' | 'pending' } {
  const { now } = ctx;
  const kickoff = kickoffs.get(player.team);
  const state = gameState(kickoff, now);
  if (!ctx.simulatedAt) return { points: finalScore, state };
  if (state === 'pending') return { points: 0, state };
  if (state === 'done' || kickoff === undefined) return { points: finalScore, state };
  const elapsed = Math.min(1, Math.max(0, (now - kickoff) / GAME_DURATION_MS));
  return { points: Number((finalScore * elapsed).toFixed(2)), state };
}

function sideMeta(record: string, yetToPlay: number): string {
  return `${record} · ${yetToPlay} YTP`;
}

interface BuiltSide {
  view: SideView;
  live: number;
  /** Pre-game projected total, shown under the score. */
  projected: number;
  /** Points banked plus what the players still to come are projected to add. */
  projectedFinal: number;
  yetToPlay: number;
}

function buildSide(
  franchiseId: string,
  ctx: Context,
  standings: Map<string, StandingsRow>,
  phase: Phase,
  live: number,
  projected: number,
  yetToPlay: number,
  projectedFinal = projected,
): BuiltSide {
  const franchise = ctx.league.franchises.find((f) => f.id === franchiseId);
  const name = franchise?.name ?? franchiseId;
  const record = standings.get(franchiseId)?.record ?? '0-0-0';
  return {
    live,
    projected,
    projectedFinal,
    yetToPlay,
    view: {
      franchiseId,
      name,
      icon: franchise?.icon,
      num: phase === 'pre' ? fmtScore(projected) : fmtScore(live),
      sub: phase === 'pre' ? 'projected total' : fmtScore(projected),
      meta: sideMeta(record, phase === 'pre' ? yetToPlay : yetToPlay),
      win: '',
      scoreValue: phase === 'pre' ? projected : live,
    },
  };
}

/** Everything needed to render one week's matchups. */
export async function getWeekView(week: number | undefined, nowOverride?: string | null): Promise<WeekView> {
  const ctx = await loadContext(nowOverride);
  const target = week && Number.isFinite(week) ? week : ctx.current;
  const phase = weekPhase(ctx.nfl, target, ctx.now);

  const [schedule, standings, rosters] = await Promise.all([
    getLeagueSchedule(),
    standingsAsOfNow(ctx),
    getRosters(SEASON, target),
  ]);

  const pairs = schedule.get(target) ?? [];
  const results = phase === 'pre' ? null : await getWeeklyResults(target);

  const nflWeek = ctx.nfl.find((w) => w.week === target);
  const kickoffs = teamKickoffs(nflWeek);

  // Projections cover every rostered player; the same call serves both the
  // projected totals and the per-player "proj" lines on the detail screen.
  const allPlayerIds = [...rosters.values()].flat().map((s) => s.playerId);
  const projections = await getProjections(target, allPlayerIds);

  const byFranchise = new Map<string, ResultSide>();
  for (const m of results ?? []) for (const side of m) byFranchise.set(side.franchiseId, side);

  const build = (franchiseId: string): BuiltSide => {
    const result = byFranchise.get(franchiseId);

    if (phase !== 'pre' && result) {
      const starters = result.players.filter((p) => p.started);
      let live = 0;
      let yetToPlay = 0;
      // What the players still to come are projected to add, so the win
      // probability moves as the day progresses instead of sitting on the
      // pre-game number.
      let remaining = 0;
      for (const p of starters) {
        const player = lookup(ctx.players, p.playerId);
        const { points, state } = gatedScore(player, p.score, kickoffs, ctx);
        const projection = projections.get(p.playerId) ?? 0;
        live += points;
        if (state === 'pending') {
          yetToPlay++;
          remaining += projection;
        } else if (state === 'in_play') {
          const kickoff = kickoffs.get(player.team);
          const elapsed = kickoff === undefined ? 1 : Math.min(1, Math.max(0, (ctx.now - kickoff) / GAME_DURATION_MS));
          remaining += projection * (1 - elapsed);
        }
      }
      // Once a week is done MFL's own total is authoritative.
      const total = phase === 'final' ? result.score : Number(live.toFixed(2));
      const projected = sumPoints(
        starters.map((p) => ({ id: p.playerId, position: '', points: projections.get(p.playerId) ?? 0 })),
      );
      return buildSide(
        franchiseId, ctx, standings, phase, total, projected || total, yetToPlay,
        Number((total + remaining).toFixed(2)),
      );
    }

    // Upcoming week: no lineup has been submitted, so project the best legal one.
    const pool = (rosters.get(franchiseId) ?? [])
      .filter((s) => s.status === 'ROSTER')
      .map((s) => ({
        id: s.playerId,
        position: lookup(ctx.players, s.playerId).position,
        points: projections.get(s.playerId) ?? 0,
      }));
    const lineup = bestLineup(pool, ctx.league.lineup);
    return buildSide(franchiseId, ctx, standings, 'pre', 0, sumPoints(lineup), lineup.length);
  };

  const pollWindow = liveWindow(ctx, target, phase);

  const matchups: MatchupView[] = pairs.map((pair) => {
    const home = build(pair.franchiseIds[0]);
    const away = build(pair.franchiseIds[1]);
    if (pollWindow) {
      home.view.projections = projectionMap(pair.franchiseIds[0], rosters, projections);
      away.view.projections = projectionMap(pair.franchiseIds[1], rosters, projections);
    }
    const isMine = pair.franchiseIds.includes(FRANCHISE_ID);
    const decided = phase === 'final' || (phase === 'live' && home.yetToPlay === 0 && away.yetToPlay === 0);

    if (decided) {
      home.view.win = home.live >= away.live ? 'W' : 'L';
      away.view.win = away.live > home.live ? 'W' : 'L';
    } else {
      const [h, a] = winPct(home.projectedFinal, away.projectedFinal);
      home.view.win = h;
      away.view.win = a;
    }

    // Earliest kickoff among the two rosters, for an upcoming row's tail.
    const kickoff = phase === 'pre' ? Math.min(...[...kickoffs.values()].filter(Boolean)) : 0;

    return {
      index: 0,
      isMine,
      final: decided,
      home: home.view,
      away: away.view,
      bar: phase === 'pre' ? null : decided ? scoreBar(home.live, away.live) : barWidth(home.view.win),
      tail: decided ? 'FINAL' : phase === 'pre' && Number.isFinite(kickoff) ? formatKickoff(kickoff) : null,
    };
  });

  // The user's own matchup leads, matching the design and the detail pager.
  matchups.sort((a, b) => Number(b.isMine) - Number(a.isMine));
  matchups.forEach((m, i) => (m.index = i));

  const mine = matchups[0];
  const myYtp = mine?.isMine
    ? Number((mine.home.franchiseId === FRANCHISE_ID ? mine.home : mine.away).meta.split('·')[1]?.trim().split(' ')[0] ?? 0)
    : 0;

  const kickoffLabel = nflWeek ? formatKickoff(Math.min(...nflWeek.games.map((g) => g.kickoff))) : '';

  return {
    week: target,
    phase,
    leagueName: ctx.league.name,
    clock: formatClock(new Date(ctx.now)),
    head: phase === 'live' ? 'LIVE' : phase === 'final' ? 'FINAL' : `KICKOFF ${kickoffLabel}`,
    playersLeft: phase === 'final' ? '' : `${myYtp} YET TO PLAY`,
    matchups,
    myFranchiseId: FRANCHISE_ID,
    weeks: weekOptions(ctx, await weekNotes(ctx)),
    simulatedAt: ctx.simulatedAt,
    liveWindow: pollWindow,
  };
}

/** The user's own result in each recent week, for the picker's right column. */
async function weekNotes(ctx: Context): Promise<Map<number, string>> {
  const notes = new Map<number, string>();
  const weeks = [ctx.current + 1, ctx.current, ctx.current - 1, ctx.current - 2].filter(
    (n) => n >= ctx.league.startWeek && n <= ctx.league.endWeek,
  );

  for (const n of weeks) {
    const phase = weekPhase(ctx.nfl, n, ctx.now);
    if (phase === 'live') {
      notes.set(n, 'LIVE');
      continue;
    }
    if (phase === 'pre') {
      const w = ctx.nfl.find((x) => x.week === n);
      notes.set(n, w ? formatKickoff(Math.min(...w.games.map((g) => g.kickoff))).replace(' ET', '') : '');
      continue;
    }
    const results = await getWeeklyResults(n);
    const matchup = results?.find((m) => m.some((s) => s.franchiseId === FRANCHISE_ID));
    if (!matchup) {
      notes.set(n, '');
      continue;
    }
    const me = matchup.find((s) => s.franchiseId === FRANCHISE_ID)!;
    const them = matchup.find((s) => s.franchiseId !== FRANCHISE_ID)!;
    const outcome = me.score > them.score ? 'W' : me.score < them.score ? 'L' : 'T';
    notes.set(n, `${outcome} ${fmtScore(me.score)}–${fmtScore(them.score)}`);
  }
  return notes;
}

/* ── Matchup detail ─────────────────────────────────────────────────────── */

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

function positionRank(pos: string): number {
  const i = POSITION_ORDER.indexOf(pos);
  return i === -1 ? POSITION_ORDER.length : i;
}

interface BoxEntry {
  id: string;
  team: string;
  kickoff: string;
  name: string;
  position: string;
  line: string;
  pts: string;
  ptsExact?: number;
  proj: string;
  sort: number;
  sleeperId?: string;
  byline?: string;
  breakdown?: Breakdown;
}

const EMPTY_ENTRY = { name: '', line: '', pts: '', proj: '' };

function boxPlayer(e: BoxEntry): BoxPlayerView {
  return {
    name: e.name, line: e.line, pts: e.pts, ptsExact: e.ptsExact, proj: e.proj,
    byline: e.byline, breakdown: e.breakdown,
    live: { id: e.id, team: e.team, kickoff: e.kickoff, position: e.position, sleeperId: e.sleeperId },
  };
}

/** Pair the two sides' players into the design's home | POS | away rows. */
function pairRows(home: BoxEntry[], away: BoxEntry[], benchLabel: boolean): BoxRowView[] {
  const rows: BoxRowView[] = [];
  for (let i = 0; i < Math.max(home.length, away.length); i++) {
    const h = home[i];
    const a = away[i];
    const pos = benchLabel ? 'BN' : h && a ? (h.position === a.position ? h.position : `${h.position}/${a.position}`) : (h?.position ?? a?.position ?? '');
    rows.push({
      pos,
      home: h ? boxPlayer(h) : { ...EMPTY_ENTRY },
      away: a ? boxPlayer(a) : { ...EMPTY_ENTRY },
    });
  }
  return rows;
}

export async function getMatchupDetailView(
  week: number,
  index: number,
  nowOverride?: string | null,
): Promise<MatchupDetailView | null> {
  const ctx = await loadContext(nowOverride);
  const phase = weekPhase(ctx.nfl, week, ctx.now);

  const [schedule, standings, rosters] = await Promise.all([
    getLeagueSchedule(),
    standingsAsOfNow(ctx),
    getRosters(SEASON, week),
  ]);

  const pairs = schedule.get(week) ?? [];
  if (pairs.length === 0) return null;

  // Same ordering as the list screen: the user's matchup is index 0.
  const ordered = pairs.slice().sort((a, b) =>
    Number(b.franchiseIds.includes(FRANCHISE_ID)) - Number(a.franchiseIds.includes(FRANCHISE_ID)),
  );
  const mi = Math.min(Math.max(Number.isFinite(index) ? index : 0, 0), ordered.length - 1);
  const pair = ordered[mi];

  const results = phase === 'pre' ? null : await getWeeklyResults(week);
  const nflWeek = ctx.nfl.find((w) => w.week === week);
  const kickoffs = teamKickoffs(nflWeek);

  const allPlayerIds = [...rosters.values()].flat().map((s) => s.playerId);
  const projections = await getProjections(week, allPlayerIds);

  const byFranchise = new Map<string, ResultSide>();
  for (const m of results ?? []) for (const side of m) byFranchise.set(side.franchiseId, side);

  const pollWindow = liveWindow(ctx, week, phase);
  // Played weeks score their box-score players; a week that can still go live
  // ships ids and rules alone, for the browser to score live stats with.
  const scoringIds = pair.franchiseIds.flatMap((f) =>
    results
      ? (byFranchise.get(f)?.players ?? []).map((p) => p.playerId)
      : (rosters.get(f) ?? []).map((s) => s.playerId),
  );
  const scoring = results || pollWindow
    ? await loadScoring(week, scoringIds, !!results, phase === 'final' && !ctx.simulatedAt)
    : null;

  const sideEntries = (franchiseId: string) => {
    const result = byFranchise.get(franchiseId);
    const projOf = (id: string) => `proj ${fmtScore(projections.get(id) ?? 0)}`;

    if (phase !== 'pre' && result) {
      const toEntry = (playerId: string, score: number): BoxEntry => {
        const player = lookup(ctx.players, playerId);
        const kickoff = kickoffs.get(player.team);
        const { points, state } = gatedScore(player, score, kickoffs, ctx);
        const line =
          state === 'done'
            ? `${player.team} · FINAL`
            : state === 'in_play'
              ? `${player.team} · in play`
              : `${player.team} · ${kickoff ? formatKickoff(kickoff) : 'TBD'} · yet to play`;
        return {
          id: playerId,
          team: player.team,
          kickoff: kickoff ? formatKickoff(kickoff) : 'TBD',
          name: player.name,
          position: player.position,
          line,
          pts: fmtScore(points),
          ptsExact: points,
          proj: projOf(playerId),
          sort: positionRank(player.position) * 1000 - points,
          ...scoringDetail(scoring, playerId, player.position, points, state, ctx),
        };
      };
      const starters = result.players.filter((p) => p.started).map((p) => toEntry(p.playerId, p.score));
      const bench = result.players.filter((p) => !p.started).map((p) => toEntry(p.playerId, p.score));
      starters.sort((a, b) => a.sort - b.sort);
      bench.sort((a, b) => a.sort - b.sort);
      return { starters, bench };
    }

    // Upcoming: project a lineup; nobody has points yet.
    const slots = (rosters.get(franchiseId) ?? []).filter((s) => s.status === 'ROSTER');
    const pool = slots.map((s) => ({
      id: s.playerId,
      position: lookup(ctx.players, s.playerId).position,
      points: projections.get(s.playerId) ?? 0,
    }));
    const starting = new Set(bestLineup(pool, ctx.league.lineup).map((p) => p.id));
    const toEntry = (playerId: string): BoxEntry => {
      const player = lookup(ctx.players, playerId);
      const kickoff = kickoffs.get(player.team);
      return {
        id: playerId,
        team: player.team,
        kickoff: kickoff ? formatKickoff(kickoff) : 'TBD',
        name: player.name,
        position: player.position,
        line: `${player.team} · ${kickoff ? formatKickoff(kickoff) : 'TBD'}`,
        sleeperId: scoring?.ids[playerId],
        pts: '—',
        proj: projOf(playerId),
        sort: positionRank(player.position) * 1000 - (projections.get(playerId) ?? 0),
      };
    };
    const starters = slots.filter((s) => starting.has(s.playerId)).map((s) => toEntry(s.playerId));
    const bench = slots.filter((s) => !starting.has(s.playerId)).map((s) => toEntry(s.playerId));
    starters.sort((a, b) => a.sort - b.sort);
    bench.sort((a, b) => a.sort - b.sort);
    return { starters, bench };
  };

  const homeId = pair.franchiseIds[0];
  const awayId = pair.franchiseIds[1];
  const homeEntries = sideEntries(homeId);
  const awayEntries = sideEntries(awayId);

  const totals = (franchiseId: string, entries: { starters: BoxEntry[] }) => {
    const result = byFranchise.get(franchiseId);
    const starters = entries.starters;
    const live = starters.reduce((t, e) => t + (e.pts === '—' ? 0 : Number(e.pts)), 0);
    const projected = starters.reduce((t, e) => t + Number(e.proj.replace('proj ', '')), 0);
    const yetToPlay = starters.filter((e) => e.line.includes('yet to play') || e.pts === '—').length;
    return {
      live: phase === 'final' && result ? result.score : Number(live.toFixed(2)),
      projected: Number(projected.toFixed(2)),
      yetToPlay,
    };
  };

  const h = totals(homeId, homeEntries);
  const a = totals(awayId, awayEntries);
  const decided = phase === 'final' || (phase === 'live' && h.yetToPlay === 0 && a.yetToPlay === 0);

  const home = buildSide(homeId, ctx, standings, phase, h.live, h.projected, h.yetToPlay);
  const away = buildSide(awayId, ctx, standings, phase, a.live, a.projected, a.yetToPlay);

  if (decided) {
    home.view.win = h.live >= a.live ? 'W' : 'L';
    away.view.win = a.live > h.live ? 'W' : 'L';
  } else {
    const [hw, aw] = winPct(h.projected, a.projected);
    home.view.win = hw;
    away.view.win = aw;
  }

  const kickoffLabel = nflWeek ? formatKickoff(Math.min(...nflWeek.games.map((g) => g.kickoff))) : '';
  if (pollWindow) {
    home.view.projections = projectionMap(homeId, rosters, projections);
    away.view.projections = projectionMap(awayId, rosters, projections);
  }

  return {
    week,
    phase,
    clock: formatClock(new Date(ctx.now)),
    tag: decided ? 'FINAL' : phase === 'pre' ? `KICKOFF ${kickoffLabel}` : 'LIVE',
    liveDot: phase === 'live' && !decided,
    index: mi,
    total: ordered.length,
    isMine: pair.franchiseIds.includes(FRANCHISE_ID),
    home: home.view,
    away: away.view,
    bar: decided ? scoreBar(h.live, a.live) : phase === 'pre' ? winPct(h.projected, a.projected)[0] : barWidth(home.view.win),
    starters: pairRows(homeEntries.starters, awayEntries.starters, false),
    bench: pairRows(homeEntries.bench, awayEntries.bench, true),
    simulatedAt: ctx.simulatedAt,
    liveWindow: pollWindow,
    scoring: pollWindow && scoring ? { rules: scoring.rules, statsUrl: sleeperStatsUrl(week) } : undefined,
  };
}

interface Scoring {
  rules: RuleSet;
  /** MFL player id → Sleeper id. */
  ids: Record<string, string>;
  /** Sleeper id → that week's stats. */
  stats: Record<string, Stats>;
}

/**
 * Rules, id map and stats for the players in one matchup. Box-score detail is
 * an extra: if Sleeper is unreachable the matchup still renders, without it.
 */
async function loadScoring(
  week: number,
  playerIds: string[],
  withStats: boolean,
  settled: boolean,
): Promise<Scoring | null> {
  try {
    const [rules, allIds] = await Promise.all([getScoringRules(), getSleeperIds()]);
    const ids: Record<string, string> = {};
    for (const id of playerIds) if (allIds[id]) ids[id] = allIds[id];
    const stats = withStats ? await getWeekStats(week, Object.values(ids), settled) : {};
    return { rules, ids, stats };
  } catch (e) {
    console.warn(`Box-score stats unavailable for week ${week}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Byline and breakdown for one player. Nothing before kickoff; and on a
 * simulated clock nothing mid-game either, since the stats on hand are the
 * final ones and would run ahead of the pro-rated score.
 */
function scoringDetail(
  scoring: Scoring | null,
  playerId: string,
  position: string,
  points: number,
  state: 'done' | 'in_play' | 'pending',
  ctx: Context,
): Pick<BoxEntry, 'sleeperId' | 'byline' | 'breakdown'> {
  const sleeperId = scoring?.ids[playerId];
  if (!scoring || !sleeperId) return {};
  if (state === 'pending' || (state === 'in_play' && ctx.simulatedAt)) return { sleeperId };
  const stats = scoring.stats[sleeperId] ?? {};
  return {
    sleeperId,
    byline: statLine(position, stats),
    breakdown: scoreBreakdown(position, stats, scoring.rules, points),
  };
}

/* ── Rosters ────────────────────────────────────────────────────────────── */

export async function getRosterView(franchiseId?: string, nowOverride?: string | null): Promise<RosterView> {
  const ctx = await loadContext(nowOverride);
  const target = franchiseId && ctx.league.franchises.some((f) => f.id === franchiseId) ? franchiseId : FRANCHISE_ID;

  const [rosters, adjustments] = await Promise.all([getRosters(SEASON, ctx.current), getSalaryAdjustments()]);
  const slots = rosters.get(target) ?? [];
  const ids = slots.map((s) => s.playerId);

  const [projections, seasonPoints] = await Promise.all([
    getProjections(ctx.current, ids),
    getSeasonPoints(ids),
  ]);

  const toView = (slot: (typeof slots)[number]): RosterPlayerView => {
    const player = lookup(ctx.players, slot.playerId);
    const pts = seasonPoints.get(slot.playerId);
    return {
      playerId: slot.playerId,
      name: player.name,
      teamPos: `${player.team} · ${player.position}`,
      salaryFmt: fmtMoney(slot.salary),
      yearsLabel: `${slot.contractYear}yr`,
      proj: fmtScore(projections.get(slot.playerId) ?? 0),
      pts: pts === null || pts === undefined ? '—' : fmtScore(pts),
    };
  };

  // Injured reserve still counts toward the roster and the cap, so those
  // players sit in their position group; only the taxi squad is separated.
  const active = slots.filter((s) => s.status !== 'TAXI_SQUAD');
  const groups = POSITION_ORDER.map((pos) => ({
    label: pos,
    players: active
      .filter((s) => lookup(ctx.players, s.playerId).position === pos)
      .sort((a, b) => lookup(ctx.players, a.playerId).name.localeCompare(lookup(ctx.players, b.playerId).name))
      .map(toView),
  })).filter((g) => g.players.length > 0);

  const taxi = slots.filter((s) => s.status === 'TAXI_SQUAD').map(toView);

  const adj = adjustments.get(target) ?? 0;
  const salaryTotal = active.reduce((t, s) => t + s.salary, 0) + adj;

  const franchise = ctx.league.franchises.find((f) => f.id === target);

  return {
    franchises: ctx.league.franchises.map((f) => ({ id: f.id, name: f.name, isMine: f.isMine })),
    franchiseId: target,
    name: franchise?.name ?? target,
    isMine: target === FRANCHISE_ID,
    groups,
    taxi,
    footer: {
      count: active.length,
      adj: `${adj >= 0 ? '+' : ''}${fmtMoney(adj)}`,
      total: fmtMoney(salaryTotal),
      cap: fmtMoney(ctx.league.salaryCap),
    },
    simulatedAt: ctx.simulatedAt,
  };
}

/* ── Standings ──────────────────────────────────────────────────────────── */

export async function getStandingsView(nowOverride?: string | null): Promise<StandingsView> {
  const ctx = await loadContext(nowOverride);
  const standings = await standingsAsOfNow(ctx);

  const groups = ctx.league.groups.map((group) => {
    const rows = sortDivision(
      group.franchiseIds
        .map((id) => standings.get(id))
        .filter((r): r is StandingsRow => Boolean(r)),
    );
    const leader = rows[0];
    return {
      label: group.label,
      teams: rows.map((row, i) => ({
        franchiseId: row.franchiseId,
        rank: i + 1,
        name: ctx.league.franchises.find((f) => f.id === row.franchiseId)?.name ?? row.franchiseId,
        record: row.record,
        pf: fmtScore(row.pf),
        pa: fmtScore(row.pa),
        div: row.divRecord,
        conf: row.confRecord,
        pp: fmtScore(row.pp),
        pct: row.pct,
        gb: leader ? gamesBack(row, leader) : '—',
        streak: row.streak,
        avgPf: fmtScore(row.avgPf),
        avgPa: fmtScore(row.avgPa),
      })),
    };
  });

  return { groups, simulatedAt: ctx.simulatedAt };
}

/* ── Home Screen widget ─────────────────────────────────────────────────── */

/**
 * What the live relay needs to build the Home Screen widget (worker/,
 * widget/): who plays whom each week, and for every rostered player the name,
 * NFL team and projection it uses to tie ESPN's plays to a franchise and to
 * project the score. Published as /widget.json at build time.
 */
export interface WidgetContext {
  season: string;
  week: number;
  myFranchiseId: string;
  simulated: boolean;
  builtAt: number;
  franchises: Record<string, { name: string; icon?: string }>;
  /** Week number → [home, away] franchise id pairs. */
  matchups: Record<string, Array<[string, string]>>;
  /** MFL player id → name ("J. Taylor"), MFL NFL team code, position, franchise, this week's projection. */
  players: Record<string, { n: string; t: string; p: string; f: string; proj: number }>;
  /**
   * Before kickoff no lineups are set, so the site projects each franchise's
   * best lineup; these are those totals (week → franchise → points), for the
   * current and next week, so the widget agrees with the site.
   */
  preProjected: Record<string, Record<string, number>>;
}

export async function getWidgetContext(): Promise<WidgetContext> {
  const ctx = await loadContext();
  const week = ctx.current;
  const [schedule, rosters] = await Promise.all([getLeagueSchedule(), getRosters(SEASON, week)]);
  // Same id list as the week view, so the projections come out of its cache.
  const allPlayerIds = [...rosters.values()].flat().map((s) => s.playerId);
  const projections = await getProjections(week, allPlayerIds);
  const preProjected: WidgetContext['preProjected'] = {};
  for (const w of [week, week + 1]) {
    if (w > ctx.league.endWeek) continue;
    const wv = await getWeekView(w);
    if (wv.phase !== 'pre') continue;
    preProjected[String(w)] = Object.fromEntries(
      wv.matchups.flatMap((m) => [m.home, m.away]).map((s) => [s.franchiseId, s.scoreValue]),
    );
  }

  const players: WidgetContext['players'] = {};
  for (const [franchiseId, slots] of rosters) {
    for (const s of slots) {
      const p = lookup(ctx.players, s.playerId);
      players[s.playerId] = {
        n: p.name,
        t: p.team,
        p: p.position,
        f: franchiseId,
        proj: Number((projections.get(s.playerId) ?? 0).toFixed(2)),
      };
    }
  }

  return {
    season: SEASON,
    week,
    myFranchiseId: FRANCHISE_ID,
    simulated: Boolean(ctx.simulatedAt),
    builtAt: Date.now(),
    franchises: Object.fromEntries(ctx.league.franchises.map((f) => [f.id, { name: f.name, icon: f.icon }])),
    matchups: Object.fromEntries([...schedule].map(([w, pairs]) => [String(w), pairs.map((p) => p.franchiseIds)])),
    players,
    preProjected,
  };
}
