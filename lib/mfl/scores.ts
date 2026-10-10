import { SEASON } from '@/lib/config';
import { scorePoints, type Stats } from '@/lib/scoring';
import { getScoringRules, getSleeperIds, getSleeperTable } from '@/lib/stats/sleeper';
import { TTL } from './cache';
import { getPlayers } from './players';
import { asArray, isNotYetAvailable, mflGet, num } from './client';

/**
 * Per-player projections and season scoring. Projections are what a week that
 * has not been played can show; season points are what the roster screen shows
 * per player.
 */

interface RawPlayerScores {
  playerScores?: { playerScore?: RawScore | RawScore[] };
}
interface RawScore { id?: string; score?: string; isAvailable?: string }

/**
 * Projected points for the given players (MFL ids) in one week: Sleeper's
 * projected stats scored with this league's rules — the same projections the
 * Players tab shows. MFL's own were less accurate for this league. A player
 * Sleeper doesn't project (or projects not to play) gets none.
 */
export async function getProjections(week: number, playerIds: string[], season: string = SEASON): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const [table, sleeperIds, rules, players] = await Promise.all([
    // Projections are a nice-to-have; a missing week should not blank a screen.
    getSleeperTable('projections', week, false, season).catch(() => ({}) as Record<string, Stats>),
    getSleeperIds(season),
    getScoringRules(season),
    getPlayers(season),
  ]);
  for (const id of playerIds) {
    const s = table[sleeperIds[id]];
    const position = players.get(id)?.position;
    if (!s || !position || (s.gp ?? 1) <= 0) continue;
    out.set(id, scorePoints(position, s, rules));
  }
  return out;
}

/** Season-to-date fantasy points per player, in this league's scoring. */
export async function getSeasonPoints(playerIds: string[], season: string = SEASON): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const CHUNK = 100;

  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    try {
      const body = await mflGet<RawPlayerScores>('playerScores', {
        params: { W: 'YTD', PLAYERS: chunk.join(','), COUNT: chunk.length },
        ttl: TTL.STANDINGS,
        season,
        cacheKey: `ytd:${season}:${chunk[0]}:${chunk.length}`,
      });
      for (const s of asArray(body.playerScores?.playerScore)) {
        if (!s.id) continue;
        // isAvailable=0 means the player has not scored yet this season.
        out.set(s.id, s.isAvailable === '0' || s.score === '' ? null : num(s.score));
      }
    } catch (e) {
      if (!isNotYetAvailable(e)) throw e;
    }
  }
  return out;
}
