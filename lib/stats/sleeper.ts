import { SEASON } from '@/lib/config';
import { TTL, cached } from '@/lib/mfl/cache';
import { asArray, mflGet } from '@/lib/mfl/client';
import { parseRules, trimStats, type RuleSet, type Stats } from '@/lib/scoring';

/**
 * Box-score stats from Sleeper's public API, joined to MFL players.
 *
 * MFL reports fantasy points but not the stats behind them; Sleeper publishes
 * per-player weekly stats with no key. Players are joined on the Sportradar id
 * both databases carry (MFL calls it sportsdata_id), falling back to ESPN's.
 * Team defences are keyed by team abbreviation, which the two spell differently.
 *
 * Server-side, at build time. The browser fetches the same stats URL directly
 * during live games (Sleeper allows cross-origin reads).
 */

const SLEEPER = 'https://api.sleeper.app/v1';

/** MFL team codes Sleeper spells differently. */
const TEAM_CODES: Record<string, string> = {
  GBP: 'GB', JAC: 'JAX', KCC: 'KC', LVR: 'LV', NEP: 'NE', NOS: 'NO', SFO: 'SF', TBB: 'TB',
};

export function sleeperStatsUrl(week: number, season: string = SEASON): string {
  return `${SLEEPER}/stats/nfl/regular/${season}/${week}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper ${url} failed (${res.status})`);
  return (await res.json()) as T;
}

interface RawMflPlayer { id?: string; position?: string; team?: string; sportsdata_id?: string; espn_id?: string }
interface RawSleeperPlayer { sportradar_id?: string | null; espn_id?: number | string | null }

/**
 * MFL player id → Sleeper id, for every MFL player that can be matched. The
 * Sleeper database is ~15MB, so only the reduced table is cached.
 */
export async function getSleeperIds(season: string = SEASON): Promise<Record<string, string>> {
  return cached(`sleeper:ids:${season}`, TTL.PLAYERS, async () => {
    const [mfl, sleeper] = await Promise.all([
      mflGet<{ players?: { player?: RawMflPlayer | RawMflPlayer[] } }>('players', {
        params: { DETAILS: 1 },
        ttl: TTL.PLAYERS,
        season,
        cacheKey: `players-details:${season}`,
      }),
      getJson<Record<string, RawSleeperPlayer>>(`${SLEEPER}/players/nfl`),
    ]);

    const bySportradar = new Map<string, string>();
    const byEspn = new Map<string, string>();
    for (const [id, p] of Object.entries(sleeper)) {
      if (p.sportradar_id) bySportradar.set(p.sportradar_id, id);
      if (p.espn_id) byEspn.set(String(p.espn_id), id);
    }

    const out: Record<string, string> = {};
    for (const p of asArray(mfl.players?.player)) {
      if (!p.id) continue;
      if (p.position === 'Def' && p.team) {
        out[p.id] = TEAM_CODES[p.team] ?? p.team;
        continue;
      }
      const id = (p.sportsdata_id && bySportradar.get(p.sportsdata_id)) || (p.espn_id && byEspn.get(p.espn_id));
      if (id) out[p.id] = id;
    }
    return out;
  });
}

/**
 * One week's stats for the given Sleeper ids, trimmed to the keys scoring
 * uses. A settled week never changes; one still being played is short-lived.
 */
export async function getWeekStats(
  week: number,
  sleeperIds: string[],
  settled: boolean,
  season: string = SEASON,
): Promise<Record<string, Stats>> {
  const all = await cached(
    `sleeper:stats:${season}:${week}`,
    settled ? TTL.FINAL_RESULTS : TTL.LIVE,
    async () => {
      const body = await getJson<Record<string, Stats>>(sleeperStatsUrl(week, season));
      const trimmed: Record<string, Stats> = {};
      for (const [id, s] of Object.entries(body)) {
        const t = trimStats(s);
        if (Object.keys(t).length) trimmed[id] = t;
      }
      return trimmed;
    },
  );
  const out: Record<string, Stats> = {};
  for (const id of sleeperIds) if (all[id]) out[id] = all[id];
  return out;
}

interface RawRules {
  rules?: { positionRules?: Parameters<typeof parseRules>[0] | Parameters<typeof parseRules>[0][number] };
}

/** This league's scoring rules. */
export async function getScoringRules(season: string = SEASON): Promise<RuleSet> {
  const body = await mflGet<RawRules>('rules', { ttl: TTL.LEAGUE, season, cacheKey: `rules:${season}` });
  return parseRules(asArray(body.rules?.positionRules));
}
