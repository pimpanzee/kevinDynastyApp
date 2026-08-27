import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, isNotYetAvailable, mflGet, num } from './client';

/**
 * Per-player projections and season scoring. Projections are what a week that
 * has not been played can show; season points are what the roster screen shows
 * per player.
 */

interface RawProjected {
  projectedScores?: { playerScore?: RawScore | RawScore[] };
}
interface RawPlayerScores {
  playerScores?: { playerScore?: RawScore | RawScore[] };
}
interface RawScore { id?: string; score?: string; isAvailable?: string }

/**
 * Projected points for the given players in one week. MFL requires an explicit
 * PLAYERS list, so this is chunked to keep URLs a sane length.
 */
export async function getProjections(week: number, playerIds: string[], season: string = SEASON): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const CHUNK = 100;

  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    try {
      const body = await mflGet<RawProjected>('projectedScores', {
        params: { W: week, PLAYERS: chunk.join(',') },
        ttl: TTL.SCHEDULE,
        season,
        cacheKey: `proj:${season}:${week}:${chunk[0]}:${chunk.length}`,
      });
      for (const s of asArray(body.projectedScores?.playerScore)) {
        if (s.id) out.set(s.id, num(s.score));
      }
    } catch (e) {
      // Projections are a nice-to-have; a missing week should not blank a screen.
      if (!isNotYetAvailable(e)) throw e;
    }
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
