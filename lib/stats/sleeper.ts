import { SEASON } from '@/lib/config';
import { TTL, cached } from '@/lib/mfl/cache';
import { asArray, mflGet } from '@/lib/mfl/client';
import { parseRules, trimStats, type RuleSet, type Stats } from '@/lib/scoring';

/**
 * Box-score stats from Sleeper's public API, joined to MFL players.
 *
 * MFL reports fantasy points but not the stats behind them; Sleeper publishes
 * per-player weekly stats and projections with no key. Players are joined with
 * DynastyProcess's id map (mfl_id ↔ sleeper_id), then, for anyone it lacks, on
 * the Sportradar id both databases carry (MFL calls it sportsdata_id) or ESPN's.
 * Team defences are keyed by team abbreviation, which the two spell differently.
 *
 * Server-side, at build time. The browser fetches the same stats URL directly
 * during live games (Sleeper allows cross-origin reads).
 */

const SLEEPER = 'https://api.sleeper.app/v1';
const ID_MAP = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

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
  return cached(`sleeper:ids2:${season}`, TTL.PLAYERS, async () => {
    const [mfl, sleeper, mapped] = await Promise.all([
      mflGet<{ players?: { player?: RawMflPlayer | RawMflPlayer[] } }>('players', {
        params: { DETAILS: 1 },
        ttl: TTL.PLAYERS,
        season,
        cacheKey: `players-details:${season}`,
      }),
      getJson<Record<string, RawSleeperPlayer>>(`${SLEEPER}/players/nfl`),
      getIdMap(),
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
      const id =
        mapped.get(p.id) ||
        (p.sportsdata_id && bySportradar.get(p.sportsdata_id)) ||
        (p.espn_id && byEspn.get(p.espn_id));
      if (id) out[p.id] = id;
    }
    return out;
  });
}

/** DynastyProcess's mfl_id → sleeper_id. Empty if the file can't be read; the other joins still run. */
async function getIdMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const res = await fetch(ID_MAP);
    if (!res.ok) throw new Error(`ID map failed (${res.status})`);
    const [header, ...lines] = (await res.text()).split('\n');
    const cols = csvRow(header);
    const mflAt = cols.indexOf('mfl_id');
    const sleeperAt = cols.indexOf('sleeper_id');
    if (mflAt < 0 || sleeperAt < 0) return out;
    for (const line of lines) {
      const row = csvRow(line);
      const mfl = row[mflAt];
      const sleeper = row[sleeperAt];
      if (mfl && sleeper && sleeper !== 'NA' && mfl !== 'NA') out.set(mfl, sleeper);
    }
  } catch {
    // Fall back to the Sportradar and ESPN joins alone.
  }
  return out;
}

/** One CSV line: comma-separated, fields optionally double-quoted. */
function csvRow(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else if (c !== '\r') field += c;
  }
  out.push(field);
  return out;
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

/** Kept beyond the scoring keys: games played, return counts and snaps, for the player card. */
const TABLE_EXTRA = ['gp', 'kr', 'pr', 'off_snp', 'tm_off_snp'];

/**
 * A whole Sleeper table — one week's stats or projections, or season-to-date
 * stats when `week` is null — keyed by Sleeper id and trimmed to the keys
 * scoring uses plus TABLE_EXTRA.
 */
export async function getSleeperTable(
  kind: 'stats' | 'projections',
  week: number | null,
  settled: boolean,
  season: string = SEASON,
): Promise<Record<string, Stats>> {
  return cached(
    `sleeper2:${kind}:${season}:${week ?? 'season'}`,
    settled ? TTL.FINAL_RESULTS : TTL.LIVE,
    async () => {
      const body = await getJson<Record<string, Stats>>(
        `${SLEEPER}/${kind}/nfl/regular/${season}${week === null ? '' : `/${week}`}`,
      );
      const trimmed: Record<string, Stats> = {};
      for (const [id, s] of Object.entries(body)) {
        const t = trimStats(s);
        for (const k of TABLE_EXTRA) if (s[k] !== undefined) t[k] = s[k];
        if (Object.keys(t).length) trimmed[id] = t;
      }
      return trimmed;
    },
  );
}
