/**
 * Live-score relay for GRIDLOCK.
 *
 * The site is static and MFL refuses cross-origin browser requests, so live
 * scores come through here: GET /live?week=N returns that week's liveScoring,
 * normalised and small. Every request funnels into one Durable Object that
 * keeps the latest copy in memory and refreshes it at most once per
 * CACHE_SECONDS, so MFL's traffic is flat no matter how many people watch.
 *
 * GET /news?player=ESPN_ID is a player's latest news from ESPN for the
 * player card, trimmed and cached for NEWS_TTL_S (ESPN's API can't be relied
 * on from the browser directly).
 *
 * GET /widget?franchise=ID feeds the Home Screen widget (widget/): that
 * franchise's matchup with scores, projections and win odds, plus the latest
 * key plays (touchdowns and big gains) by players in it, from ESPN.
 *
 * Season and league are fixed by configuration, not the caller, so this
 * cannot be used as a general MFL proxy.
 */

import { fetchGamePlays, fetchScoreboard, indexPlayers } from './plays.js';

const MAX_WEEK = 22;
/** After MFL rejects a request, leave it alone this long before trying again. */
const BACKOFF_MS = 2 * 60 * 1000;
/** How often to re-read ESPN's play-by-play for games in progress. */
const PLAYS_TTL_MS = 2 * 60 * 1000;
/** How often to re-read the site's widget context (rebuilt hourly). */
const CONTEXT_TTL_MS = 10 * 60 * 1000;
/** Plays the widget shows at most. */
const MAX_PLAYS = 8;
/** How long a player's news is cached at the edge. */
const NEWS_TTL_S = 600;
const ESPN_NEWS = 'https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players';

/** A full NFL game, as MFL counts gameSecondsRemaining. */
const GAME_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404, cors);

    if (url.pathname === '/news') {
      const player = url.searchParams.get('player') ?? '';
      if (!/^\d{1,10}$/.test(player)) return json({ error: 'Bad player' }, 400, cors);
      return news(player, cors, ctx);
    }

    let target;
    if (url.pathname === '/live') {
      const week = Number(url.searchParams.get('week'));
      if (!validWeek(week)) return json({ error: 'Bad week' }, 400, cors);
      target = `https://live/live/${week}`;
    } else if (url.pathname === '/widget') {
      const franchise = url.searchParams.get('franchise') ?? '';
      const week = url.searchParams.get('week') ?? '';
      if (franchise && !/^\d{4}$/.test(franchise)) return json({ error: 'Bad franchise' }, 400, cors);
      if (week && !validWeek(Number(week))) return json({ error: 'Bad week' }, 400, cors);
      target = `https://live/widget?franchise=${franchise}&week=${week}`;
    } else {
      return json({ error: 'Not found' }, 404, cors);
    }

    const stub = env.LIVE.get(env.LIVE.idFromName('live'));
    const res = await stub.fetch(target);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

