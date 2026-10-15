/**
 * Write relay: sends a short allowlist of MFL import requests as the signed-in
 * owner (solo mode: Liam's MFL login cookie, held as the MFL_COOKIE secret).
 *
 * Rules, from the "MFL suite" plan:
 * - Only the write types below, only league MFL_LEAGUE_ID, never FRANCHISE_ID,
 *   so MFL applies every write to the cookie owner's own team.
 * - Never retry a write: a timed-out write may still have gone through.
 * - MFL answers failed writes and logins with HTTP 200 and an <error> body,
 *   so the body decides success, not the status.
 * - A login error marks the cookie expired; writes stop until it is replaced.
 * - Every write is recorded in the audit log, kept in this Durable Object.
 * - Redirects are never followed: fetch drops the Cookie header on the hop.
 */

const WRITE_TIMEOUT_MS = 15 * 1000;
const CHECK_TIMEOUT_MS = 10 * 1000;
/** How much of MFL's reply the audit log keeps. */
const REPLY_CHARS = 500;
const AUDIT_LIMIT = 100;

const IDS = /^\d{1,8}(,\d{1,8})*$/;
/** Players, current-year picks (DP_02_05), future picks (FP_0005_2027_2) and blind bid dollars (BB_10.50). */
const ASSETS = /^(\d{1,8}|DP_\d{2}_\d{2}|FP_\d{4}_\d{4}_\d{1,2}|BB_\d{1,4}(\.\d{1,2})?)(,(\d{1,8}|DP_\d{2}_\d{2}|FP_\d{4}_\d{4}_\d{1,2}|BB_\d{1,4}(\.\d{1,2})?))*$/;
/** Blind bids: player_bid_drop, comma separated, "0000" when dropping nobody. Empty clears the round. */
const BIDS = /^(\d{1,8}_\d{1,4}_\d{1,8}(,\d{1,8}_\d{1,4}_\d{1,8})*)?$/;
const TEXT = /^[^\u0000-\u001f<>]{0,250}$/;
const FRANCHISE = /^\d{4}$/;
const WEEK = /^([1-9]|1\d|2[0-2])$/;
const ROUND = /^\d{1,2}$/;
const UNIX_TIME = /^\d{10}$/;

/**
 * The writes this relay will send, and the parameters each may carry. A
 * parameter not listed is refused, which is what keeps FRANCHISE_ID (acting
 * for another team) and the DROP options below out.
 */
export const WRITES = {
  /** Submit lineup. */
  lineup: { required: ['W', 'STARTERS'], params: { W: WEEK, STARTERS: IDS, COMMENTS: TEXT } },
  /** Every pickup in this league goes through blind bid waivers. */
  blindBidWaiverRequest: { required: ['PICKS'], params: { PICKS: BIDS, ROUND, REPLACE: /^1$/ } },
  /** Drop only: adds go through blind bids, never first come first served. */
  fcfsWaiver: { required: ['DROP'], params: { DROP: IDS } },
  ir: { oneOf: ['ACTIVATE', 'DEACTIVATE'], params: { ACTIVATE: IDS, DEACTIVATE: IDS } },
  taxi_squad: { oneOf: ['PROMOTE', 'DEMOTE'], params: { PROMOTE: IDS, DEMOTE: IDS } },
  tradeProposal: {
    required: ['OFFEREDTO', 'WILL_GIVE_UP', 'WILL_RECEIVE'],
    params: { OFFEREDTO: FRANCHISE, WILL_GIVE_UP: ASSETS, WILL_RECEIVE: ASSETS, COMMENTS: TEXT, EXPIRES: UNIX_TIME },
  },
  tradeResponse: {
    required: ['TRADE_ID', 'RESPONSE'],
    params: { TRADE_ID: /^\d{1,10}$/, RESPONSE: /^(accept|reject|revoke)$/, COMMENTS: TEXT },
  },
};

