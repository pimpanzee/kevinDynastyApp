import { APIKEY, GENERIC_HOST, LEAGUE_ID, SEASON } from '@/lib/config';
import { TTL, cached } from './cache';

/**
 * The single place that knows how to talk to MyFantasyLeague: which host a
 * league lives on, that every request wants JSON, how auth is attached, and
 * how failures surface (MFL_API_CONTEXT.md §§3–6).
 *
 * Server-side only. MFL blocks cross-domain browser access, so nothing here
 * may run in the client bundle.
 */

/**
 * MFL asks developers to minimise traffic and to back off rather than retry
 * immediately (MFL_API_CONTEXT.md §5). Requests are therefore serialised with
 * a minimum gap between them, so a cold page load cannot burst a dozen calls
 * at the API at once.
 */
const MIN_REQUEST_GAP_MS = Number(process.env.MFL_REQUEST_GAP_MS ?? 900);
let requestChain: Promise<unknown> = Promise.resolve();

/** Identify the app to MFL, as a well-behaved API consumer should. */
const USER_AGENT = 'gridlock/1.0 (+personal league hub)';

/** Progressive backoff when the sliding limit rejects a request. */
const RETRY_DELAYS_MS = [2000, 5000, 12000];

function throttle<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const result = await task();
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS));
    return result;
  });
  // Keep the chain alive even when a task rejects.
  requestChain = run.catch(() => undefined);
  return run;
}

export class MflError extends Error {
  constructor(
    message: string,
    readonly type: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MflError';
  }
}

/** True when MFL is telling us the data does not exist yet, not that we erred. */
export function isNotYetAvailable(e: unknown): boolean {
  return e instanceof MflError && /not available|has not|no data/i.test(e.message);
}

/**
 * One HTTP call, throttled and backed off. Everything that talks to MFL goes
 * through here — including host discovery, which shares the same per-IP budget
 * and is served by the more tightly limited generic host.
 */
async function request(url: string): Promise<Response> {
  const send = () =>
    // No `cache` option: Next's data cache stays out of it (lib/mfl/cache.ts
    // owns caching), and an uncached fetch still lets pages export statically.
    fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

  // MFL applies a sliding per-IP limit and rejects intermittently once it is
  // approached. Back off progressively rather than giving up on the first
  // rejection — but never retry tightly, which is what §5 warns against. A 503
  // gets the same treatment: MFL returns it intermittently under load.
  let res = await throttle(send);
  for (let attempt = 0; (res.status === 429 || res.status === 503) && attempt < RETRY_DELAYS_MS.length; attempt++) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt];
    await new Promise((r) => setTimeout(r, waitMs));
    res = await throttle(send);
  }
  return res;
}

/**
 * Resolve the host a league actually lives on and cache it (§3). League reads
 * sent to the generic host are redirected; we follow that once and then talk
 * to the assigned server directly. Set MFL_HOST to skip discovery altogether.
 */
async function resolveHost(season: string): Promise<string> {
  if (process.env.MFL_HOST) return process.env.MFL_HOST.replace(/\/$/, '');
  return cached(`host:${season}:${LEAGUE_ID}`, TTL.LEAGUE, async () => {
    const url = `${GENERIC_HOST}/${season}/export?TYPE=league&L=${LEAGUE_ID}&JSON=1`;
    const res = await request(url);
    if (!res.ok) throw new MflError(`Host discovery failed (${res.status})`, 'league', res.status);
    const body = (await res.json()) as { league?: { baseURL?: string } };
    const base = body.league?.baseURL;
    // Fall back to the generic host rather than failing outright — it still
    // resolves league reads, just without the per-league load balancing.
    return base && /^https?:\/\//.test(base) ? base.replace(/\/$/, '') : GENERIC_HOST;
  });
}

interface GetOptions {
  /** Extra query parameters. */
  params?: Record<string, string | number | undefined>;
  /** Cache lifetime in ms. */
  ttl?: number;
  /** League-specific requests go to the resolved host and carry L=. */
  league?: boolean;
  /** Season override, for reading a different year. */
  season?: string;
  /** Distinguishes cache entries when params alone are ambiguous. */
  cacheKey?: string;
}

/**
 * Perform one export read. Returns the parsed body with MFL's own envelope
 * (`encoding`, `version`) stripped of nothing — callers unwrap their own key.
 */
export async function mflGet<T>(type: string, options: GetOptions = {}): Promise<T> {
  const { params = {}, ttl = TTL.LIVE, league = true, season = SEASON } = options;

  const query = new URLSearchParams({ TYPE: type, JSON: '1' });
  if (league) query.set('L', LEAGUE_ID);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') query.set(k, String(v));
  }
  // Auth is optional for public data but attached whenever a key is configured.
  if (APIKEY) query.set('APIKEY', APIKEY);

  const key = options.cacheKey ?? `${season}:${type}:${query.toString()}`;

  return cached(key, ttl, async () => {
    const host = league ? await resolveHost(season) : GENERIC_HOST;
    const url = `${host}/${season}/export?${query.toString()}`;

    const res = await request(url);
    if (res.status === 429) throw new MflError('Rate limited by MFL; back off before retrying', type, 429);
    if (!res.ok) throw new MflError(`MFL ${type} failed (${res.status})`, type, res.status);

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new MflError(`MFL ${type} returned a non-JSON body`, type, res.status);
    }

    // Errors come back as a 200 with an { error: { $t } } payload.
    const err = (body as { error?: { $t?: string } | string }).error;
    if (err) {
      const message = typeof err === 'string' ? err : (err.$t ?? 'Unknown MFL error');
      throw new MflError(message, type, res.status);
    }

    return body as T;
  });
}

/** Values arrive as strings, and singular results are not wrapped in arrays. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function num(value: string | number | undefined | null, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
}
