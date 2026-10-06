/**
 * Live-score relay for GRIDLOCK.
 *
 * The site is static and MFL refuses cross-origin browser requests, so live
 * scores come through here: GET /live?week=N returns that week's liveScoring,
 * normalised and small. Every request funnels into one Durable Object that
 * keeps the latest copy in memory and refreshes it at most once per
 * CACHE_SECONDS, so MFL's traffic is flat no matter how many people watch.
 *
 * Season and league are fixed by configuration, not the caller, so this
 * cannot be used as a general MFL proxy.
 */

const MAX_WEEK = 22;
/** After MFL rejects a request, leave it alone this long before trying again. */
const BACKOFF_MS = 2 * 60 * 1000;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/live') return json({ error: 'Not found' }, 404, cors);

    const week = Number(url.searchParams.get('week'));
    if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK) return json({ error: 'Bad week' }, 400, cors);

    const stub = env.LIVE.get(env.LIVE.idFromName('live'));
    const res = await stub.fetch(`https://live/${week}`);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

export class LiveScores {
  constructor(state, env) {
    this.env = env;
    /** week → { fetchedAt, payload } */
    this.latest = new Map();
    /** week → in-flight refresh, so simultaneous misses share one MFL call. */
    this.inflight = new Map();
    this.blockedUntil = 0;
  }

  async fetch(request) {
    const week = Number(new URL(request.url).pathname.slice(1));
    const ttl = Number(this.env.CACHE_SECONDS || 90) * 1000;
    const held = this.latest.get(week);
    const age = held ? Date.now() - held.fetchedAt : Infinity;

    if (age < ttl || Date.now() < this.blockedUntil) {
      if (held) return payload(held, age >= ttl, ttl - age);
      return json({ error: 'MFL is rate limiting; try again shortly' }, 503);
    }

    try {
      let pending = this.inflight.get(week);
      if (!pending) {
        pending = this.refresh(week).finally(() => this.inflight.delete(week));
        this.inflight.set(week, pending);
      }
      const fresh = await pending;
      return payload(fresh, false, ttl);
    } catch (e) {
      // Serve the last good copy, marked stale, rather than nothing.
      if (held) return payload(held, true, 30 * 1000);
      return json({ error: e.message }, 502);
    }
  }

  async refresh(week) {
    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const url = `${MFL_HOST}/${MFL_SEASON}/export?TYPE=liveScoring&L=${MFL_LEAGUE_ID}&W=${week}&DETAILS=1&JSON=1`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'gridlock-live/1.0 (+personal league hub)' },
    });
    if (res.status === 429 || res.status === 503) {
      this.blockedUntil = Date.now() + BACKOFF_MS;
      throw new Error(`MFL rate limited (${res.status})`);
    }
    if (!res.ok) throw new Error(`MFL liveScoring failed (${res.status})`);
    const body = await res.json();
    if (body.error) throw new Error(`MFL: ${body.error.$t ?? 'error'}`);

    const entry = { fetchedAt: Date.now(), payload: normalise(week, body.liveScoring) };
    this.latest.set(week, entry);
    return entry;
  }
}

/** MFL wraps single items as objects and everything as strings. */
function asArray(x) {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

/**
 * Compact shape the site reads (lib/live.ts):
 * { week, franchises: { id: { score, ytp, playing, secondsRemaining,
 *   players: { playerId: [score, isStarter, secondsRemaining] } } } }
 */
function normalise(week, live) {
  const franchises = {};
  for (const m of asArray(live?.matchup)) {
    for (const f of asArray(m.franchise)) {
      const players = {};
      for (const p of asArray(f.players?.player)) {
        players[p.id] = [Number(p.score) || 0, p.status === 'starter' ? 1 : 0, Number(p.gameSecondsRemaining) || 0];
      }
      franchises[f.id] = {
        score: Number(f.score) || 0,
        ytp: Number(f.playersYetToPlay) || 0,
        playing: Number(f.playersCurrentlyPlaying) || 0,
        secondsRemaining: Number(f.gameSecondsRemaining) || 0,
        players,
      };
    }
  }
  return { week, franchises };
}

function payload(entry, stale, maxAgeMs) {
  const body = { ...entry.payload, fetchedAt: entry.fetchedAt, stale };
  const maxAge = Math.max(0, Math.floor(maxAgeMs / 1000));
  return json(body, 200, { 'Cache-Control': `public, max-age=${maxAge}` });
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
