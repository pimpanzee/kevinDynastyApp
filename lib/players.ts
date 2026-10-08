import { FRANCHISE_ID, SEASON } from '@/lib/config';
import { formatKickoff } from '@/lib/format';
import { getByeWeeks } from '@/lib/mfl/byes';
import { TTL } from '@/lib/mfl/cache';
import { asArray, mflGet, num } from '@/lib/mfl/client';
import { getInjuries } from '@/lib/mfl/injuries';
import { getLeague } from '@/lib/mfl/league';
import { getPlayers } from '@/lib/mfl/players';
import { getRosters } from '@/lib/mfl/rosters';
import { getNflSchedule, lastCompletedWeek, type NflWeek } from '@/lib/mfl/schedule';
import { resolveNow } from '@/lib/mfl/clock';
import { scorePoints, type Stats } from '@/lib/scoring';
import { getScoringRules, getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';
import type { PlayerGame, PlayerRow, PlayerStatKey, PlayerStats, PlayersData } from '@/lib/types';

/**
 * Everything the Players screen shows, built once per site build.
 *
 * MFL is the source of truth for who is rostered (taxi squad and IR count as
 * rostered) and for actual fantasy points. Sleeper supplies the stat lines
 * MFL doesn't have, and projected stats, which are scored here with this
 * league's rules — Sleeper's own fantasy points are never used.
 */

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const SHOWN: PlayerStatKey[] = ['pass_yd', 'pass_td', 'pass_int', 'rush_att', 'rush_yd', 'rush_td', 'rec_tgt', 'rec', 'rec_yd', 'rec_td'];

/** Keep the shown stats, dropping zeros to keep the file small. */
function shown(s: Stats | undefined, round: boolean): PlayerStats {
  const out: PlayerStats = {};
  if (!s) return out;
  for (const k of SHOWN) {
    const v = s[k];
    if (v) out[k] = round ? Math.round(v * 10) / 10 : v;
  }
  return out;
}

/** MFL fantasy points for every player who scored in `week` (a number, or YTD). */
export async function mflScores(week: number | 'YTD', settled: boolean): Promise<Map<string, number>> {
  const body = await mflGet<{ playerScores?: { playerScore?: Array<{ id?: string; score?: string }> | { id?: string; score?: string } } }>(
    'playerScores',
    { params: { W: week }, ttl: settled ? TTL.FINAL_RESULTS : TTL.STANDINGS, cacheKey: `scores-all:${SEASON}:${week}` },
  );
  const out = new Map<string, number>();
  for (const s of asArray(body.playerScores?.playerScore)) {
    if (s.id && s.score !== undefined && s.score !== '') out.set(s.id, num(s.score));
  }
  return out;
}

/** Each team's game in `week`: opponent ("@ BUF" away) and kickoff. */
function gamesFor(week: NflWeek | undefined): Map<string, PlayerGame> {
  const out = new Map<string, PlayerGame>();
  for (const g of week?.games ?? []) {
    const [a, b] = g.teams;
    const kickoff = formatKickoff(g.kickoff);
    const label = (team: string, opp: string) => (g.home && g.home !== team ? `@ ${opp}` : opp);
    out.set(a, { opp: label(a, b), kickoff });
    out.set(b, { opp: label(b, a), kickoff });
  }
  return out;
}

export async function getPlayersData(): Promise<PlayersData> {
  const now = resolveNow().getTime();
  const [league, players, rosters, injuries, byes, nfl, rules, sleeperIds] = await Promise.all([
    getLeague(), getPlayers(), getRosters(), getInjuries(), getByeWeeks(), getNflSchedule(), getScoringRules(), getSleeperIds(),
  ]);

  const done = lastCompletedWeek(nfl, now);
  const lastWeek = done > 0 ? done : null;
  const finalWeek = nfl[nfl.length - 1]?.week ?? 18;
  const projWeek = Math.min(done + 1, finalWeek);

  const [proj, lastStats, seasonStats, lastPts, ytdPts] = await Promise.all([
    getSleeperTable('projections', projWeek, false).catch(() => ({}) as Record<string, Stats>),
    lastWeek ? getSleeperTable('stats', lastWeek, true) : Promise.resolve({} as Record<string, Stats>),
    getSleeperTable('stats', null, false),
    lastWeek ? mflScores(lastWeek, true) : Promise.resolve(new Map<string, number>()),
    mflScores('YTD', false),
  ]);

  const owner = new Map<string, string>();
  for (const [franchiseId, slots] of rosters) for (const s of slots) owner.set(s.playerId, franchiseId);

  const nextGames = gamesFor(nfl.find((w) => w.week === projWeek));
  const lastGames = gamesFor(nfl.find((w) => w.week === lastWeek));

  const rows: PlayerRow[] = [];
  for (const p of players.values()) {
    if (!POSITIONS.has(p.position)) continue;
    const rostered = owner.get(p.id);
    // NFL free agents can't score; only a rostered one stays listed.
    if (!rostered && (!p.team || p.team.startsWith('FA'))) continue;

    const sid = sleeperIds[p.id];
    const projected = sid ? proj[sid] : undefined;
    const played = sid ? lastStats[sid] : undefined;
    const season = sid ? seasonStats[sid] : undefined;
    const lastScore = lastPts.get(p.id);
    const didPlay = (played?.gp ?? 0) > 0 || (lastScore ?? 0) !== 0;

    rows.push({
      id: p.id,
      name: p.fullName,
      pos: p.position as PlayerRow['pos'],
      nflTeam: p.team,
      bye: byes.get(p.team) ?? null,
      injury: injuries.get(p.id),
      owner: rostered,
      next: nextGames.get(p.team) ?? null,
      last: lastGames.get(p.team) ?? null,
      proj: {
        pts: projected && (projected.gp ?? 1) > 0 ? scorePoints(p.position, projected, rules) : null,
        stats: shown(projected, true),
      },
      lastWeek: lastWeek && didPlay ? { pts: lastScore ?? 0, stats: shown(played, false) } : null,
      season: { gp: season?.gp ?? 0, pts: ytdPts.get(p.id) ?? 0, stats: shown(season, false) },
    });
  }

  return {
    projWeek,
    lastWeek,
    hasProj: rows.some((r) => r.proj.pts !== null),
    franchises: league.franchises.map((f) => ({ id: f.id, abbrev: f.abbrev || f.name.slice(0, 4), name: f.name })),
    myFranchiseId: FRANCHISE_ID,
    players: rows,
    builtAt: new Date().toISOString(),
  };
}