/** The write's parameters as strings, or an error message. */
export function validateWrite(type, params) {
  const spec = Object.hasOwn(WRITES, type) ? WRITES[type] : null;
  if (!spec) return { error: `Write type not allowed: ${String(type).slice(0, 40)}` };
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { error: 'params must be an object' };
  const clean = {};
  for (const [key, raw] of Object.entries(params)) {
    if (!Object.hasOwn(spec.params, key)) return { error: `${type} does not take ${key.slice(0, 40)}` };
    const value = typeof raw === 'number' ? String(raw) : raw;
    if (typeof value !== 'string' || !spec.params[key].test(value)) return { error: `Bad ${key}` };
    clean[key] = value;
  }
  for (const key of spec.required ?? []) {
    if (!(key in clean)) return { error: `${type} needs ${key}` };
  }
  if (spec.oneOf && !spec.oneOf.some((k) => clean[k])) return { error: `${type} needs one of ${spec.oneOf.join(', ')}` };
  return { params: clean };
}

/** MFL's reply to an import: { ok, message, signedOut }. */
export function readImportReply(text) {
  const error = /<error[^>]*>([\s\S]*?)<\/error>/i.exec(text);
  if (error) {
    const message = decode(error[1]).trim() || 'MFL refused the request';
    return { ok: false, message, signedOut: isSignedOut(message) };
  }
  if (/<status[^>]*>\s*OK\s*<\/status>/i.test(text)) return { ok: true, message: 'OK', signedOut: false };
  // Neither: most likely an HTML page (a login form or an outage notice).
  return { ok: false, message: 'Unexpected reply from MFL', signedOut: /<form[^>]*login/i.test(text) };
}

