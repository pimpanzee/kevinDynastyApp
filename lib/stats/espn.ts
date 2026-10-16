import { SEASON } from '@/lib/config';
import { TTL, cached } from '@/lib/mfl/cache';

/**
 * ESPN's start % (share of ESPN leagues starting a player this week), from
 * its public fantasy API. No key; the players are asked for by ESPN id, in
 * batches, with stats trimmed to the season split so each reply stays small.
 */

const URL = (season: string) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;
const BATCH = 100;

interface Raw {
  players?: Array<{ id?: number; player?: { ownership?: { percentStarted?: number } } }>;
}

/** ESPN id → start % (0–100, one decimal). Missing ids are left out; a failed batch is skipped. */
export async function getStartPercents(espnIds: string[], season: string = SEASON): Promise<Record<string, number>> {
  const ids = [...new Set(espnIds.filter((id) => /^\d+$/.test(id)))].sort();
  if (!ids.length) return {};
  return cached(`espn:started:${season}:${ids.join(',')}`, TTL.ROSTERS, async () => {
    const out: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += BATCH) {
      const value = ids.slice(i, i + BATCH).map(Number);
      const filter = {
        players: {
          filterIds: { value },
          limit: value.length,
          sortPercOwned: { sortAsc: false, sortPriority: 1 },
          filterStatsForSplitTypeIds: { value: [99] },
        },
      };
      try {
        const res = await fetch(URL(season), { headers: { Accept: 'application/json', 'X-Fantasy-Filter': JSON.stringify(filter) } });
        if (!res.ok) continue;
        const body = (await res.json()) as Raw;
        for (const p of body.players ?? []) {
          const pct = p.player?.ownership?.percentStarted;
          if (p.id && typeof pct === 'number') out[String(p.id)] = Math.round(pct * 10) / 10;
        }
      } catch {
        // ESPN is a nice-to-have: the lineup screen shows a dash without it.
      }
    }
    return out;
  });
}
