import { SEASON } from '@/lib/config';
import { getByeWeeks } from '@/lib/mfl/byes';
import { resolveNow } from '@/lib/mfl/clock';
import { getInjuries } from '@/lib/mfl/injuries';
import { getLeague } from '@/lib/mfl/league';
import { getPlayerDetails, getPlayers } from '@/lib/mfl/players';
import { getRosters, type RosterSlot } from '@/lib/mfl/rosters';
import { getNflSchedule, lastCompletedWeek } from '@/lib/mfl/schedule';
import { mflScores } from '@/lib/players';
import { scorePoints, type Stats } from '@/lib/scoring';
import { getSeasonTotals } from '@/lib/seasonTotals';
import { getMarketPricer } from '@/lib/team';
import { getScoringRules, getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';
import type { PlayerCardData, PlayerCardWeek } from '@/lib/types';

/**
 * One player's card: bio, contract if rostered, and a week-by-week game log.
 * A file per player is written at build time; the league-wide tables behind
 * them load once and are shared.
 *
 * Fantasy points and ranks are MFL's (this league's scoring); stat lines are
 * Sleeper's — MFL's API has points but not the stats behind them.
 */

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/** Stats the game log can show, as Sleeper keys. */
const LOG_KEYS = [
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_int',
  'rush_att', 'rush_yd', 'rush_td',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td',
  'kr', 'kr_yd', 'pr', 'pr_yd', 'st_td', 'pass_sack', 'pass_sack_yds', 'fum_lost',
];

function keep(s: Stats | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!s) return out;
  for (const k of LOG_KEYS) if (s[k]) out[k] = s[k];
  return out;
}

/** Rank each player within his position by points (1 = most). */
function positionRanks(points: Map<string, number>, positionOf: (id: string) => string | undefined): Map<string, number> {
  const byPos = new Map<string, Array<[string, number]>>();
  for (const [id, pts] of points) {
    const pos = positionOf(id);
    if (!pos || !POSITIONS.has(pos)) continue;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos)!.push([id, pts]);
  }
  const out = new Map<string, number>();
  for (const list of byPos.values()) list.sort((a, b) => b[1] - a[1]).forEach(([id], i) => out.set(id, i + 1));
  return out;
}

async function loadContext() {
  const now = resolveNow().getTime();
  const [league, players, details, rosters, injuries, byes, nfl, sleeperIds] = await Promise.all([
    getLeague(), getPlayers(), getPlayerDetails(), getRosters(), getInjuries(), getByeWeeks(), getNflSchedule(), getSleeperIds(),
  ]);
  const done = lastCompletedWeek(nfl, now);
  const positionOf = (id: string) => players.get(id)?.position;

  // Every week that has kicked off; a week in progress shows the games played so far.
  const started = nfl.filter((w) => w.games.some((g) => g.kickoff <= now)).map((w) => w.week);
  const rules = await getScoringRules();
  const weeks = new Map<number, { stats: Record<string, Stats>; points: Map<string, number>; ranks: Map<string, number>; proj: Record<string, Stats> }>();
  for (const week of started) {
    const settled = week <= done;
    const [stats, points, proj] = await Promise.all([
      getSleeperTable('stats', week, settled), mflScores(week, settled),
      getSleeperTable('projections', week, settled).catch(() => ({}) as Record<string, Stats>),
    ]);
    weeks.set(week, { stats, points, ranks: positionRanks(points, positionOf), proj });
  }
  // Season to date from the finished weeks, so a simulated clock never sees the future.
  const [{ totals }, priceFor] = await Promise.all([getSeasonTotals(), getMarketPricer()]);
  const ytd = new Map([...totals].map(([id, t]) => [id, t.pts]));
  const ovr = new Map([...ytd].filter(([id]) => POSITIONS.has(positionOf(id) ?? '')).sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));

  const held = new Map<string, { franchiseId: string; slot: RosterSlot }>();
  for (const [franchiseId, list] of rosters) for (const slot of list) held.set(slot.playerId, { franchiseId, slot });

  return { now, league, players, details, injuries, byes, nfl, sleeperIds, weeks, ytd, totals, ovr, rules, priceFor, ytdRanks: positionRanks(ytd, positionOf), held };
}