/** A player's latest ESPN news, trimmed to what the card shows and cached at the edge. */
async function news(player, cors, ctx) {
  const cache = caches.default;
  const key = new Request(`https://news.cache/${player}`);
  let res = await cache.match(key);
  if (!res) {
    try {
      const upstream = await fetch(`${ESPN_NEWS}?limit=6&playerId=${player}`, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) return json({ error: `ESPN news failed (${upstream.status})` }, 502, cors);
      const body = await upstream.json();
      const feed = (body.feed ?? [])
        .filter((n) => n.headline)
        .map((n) => ({ id: n.id, headline: n.headline, story: n.story ?? '', published: n.published, type: n.type ?? '' }));
      res = json({ feed }, 200, { 'Cache-Control': `public, max-age=${NEWS_TTL_S}` });
      ctx?.waitUntil(cache.put(key, res.clone()));
    } catch (e) {
      return json({ error: e.message }, 502, cors);
    }
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function validWeek(week) {
  return Number.isInteger(week) && week >= 1 && week <= MAX_WEEK;
}

export class LiveScores {
  constructor(state, env) {
    this.env = env;
    /** week → { fetchedAt, payload } */
    this.latest = new Map();
    /** key → in-flight refresh, so simultaneous misses share one upstream call. */
    this.inflight = new Map();
    this.blockedUntil = 0;
    /** The site's /widget.json, and when it was read. */
    this.context = null;
    /** week → { fetchedAt, games: Map(gameId → { final, events }) } */
    this.plays = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/widget') {
      try {
        return json(await this.widget(url.searchParams.get('franchise'), Number(url.searchParams.get('week')) || 0), 200, {
          'Cache-Control': 'public, max-age=60',
        });
      } catch (e) {
        return json({ error: e.message }, 502);
      }
    }

    const week = Number(url.pathname.split('/').pop());
    const ttl = this.liveTtl();
    try {
      const { entry, stale } = await this.liveEntry(week);
      return payload(entry, stale, stale ? 30 * 1000 : ttl - (Date.now() - entry.fetchedAt));
    } catch (e) {
      return json({ error: e.message }, e.rateLimited ? 503 : 502);
    }
  }

  liveTtl() {
    return Number(this.env.CACHE_SECONDS || 90) * 1000;
  }

  /** The latest liveScoring for a week, refreshed at most once per CACHE_SECONDS. */
  async liveEntry(week) {
    const ttl = this.liveTtl();
    const held = this.latest.get(week);
    const age = held ? Date.now() - held.fetchedAt : Infinity;

    if (age < ttl || Date.now() < this.blockedUntil) {
      if (held) return { entry: held, stale: age >= ttl };
      const err = new Error('MFL is rate limiting; try again shortly');
      err.rateLimited = true;
      throw err;
    }
    try {
      const entry = await this.once(`live:${week}`, () => this.refresh(week));
      return { entry, stale: false };
    } catch (e) {
      // Serve the last good copy, marked stale, rather than nothing.
      if (held) return { entry: held, stale: true };
      throw e;
    }
  }

  /** Run `task` once for concurrent callers sharing `key`. */
  once(key, task) {
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = task().finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
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

  /** The site's widget context: matchups, rostered players, projections. */
  async widgetContext() {
    if (this.context && Date.now() - this.context.fetchedAt < CONTEXT_TTL_MS) return this.context.value;
    try {
      const value = await this.once('context', async () => {
        const res = await fetch(`${this.env.SITE_URL.replace(/\/$/, '')}/widget.json`, { cf: { cacheTtl: 300 } });
        if (!res.ok) throw new Error(`Widget context failed (${res.status})`);
        return res.json();
      });
      this.context = { fetchedAt: Date.now(), value, index: indexPlayers(value.players) };
      return value;
    } catch (e) {
      if (this.context) return this.context.value;
      throw e;
    }
  }

  /**
   * Key plays for a week across every game, refreshed at most every
   * PLAYS_TTL_MS. A finished game is read once and kept.
   */
  async weekPlays(season, week) {
    const held = this.plays.get(week);
    if (held && Date.now() - held.fetchedAt < PLAYS_TTL_MS) return held;
    return this.once(`plays:${week}`, async () => {
      const games = held?.games ?? new Map();
      let started = held?.started ?? false;
      try {
        const board = await fetchScoreboard(season, week);
        started = board.some((g) => g.state !== 'pre');
        const index = this.context?.index ?? new Map();
        await Promise.all(
          board
            .filter((g) => g.state !== 'pre' && !games.get(g.id)?.final)
            .map(async (g) => {
              try {
                games.set(g.id, { final: g.state === 'post', events: await fetchGamePlays(g.id, index) });
              } catch {
                // Keep whatever we had for this game; the next refresh retries.
              }
            }),
        );
      } catch {
        // Scoreboard unavailable: serve what we have.
      }
      const entry = { fetchedAt: Date.now(), games, started };
      this.plays.set(week, entry);
      return entry;
    });
  }

  /** One franchise's matchup for the widget. */
  async widget(franchise, weekParam) {
    const ctx = await this.widgetContext();
    const week = weekParam || ctx.week;
    const me = ctx.franchises[franchise] ? franchise : ctx.myFranchiseId;
    const pair = (ctx.matchups[String(week)] ?? []).find((p) => p.includes(me));
    if (!pair) throw new Error(`No matchup for ${me} in week ${week}`);
    const opp = pair[0] === me ? pair[1] : pair[0];

    let live = null;
    let stale = false;
    try {
      const got = await this.liveEntry(week);
      live = got.entry;
      stale = got.stale;
    } catch {
      // No live scores (rate limited, or the week hasn't any yet): projections only.
    }

    const { games, started: weekStarted } = await this.weekPlays(ctx.season, week);

    const side = (id) => {
      const f = live?.payload.franchises[id];
      let projected = 0;
      let remaining = 0;
      const starters = new Set();
      for (const [pid, [, starter, secs]] of Object.entries(f?.players ?? {})) {
        if (!starter) continue;
        starters.add(pid);
        const p = ctx.players[pid]?.proj ?? 0;
        projected += p;
        remaining += p * Math.min(1, secs / GAME_SECONDS);
      }
      const score = f?.score ?? 0;
      return {
        id,
        name: ctx.franchises[id]?.name ?? id,
        icon: ctx.franchises[id]?.icon ?? null,
        score: round(score),
        projected: round(projected),
        remaining,
        projectedFinal: round(score + remaining),
        ytp: f?.ytp ?? null,
        playing: f?.playing ?? null,
        done: f ? f.ytp === 0 && f.playing === 0 && f.secondsRemaining === 0 : false,
        starters,
      };
    };
    const a = side(me);
    const b = side(opp);
    const decided = weekStarted && a.done && b.done;
    const state = decided ? 'final' : weekStarted || a.score || b.score ? 'live' : 'pre';
    if (state === 'pre') {
      // No lineups yet: use the site's best-lineup projections.
      for (const s of [a, b]) {
        const p = ctx.preProjected?.[String(week)]?.[s.id];
        if (p) s.projected = s.projectedFinal = round(p);
      }
    }
    // Share of both sides' projected points still to be played: the odds firm up as games finish.
    const left = state === 'pre' || a.projected + b.projected <= 0 ? 1 : (a.remaining + b.remaining) / (a.projected + b.projected);
    const winMe = decided ? (a.score >= b.score ? 100 : 0) : winPct(a.projectedFinal || a.projected, b.projectedFinal || b.projected, left);

    const plays = [...games.values()]
      .flatMap((g) => g.events)
      .filter((e) => (e.f === me && a.starters.has(e.player)) || (e.f === opp && b.starters.has(e.player)))
      .sort((x, y) => y.at - x.at)
      .slice(0, MAX_PLAYS)
      .map((e) => ({ side: e.f === me ? 'me' : 'opp', name: e.name, team: e.team, label: e.label, td: e.td, yards: e.yards, at: e.at }));

    const strip = ({ starters, ...rest }) => rest;
    return {
      week,
      state,
      updatedAt: live?.fetchedAt ?? null,
      stale,
      winPct: winMe,
      me: strip(a),
      opp: strip(b),
      plays,
      url: `${this.env.SITE_URL.replace(/\/$/, '')}/matchups/${week}/`,
    };
  }
}

function round(n) {
  return Math.round(n * 10) / 10;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26), as in lib/format.ts. */
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Win probability from the projected margin, same model and clamp as the
 * site (lib/format.ts): the spread shrinks with `left`, the share of both
 * sides' projected points still to be played.
 */
function winPct(mine, theirs, left = 1) {
  const share = Math.max(0, Math.min(1, left));
  const sd = 30 * Math.sqrt(share);
  const p = sd < 0.5 ? (mine === theirs ? 0.5 : mine > theirs ? 1 : 0) : normalCdf((mine - theirs) / sd);
  const lo = share >= 1 ? 3 : 1;
  return Math.max(lo, Math.min(100 - lo, Math.round(p * 100)));
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
