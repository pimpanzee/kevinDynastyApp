import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Two-tier cache: an in-process map, backed by a directory on disk.
 *
 * MFL asks developers to minimise traffic and cache according to how often
 * data actually changes (MFL_API_CONTEXT.md §5), and §10b goes further —
 * static data should be stored locally so a normal run does not hit MFL for it
 * at all. That matters here beyond politeness: a completed week's box score is
 * immutable, and re-fetching seventeen of them on every server restart is what
 * gets an app rate limited.
 *
 * Anything with a long TTL is written to disk; short-lived entries stay in
 * memory only.
 */

interface Entry {
  value: unknown;
  expires: number;
}

const memory = new Map<string, Entry>();

const CACHE_DIR = process.env.MFL_CACHE_DIR ?? join(process.cwd(), '.cache', 'mfl');

/** Entries at or above this lifetime are worth persisting across restarts. */
const PERSIST_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * A static build is a snapshot. `next build` renders pages across several
 * processes that share no memory, so during a build every entry goes to disk
 * and lives at least this long — otherwise each process re-fetches the same
 * rosters and projections, and a five-minute entry can lapse mid-build. The
 * doubled traffic is what got the Pages build rate limited.
 */
export const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const BUILD_MIN_TTL_MS = 20 * 60 * 1000;

export const TTL = {
  /** League settings are effectively static within a season. */
  LEAGUE: 24 * 60 * 60 * 1000,
  /** Player database changes roughly daily. */
  PLAYERS: 24 * 60 * 60 * 1000,
  /** The NFL schedule is fixed once published. */
  SCHEDULE: 24 * 60 * 60 * 1000,
  /** A finished week's box score never changes again. */
  FINAL_RESULTS: 30 * 24 * 60 * 60 * 1000,
  /** Rosters and standings move on transactions and game days. */
  ROSTERS: 5 * 60 * 1000,
  STANDINGS: 5 * 60 * 1000,
  /** Anything in-progress. Short, but still not per-request. */
  LIVE: 60 * 1000,
} as const;

function fileFor(key: string): string {
  return join(CACHE_DIR, `${createHash('sha1').update(key).digest('hex')}.json`);
}

async function readDisk(key: string): Promise<Entry | null> {
  try {
    const raw = await readFile(fileFor(key), 'utf8');
    const entry = JSON.parse(raw) as Entry;
    return entry.expires > Date.now() ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Maps and Sets do not survive JSON, and silently arrive back as `{}`. Cache
 * entries must be plain JSON — callers holding a Map should cache its entries.
 */
function isJsonSafe(value: unknown): boolean {
  return !(value instanceof Map || value instanceof Set);
}

async function writeDisk(key: string, entry: Entry): Promise<void> {
  if (!isJsonSafe(entry.value)) {
    throw new TypeError(
      `Refusing to persist cache key "${key}": Map/Set does not survive JSON. Cache its entries instead.`,
    );
  }
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(entry), 'utf8');
  } catch {
    // A cache that cannot be written is a slowdown, never a failure.
  }
}

export async function cached<T>(key: string, requestedTtl: number, load: () => Promise<T>): Promise<T> {
  const ttl = IS_BUILD ? Math.max(requestedTtl, BUILD_MIN_TTL_MS) : requestedTtl;
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const persist = IS_BUILD || ttl >= PERSIST_THRESHOLD_MS;
  if (persist) {
    const onDisk = await readDisk(key);
    if (onDisk) {
      memory.set(key, onDisk);
      return onDisk.value as T;
    }
  }

  const value = await load();
  const entry: Entry = { value, expires: Date.now() + ttl };
  memory.set(key, entry);
  if (persist) await writeDisk(key, entry);
  return value;
}

/** Drop in-memory entries. Pass a prefix to clear one family, or nothing for all. */
export function invalidate(prefix?: string): void {
  if (!prefix) {
    memory.clear();
    return;
  }
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
}