let context: ReturnType<typeof loadContext> | null = null;
const getContext = () => (context ??= loadContext());

const STATUS = { ROSTER: 'Active', TAXI_SQUAD: 'Taxi', INJURED_RESERVE: 'IR' } as const;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export async function getPlayerCard(id: string): Promise<PlayerCardData | null> {
  const ctx = await getContext();
  const p = ctx.players.get(id);
  if (!p || !POSITIONS.has(p.position)) return null;

  const sid = ctx.sleeperIds[id];
  const d = ctx.details.get(id);
  const held = ctx.held.get(id);
  const franchise = held && ctx.league.franchises.find((f) => f.id === held.franchiseId);

  const log: PlayerCardWeek[] = ctx.nfl.map((w) => {
    const game = w.games.find((g) => g.teams.includes(p.team));
    const opp = game ? (game.teams[0] === p.team ? game.teams[1] : game.teams[0]) : null;
    const played = ctx.weeks.get(w.week);
    const stats = played && sid ? played.stats[sid] : undefined;
    const fpts = played?.points.get(id);
    const didPlay = !!played && ((stats?.gp ?? 0) > 0 || (fpts ?? 0) !== 0);
    const projStats = played && sid ? played.proj[sid] : undefined;
    return {
      week: w.week,
      opp: game && opp ? (game.home && game.home !== p.team ? `@ ${opp}` : opp) : null,
      future: !played,
      proj: projStats && (projStats.gp ?? 1) > 0 ? Math.round(scorePoints(p.position, projStats, ctx.rules) * 10) / 10 : null,
      game: didPlay
        ? {
            fpts: fpts ?? 0,
            rank: played.ranks.get(id) ?? null,
            snp: stats?.off_snp && stats.tm_off_snp ? Math.round((stats.off_snp / stats.tm_off_snp) * 100) : null,
            stats: keep(stats),
          }
        : null,
    };
  });

  return {
    id,
    name: p.fullName,
    pos: p.position as PlayerCardData['pos'],
    nflTeam: p.team,
    jersey: d?.jersey,
    espnId: d?.espnId,
    headshot: sid && /^\d+$/.test(sid) ? `https://sleepercdn.com/content/nfl/players/thumb/${sid}.jpg` : undefined,
    bio: {
      age: d?.birthdate ? Math.floor(((ctx.now - d.birthdate * 1000) / YEAR_MS) * 10) / 10 : undefined,
      height: d?.height,
      weight: d?.weight,
      exp: d?.draftYear ? Math.max(0, Number(SEASON) - d.draftYear) : undefined,
    },
    injury: ctx.injuries.get(id),
    bye: ctx.byes.get(p.team) ?? null,
    owner: franchise ? { id: franchise.id, name: franchise.name } : undefined,
    contract: held
      ? { salary: held.slot.salary, years: held.slot.contractYear, code: held.slot.contractStatus, status: STATUS[held.slot.status] ?? 'Active' }
      : undefined,
    season: {
      gp: log.filter((w) => w.game).length,
      fpts: ctx.ytd.get(id) ?? 0,
      rank: ctx.ytdRanks.get(id) ?? null,
      ovrRank: ctx.ovr.get(id) ?? null,
    },
    market: !held && ctx.totals.get(id)?.gp
      ? ctx.priceFor(p.position, ctx.totals.get(id)!.pts / ctx.totals.get(id)!.gp) ?? undefined
      : undefined,
    log,
  };
}

/**
 * Everyone who gets a card: QB/RB/WR/TE on an NFL team, anyone rostered, and
 * anyone who has scored this season (so an old box score never dead-ends).
 */
export async function getPlayerCardIds(): Promise<string[]> {
  const ctx = await getContext();
  const out: string[] = [];
  for (const p of ctx.players.values()) {
    if (!POSITIONS.has(p.position)) continue;
    const onTeam = !!p.team && !p.team.startsWith('FA');
    if (onTeam || ctx.held.has(p.id) || ctx.ytd.has(p.id)) out.push(p.id);
  }
  return out;
}