function isSignedOut(message) {
  return /logged in|log in|login|cookie|not authori[sz]ed|restricted to league owners/i.test(message);
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** First 16 hex chars of the cookie's SHA-256: tells cookies apart without storing one. */
async function fingerprint(cookie) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookie));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class WriteRelay {
  constructor(state, env) {
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      type TEXT NOT NULL,
      params TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reply TEXT NOT NULL
    )`);
    // One row per cookie: when it was first seen, last worked, and first failed.
    // The gap between first_seen and expired_at answers "how long does an MFL
    // login last" (build step 1).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cookies (
      fingerprint TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_ok INTEGER,
      expired_at INTEGER,
      franchise_id TEXT
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/me') return json(await this.me());
      if (url.pathname === '/audit') return json({ entries: this.audit() });
      if (url.pathname === '/mine') {
        const result = await this.mine(url.searchParams.get('week'));
        return json(result, result.status ?? 200);
      }
      if (url.pathname === '/write' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const result = await this.write(body?.type, body?.params);
        return json(result, result.status ?? 200);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  /** The cookie's row, created on first sight. Null when no cookie is configured. */
  async cookie() {
    const value = this.env.MFL_COOKIE;
    if (!value) return null;
    const fp = await fingerprint(value);
    const now = Date.now();
    this.sql.exec('INSERT OR IGNORE INTO cookies (fingerprint, first_seen) VALUES (?, ?)', fp, now);
    const row = this.sql.exec('SELECT * FROM cookies WHERE fingerprint = ?', fp).one();
    return { value, ...row };
  }

  markCookie(fp, ok, franchiseId) {
    if (ok) {
      this.sql.exec(
        // A working call clears an earlier "expired", which can only have been a misread.
        'UPDATE cookies SET last_ok = ?, expired_at = NULL, franchise_id = COALESCE(?, franchise_id) WHERE fingerprint = ?',
        Date.now(),
        franchiseId ?? null,
        fp,
      );
    } else {
      this.sql.exec('UPDATE cookies SET expired_at = COALESCE(expired_at, ?) WHERE fingerprint = ?', Date.now(), fp);
    }
  }

  headers(cookie) {
    return {
      Cookie: `MFL_USER_ID=${cookie}`,
      'User-Agent': this.env.MFL_USER_AGENT || 'gridlock/1.0',
    };
  }

  /**
   * Who MFL thinks the cookie belongs to in this league, via myleagues (a
   * user-level call that only api.myfantasyleague.com answers). Also the
   * scheduled cookie-lifetime check.
   */
  async me() {
    const { MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const base = { season: MFL_SEASON, league: MFL_LEAGUE_ID, writes: Object.keys(WRITES) };
    const c = await this.cookie();
    if (!c) return { ...base, signedIn: false, reason: 'no-cookie' };

    let res;
    try {
      res = await fetch(`https://api.myfantasyleague.com/${MFL_SEASON}/export?TYPE=myleagues&FRANCHISE_NAMES=1&JSON=1`, {
        headers: { ...this.headers(c.value), Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch (e) {
      return { ...base, signedIn: null, reason: 'mfl-unreachable', error: e.message, cookie: cookieInfo(c) };
    }
    if (res.status !== 200) return { ...base, signedIn: null, reason: `mfl-${res.status}`, cookie: cookieInfo(c) };
    const body = await res.json().catch(() => ({}));
    if (body.error) {
      const message = body.error.$t ?? 'error';
      if (isSignedOut(message)) this.markCookie(c.fingerprint, false);
      return { ...base, signedIn: false, reason: 'mfl-error', error: message, cookie: cookieInfo(await this.cookie()) };
    }
    const leagues = body.myleagues?.league;
    const league = (Array.isArray(leagues) ? leagues : leagues ? [leagues] : []).find((l) => l.league_id === MFL_LEAGUE_ID);
    // myleagues answers a dead cookie with an empty list, not an error.
    if (!league?.franchise_id) {
      this.markCookie(c.fingerprint, false);
      return { ...base, signedIn: false, reason: 'not-in-league', cookie: cookieInfo(await this.cookie()) };
    }
    this.markCookie(c.fingerprint, true, league.franchise_id);
    return {
      ...base,
      signedIn: true,
      franchiseId: league.franchise_id,
      franchiseName: league.franchise_name ?? null,
      cookie: cookieInfo(await this.cookie()),
    };
  }

  /** An authenticated MFL export, read fresh. Never cached: it may hold the owner's private data. */
  async read(c, url) {
    const res = await fetch(url, {
      headers: { ...this.headers(c.value), Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (res.status !== 200) throw new Error(`MFL answered ${res.status}`);
    const body = await res.json();
    if (body.error) {
      const message = body.error.$t ?? 'error';
      if (isSignedOut(message)) this.markCookie(c.fingerprint, false);
      throw Object.assign(new Error(message), { signedOut: isSignedOut(message) });
    }
    return body;
  }

  /**
   * The owner's team as MFL has it right now, for the lineup screen: roster
   * with IR and taxi, this week's starters, and each NFL team's kickoff (a
   * player locks at his own). Week defaults to MFL's current one.
   */
  async mine(weekParam) {
    if (weekParam && !WEEK.test(weekParam)) return { error: 'Bad week', status: 400 };
    const c = await this.cookie();
    if (!c) return { error: 'No MFL login is set up on the relay', status: 503 };
    if (c.expired_at) return { error: 'The MFL login has expired; sign in again', signedOut: true, status: 401 };
    let franchiseId = c.franchise_id;
    if (!franchiseId) {
      const who = await this.me();
      if (!who.signedIn) return { error: 'MFL does not see you signed in to this league', signedOut: true, status: 401 };
      franchiseId = who.franchiseId;
    }

    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const league = `${MFL_HOST}/${MFL_SEASON}/export?L=${MFL_LEAGUE_ID}&JSON=1`;
    try {
      const w = weekParam ? `&W=${weekParam}` : '';
      const [live, rosters] = await Promise.all([
        this.read(c, `${league}&TYPE=liveScoring&DETAILS=1${w}`),
        this.read(c, `${league}&TYPE=rosters&FRANCHISE=${franchiseId}`),
      ]);
      const week = Number(weekParam || live.liveScoring?.week);
      // nflSchedule isn't league data, so only the api host answers it.
      const schedule = await this.read(c, `https://api.myfantasyleague.com/${MFL_SEASON}/export?TYPE=nflSchedule&W=${week}&JSON=1`);

      const side = list(live.liveScoring?.matchup)
        .flatMap((m) => list(m.franchise))
        .concat(list(live.liveScoring?.franchise))
        .find((f) => f.id === franchiseId);
      const starters = list(side?.players?.player).filter((p) => p.status === 'starter').map((p) => p.id);
      const roster = list(list(rosters.rosters?.franchise)[0]?.player).map((p) => ({
        id: p.id,
        status: p.status ?? 'ROSTER',
        salary: Number(p.salary) || 0,
        contractYear: Number(p.contractYear) || 0,
      }));
      const kickoffs = {};
      for (const g of list(schedule.nflSchedule?.matchup)) {
        for (const t of list(g.team)) kickoffs[t.id] = Number(g.kickoff) * 1000;
      }
      // No markCookie here: these reads are public, so they succeed with a dead cookie too.
      return { week, franchiseId, roster, starters, kickoffs, fetchedAt: Date.now() };
    } catch (e) {
      return { error: e.message, signedOut: e.signedOut || undefined, status: e.signedOut ? 401 : 502 };
    }
  }

  async write(type, rawParams) {
    const checked = validateWrite(type, rawParams);
    if (checked.error) return { ok: false, error: checked.error, status: 400 };
    const c = await this.cookie();
    if (!c) return { ok: false, error: 'No MFL login is set up on the relay', status: 503 };
    if (c.expired_at) {
      return { ok: false, signedOut: true, error: 'The MFL login has expired; sign in again', status: 401 };
    }

    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    // TYPE and L go in the query, the owner's choices in the POST body.
    const url = `${MFL_HOST}/${MFL_SEASON}/import?TYPE=${encodeURIComponent(type)}&L=${encodeURIComponent(MFL_LEAGUE_ID)}`;
    let outcome;
    let reply;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...this.headers(c.value), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(checked.params),
        redirect: 'manual',
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.status >= 300 && res.status < 400) {
        outcome = { ok: false, message: `MFL redirected the write (${res.status}); not followed`, signedOut: false };
      } else if (res.status === 429 || res.status >= 500) {
        outcome = { ok: null, message: `MFL answered ${res.status}; the move may or may not have gone through`, signedOut: false };
      } else {
        outcome = readImportReply(text);
      }
      reply = text.slice(0, REPLY_CHARS);
    } catch (e) {
      // Timed out or dropped: MFL may have applied it. Never retry; the caller re-reads the roster.
      outcome = { ok: null, message: `No answer from MFL (${e.name}); the move may or may not have gone through`, signedOut: false };
      reply = e.message;
    }

    if (outcome.signedOut) this.markCookie(c.fingerprint, false);
    else if (outcome.ok) this.markCookie(c.fingerprint, true);

    this.sql.exec(
      'INSERT INTO audit (at, type, params, outcome, reply) VALUES (?, ?, ?, ?, ?)',
      Date.now(),
      type,
      JSON.stringify(checked.params),
      outcome.ok === true ? 'ok' : outcome.ok === false ? 'error' : 'unknown',
      reply,
    );
    this.sql.exec(`DELETE FROM audit WHERE id <= (SELECT MAX(id) FROM audit) - 5000`);

    if (outcome.ok) return { ok: true };
    return {
      ok: outcome.ok,
      error: outcome.message,
      signedOut: outcome.signedOut || undefined,
      status: outcome.signedOut ? 401 : outcome.ok === null ? 504 : 422,
    };
  }

  audit() {
    return this.sql
      .exec(`SELECT at, type, params, outcome, reply FROM audit ORDER BY id DESC LIMIT ${AUDIT_LIMIT}`)
      .toArray()
      .map((r) => ({ ...r, params: JSON.parse(r.params) }));
  }
}

/** MFL wraps a single item as an object. */
function list(x) {
  return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x];
}

function cookieInfo(c) {
  if (!c) return null;
  return { firstSeen: c.first_seen, lastOk: c.last_ok ?? null, expiredAt: c.expired_at ?? null };
}

function json(body, status = 200) {
  const { status: _omit, ...rest } = body;
  return new Response(JSON.stringify(rest), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
