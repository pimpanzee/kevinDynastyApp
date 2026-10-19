/**
 * Write relay: sends a short allowlist of MFL import requests as the
 * signed-in owner. Any owner in the league signs in once with their MFL
 * username and password (POST /login); the relay swaps those for MFL's login
 * cookie, forgets the password, keeps the cookie encrypted (COOKIE_KEY) and
 * gives the device a session token. Every later call acts as that owner.
 *
 * Rules, from the "MFL suite" plan:
 * - Only the write types below, only league MFL_LEAGUE_ID, never FRANCHISE_ID,
 *   so MFL applies every write to the signed-in owner's own team.
 * - Never store a password. Cookies are stored encrypted, session tokens only
 *   as hashes.
 * - Never retry a write: a timed-out write may still have gone through.
 * - MFL answers failed writes and logins with HTTP 200 and an <error> body,
 *   so the body decides success, not the status.
 * - A login error marks that owner's cookie expired; their writes stop until
 *   they sign in again.
 * - Every write is recorded in the audit log, kept in this Durable Object.
 * - Redirects are never followed: fetch drops the Cookie header on the hop.
 */

import { bbidAdds, injuryAlerts, injuryIndex, list, lockAlerts, playerIndex, recapAlert, waiverAlert } from './alerts.js';
import { newVapidKeys, sendPush } from './webpush.js';

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

/* ── Sign-in: sessions and the encrypted login store ─────────────────── */

/** A session lasts until it goes this long unused. */
const SESSION_IDLE_MS = 180 * 24 * 3600 * 1000;
/** Sessions kept per owner (oldest dropped): one per phone or browser. */
const MAX_SESSIONS = 10;
/** Sign-in attempts allowed per address, and in all, per LOGIN_WINDOW_MS. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGINS_PER_IP = 8;
const LOGINS_TOTAL = 60;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function sha256hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The AES-256-GCM key from the COOKIE_KEY secret (32 bytes, base64), or null when it isn't set. */
export async function importCookieKey(secret) {
  let raw;
  try {
    raw = fromB64((secret ?? '').trim());
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts an MFL cookie for storage: "v1.<iv>.<ciphertext>". The franchise
 * is bound in as associated data, so a stored login can't be moved to
 * another team's row.
 */
export async function seal(key, cookie, franchiseId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(franchiseId) }, key, new TextEncoder().encode(cookie));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

/** The cookie back, or null when it can't be decrypted (another key, or tampered with). */
export async function unseal(key, sealed, franchiseId) {
  const [v, iv, ct] = String(sealed).split('.');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: new TextEncoder().encode(franchiseId) }, key, fromB64(ct));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/**
 * Signs in to MFL with a username and password and returns the login cookie
 * (MFL_USER_ID). The password is sent only to MFL's HTTPS login, in a POST
 * body, and is never stored or logged. Follows at most two redirects, and
 * only to MFL over HTTPS.
 */
export async function mflLogin({ season, username, password, userAgent }) {
  let url = `https://api.myfantasyleague.com/${season}/login`;
  const body = new URLSearchParams({ USERNAME: username, PASSWORD: password, XML: '1' });
  let res;
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) break;
      const target = new URL(next, url);
      if (hop >= 2 || target.protocol !== 'https:' || !/(^|\.)myfantasyleague\.com$/.test(target.hostname)) {
        return { error: 'MFL sent the sign-in somewhere unexpected; try again later.', status: 502 };
      }
      url = target.href;
    }
  } catch {
    return { error: 'MFL didn’t answer; try again shortly.', status: 502 };
  }
  if (res.status === 429) return { error: 'MFL is busy; try again in a minute.', status: 429 };
  if (res.status !== 200) return { error: `MFL answered ${res.status}; try again shortly.`, status: 502 };
  const text = await res.text();
  const error = /<error[^>]*>([\s\S]*?)<\/error>/i.exec(text);
  if (error) return { error: decode(error[1]).trim().slice(0, 200) || 'MFL refused the sign-in.', status: 401 };
  // MFL names the attribute after the cookie: <status MFL_USER_ID="...">OK</status>.
  const status = /<status\b([^>]*)>/i.exec(text);
  const cookie = status && /\bMFL_USER_ID="([^"]+)"/.exec(status[1]);
  if (!cookie) return { error: 'MFL’s reply wasn’t a sign-in; try again later.', status: 502 };
  return { cookie: cookie[1] };
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
    // One row per MFL login ever used: when it was first seen, last worked,
    // and first failed. first_seen to expired_at is how long an MFL login lasts.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cookies (
      fingerprint TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_ok INTEGER,
      expired_at INTEGER,
      franchise_id TEXT
    )`);
    // Each signed-in owner's MFL login, encrypted with COOKIE_KEY (seal()).
    // Never a password: sign-in swaps it for MFL's cookie and forgets it.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS owners (
      franchise_id TEXT PRIMARY KEY,
      franchise_name TEXT,
      cookie TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      signed_in_at INTEGER NOT NULL
    )`);
    // The app's sessions: the SHA-256 of each token, never the token itself.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY,
      franchise_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS logins (ip TEXT NOT NULL, at INTEGER NOT NULL)');
    // Push alerts: the browsers subscribed, whose team each follows and what
    // it wants, alerts already sent (so each goes out once), and state
    // carried between runs.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS push_subs (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      prefs TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS sent (key TEXT PRIMARY KEY, at INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    // Added with sign-in (build step 7): whose move or device each row is.
    for (const table of ['audit', 'push_subs']) {
      try {
        this.sql.exec(`ALTER TABLE ${table} ADD COLUMN franchise_id TEXT`);
      } catch {
        // Already there.
      }
    }
    // Devices from the single-owner relay belong to nobody now; they subscribe again after signing in.
    this.sql.exec('DELETE FROM push_subs WHERE franchise_id IS NULL');
  }

  getState(k) {
    const row = this.sql.exec('SELECT v FROM state WHERE k = ?', k).toArray()[0];
    return row ? JSON.parse(row.v) : undefined;
  }

  setState(k, v) {
    if (v === undefined) this.sql.exec('DELETE FROM state WHERE k = ?', k);
    else this.sql.exec('INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)', k, JSON.stringify(v));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      // Only the scheduled runs reach these; they aren't public routes (index.js).
      if (path === '/alerts') return json(await this.alerts());
      if (path === '/daily') return json(await this.daily());

      if (path === '/login' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        return reply(await this.login(body, request.headers.get('X-Client-IP') ?? 'unknown'));
      }

      // Everything else acts as the signed-in owner.
      const session = await this.session(request);
      if (!session) return json({ error: 'Sign in with your MFL account to make moves.', noSession: true }, 401);
      const o = await this.owner(session.franchiseId);
      if (!o) return json({ error: 'Sign in with your MFL account again.', noSession: true }, 401);

      if (path === '/logout' && request.method === 'POST') {
        return reply(this.logout(o, session, await request.json().catch(() => null)));
      }
      if (path === '/me') return json(await this.me(o));
      if (path === '/audit') return json({ entries: this.audit(o) });
      if (path === '/waivers') return reply(await this.waivers(o));
      if (path === '/trades') return reply(await this.trades(o));
      if (path === '/mine') return reply(await this.mine(o, url.searchParams.get('week')));
      if (path === '/push/key') return json({ publicKey: (await this.vapid()).publicKey });
      if (path === '/push/subscribe' && request.method === 'POST') {
        return reply(this.subscribe(o, await request.json().catch(() => null)));
      }
      if (path === '/push/unsubscribe' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        this.sql.exec('DELETE FROM push_subs WHERE endpoint = ? AND franchise_id = ?', String(body?.endpoint ?? ''), o.franchiseId);
        return json({ ok: true });
      }
      if (path === '/push/test' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        return reply(await this.testPush(o, String(body?.endpoint ?? '')));
      }
      if (path === '/write' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        return reply(await this.write(o, body?.type, body?.params));
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  /* ── Sign-in ───────────────────────────────────────────────────────── */

  /** The COOKIE_KEY, imported once. */
  key() {
    this.keyPromise ??= importCookieKey(this.env.COOKIE_KEY);
    return this.keyPromise;
  }

  /**
   * Swaps an owner's MFL username and password for MFL's login cookie,
   * checks the account owns a team in this league, stores the cookie
   * encrypted and starts a session for this device. The password goes
   * nowhere but MFL.
   */
  async login(body, ip) {
    const key = await this.key();
    if (!key) return { error: 'Sign-in isn’t set up on the relay yet (COOKIE_KEY).', status: 503 };
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password || username.length > 100 || password.length > 200) {
      return { error: 'Enter your MFL username and password.', status: 400 };
    }

    // Keep the relay from being used to guess MFL passwords.
    const now = Date.now();
    this.sql.exec('DELETE FROM logins WHERE at < ?', now - LOGIN_WINDOW_MS);
    const mine = this.sql.exec('SELECT COUNT(*) AS n FROM logins WHERE ip = ?', ip).one().n;
    const all = this.sql.exec('SELECT COUNT(*) AS n FROM logins').one().n;
    if (mine >= LOGINS_PER_IP || all >= LOGINS_TOTAL) return { error: 'Too many sign-in attempts. Try again in 15 minutes.', status: 429 };
    this.sql.exec('INSERT INTO logins (ip, at) VALUES (?, ?)', ip, now);

    const { MFL_SEASON } = this.env;
    const signIn = await mflLogin({ season: MFL_SEASON, username, password, userAgent: this.env.MFL_USER_AGENT || 'gridlock/1.0' });
    if (signIn.error) return signIn;

    const who = await this.myleagues(signIn.cookie);
    if (who.signedIn === null) return { error: 'MFL accepted the sign-in but didn’t say which team is yours; try again shortly.', status: 502 };
    if (!who.signedIn) return { error: 'That MFL account doesn’t own a team in this league.', status: 403 };

    const franchiseId = who.franchiseId;
    const fp = await fingerprint(signIn.cookie);
    this.sql.exec(
      'INSERT OR REPLACE INTO owners (franchise_id, franchise_name, cookie, fingerprint, signed_in_at) VALUES (?, ?, ?, ?, ?)',
      franchiseId, who.franchiseName, await seal(key, signIn.cookie, franchiseId), fp, now,
    );
    this.sql.exec('INSERT OR IGNORE INTO cookies (fingerprint, first_seen) VALUES (?, ?)', fp, now);
    this.sql.exec('UPDATE cookies SET last_ok = ?, expired_at = NULL, franchise_id = ? WHERE fingerprint = ?', now, franchiseId, fp);

    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    this.sql.exec('INSERT INTO sessions (hash, franchise_id, created_at, last_used) VALUES (?, ?, ?, ?)', await sha256hex(token), franchiseId, now, now);
    this.sql.exec(
      `DELETE FROM sessions WHERE franchise_id = ? AND hash NOT IN (SELECT hash FROM sessions WHERE franchise_id = ? ORDER BY last_used DESC LIMIT ${MAX_SESSIONS})`,
      franchiseId, franchiseId,
    );
    return { session: token, franchiseId, franchiseName: who.franchiseName };
  }

  /** The session a request carries, or null. Idle sessions expire. */
  async session(request) {
    const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') ?? '');
    if (!m) return null;
    const hash = await sha256hex(m[1]);
    const row = this.sql.exec('SELECT franchise_id, last_used FROM sessions WHERE hash = ?', hash).toArray()[0];
    if (!row) return null;
    const now = Date.now();
    if (now - row.last_used > SESSION_IDLE_MS) {
      this.sql.exec('DELETE FROM sessions WHERE hash = ?', hash);
      return null;
    }
    if (now - row.last_used > 3600 * 1000) this.sql.exec('UPDATE sessions SET last_used = ? WHERE hash = ?', now, hash);
    return { hash, franchiseId: row.franchise_id };
  }

  /**
   * A signed-in owner: { franchiseId, franchiseName, value (the MFL cookie),
   * fingerprint, lastOk, expiredAt }, or null when none is stored. A login
   * that no longer decrypts (COOKIE_KEY changed) is dropped, with its sessions.
   */
  async owner(franchiseId) {
    const row = this.sql.exec('SELECT * FROM owners WHERE franchise_id = ?', franchiseId).toArray()[0];
    if (!row) return null;
    const key = await this.key();
    const value = key && (await unseal(key, row.cookie, franchiseId));
    if (!value) {
      if (key) this.forget(franchiseId);
      return null;
    }
    const life = this.sql.exec('SELECT * FROM cookies WHERE fingerprint = ?', row.fingerprint).toArray()[0] ?? {};
    return {
      franchiseId,
      franchiseName: row.franchise_name ?? null,
      value,
      fingerprint: row.fingerprint,
      firstSeen: life.first_seen ?? row.signed_in_at,
      lastOk: life.last_ok ?? null,
      expiredAt: life.expired_at ?? null,
    };
  }

  /** Every owner who has signed in. */
  async owners() {
    const ids = this.sql.exec('SELECT franchise_id FROM owners').toArray().map((r) => r.franchise_id);
    return (await Promise.all(ids.map((id) => this.owner(id)))).filter(Boolean);
  }

  /** Drops an owner's stored login, sessions and devices. */
  forget(franchiseId) {
    this.sql.exec('DELETE FROM owners WHERE franchise_id = ?', franchiseId);
    this.sql.exec('DELETE FROM sessions WHERE franchise_id = ?', franchiseId);
    this.sql.exec('DELETE FROM push_subs WHERE franchise_id = ?', franchiseId);
  }

  /**
   * Signs this device out, and stops its alerts. With `all`, also forgets the
   * owner's MFL login and signs out every device.
   */
  logout(o, session, body) {
    if (body?.all === true) {
      this.forget(o.franchiseId);
      return { ok: true };
    }
    this.sql.exec('DELETE FROM sessions WHERE hash = ?', session.hash);
    if (body?.endpoint) this.sql.exec('DELETE FROM push_subs WHERE endpoint = ? AND franchise_id = ?', String(body.endpoint), o.franchiseId);
    return { ok: true };
  }

  markCookie(o, ok, franchiseName) {
    if (ok) {
      // A working call clears an earlier "expired", which can only have been a misread.
      this.sql.exec('UPDATE cookies SET last_ok = ?, expired_at = NULL WHERE fingerprint = ?', Date.now(), o.fingerprint);
      if (franchiseName) this.sql.exec('UPDATE owners SET franchise_name = ? WHERE franchise_id = ?', franchiseName, o.franchiseId);
      o.expiredAt = null;
    } else {
      this.sql.exec('UPDATE cookies SET expired_at = COALESCE(expired_at, ?) WHERE fingerprint = ?', Date.now(), o.fingerprint);
      o.expiredAt ??= Date.now();
    }
  }

  /**
   * Whether the owner's login is still marked expired after asking MFL
   * again. A mark can be stale (a misread), so it never blocks without a
   * fresh check.
   */
  async expired(o) {
    if (!o.expiredAt) return false;
    const who = await this.me(o);
    return !who.signedIn;
  }

  headers(cookie) {
    return {
      Cookie: `MFL_USER_ID=${cookie}`,
      'User-Agent': this.env.MFL_USER_AGENT || 'gridlock/1.0',
    };
  }

  /**
   * Which team in this league an MFL cookie owns, via myleagues (a
   * user-level call that only api.myfantasyleague.com answers):
   * { signedIn: true, franchiseId, franchiseName }, { signedIn: false,
   * reason, signedOut } or { signedIn: null, reason } when MFL didn't answer.
   */
  async myleagues(cookie) {
    const { MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    let res;
    try {
      res = await fetch(`https://api.myfantasyleague.com/${MFL_SEASON}/export?TYPE=myleagues&FRANCHISE_NAMES=1&JSON=1`, {
        headers: { ...this.headers(cookie), Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch (e) {
      return { signedIn: null, reason: 'mfl-unreachable', error: e.message };
    }
    if (res.status !== 200) return { signedIn: null, reason: `mfl-${res.status}` };
    const body = await res.json().catch(() => ({}));
    if (body.error) {
      const message = body.error.$t ?? 'error';
      return { signedIn: false, reason: 'mfl-error', error: message, signedOut: isSignedOut(message) };
    }
    // The JSON reply's root is "leagues" (the export is myleagues, the element isn't).
    const leagues = (body.leagues ?? body.myleagues)?.league;
    // Each league names itself by its home page URL (…/2026/home/63396); league_id only sometimes.
    const all = Array.isArray(leagues) ? leagues : leagues ? [leagues] : [];
    const league = all.find((l) => l.league_id === MFL_LEAGUE_ID || new RegExp(`/home/${MFL_LEAGUE_ID}(\\D|$)`).test(l.url ?? ''));
    // myleagues answers a dead cookie with an empty list, not an error. A
    // commissioner without a team has no real franchise (0000).
    if (!/^\d{4}$/.test(league?.franchise_id ?? '') || league.franchise_id === '0000') {
      return { signedIn: false, reason: all.length ? 'not-in-league' : 'no-leagues', signedOut: true };
    }
    return { signedIn: true, franchiseId: league.franchise_id, franchiseName: league.franchise_name ?? null };
  }

  /** Is the owner's MFL login still good? Also the daily lifetime check. */
  async me(o) {
    const { MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const base = { season: MFL_SEASON, league: MFL_LEAGUE_ID, writes: Object.keys(WRITES), franchiseId: o.franchiseId, franchiseName: o.franchiseName };
    const who = await this.myleagues(o.value);
    if (who.signedIn === null) return { ...base, signedIn: null, reason: who.reason, error: who.error, cookie: cookieInfo(o) };
    if (!who.signedIn || who.franchiseId !== o.franchiseId) {
      if (who.signedOut || who.signedIn) this.markCookie(o, false);
      return { ...base, signedIn: false, reason: who.signedIn ? 'other-team' : who.reason, error: who.error, cookie: cookieInfo(o) };
    }
    this.markCookie(o, true, who.franchiseName);
    return { ...base, signedIn: true, franchiseName: who.franchiseName ?? o.franchiseName, cookie: cookieInfo(o) };
  }

  /** The daily run: checks every stored login, which records how long one lasts. */
  async daily() {
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE last_used < ?', now - SESSION_IDLE_MS);
    const out = {};
    for (const o of await this.owners()) out[o.franchiseId] = (await this.me(o)).signedIn;
    return out;
  }

  /** An authenticated MFL export, read fresh. Never cached: it may hold the owner's private data. */
  async read(o, url) {
    const res = await fetch(url, {
      headers: { ...this.headers(o.value), Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (res.status !== 200) throw new Error(`MFL answered ${res.status}`);
    const body = await res.json();
    if (body.error) {
      const message = body.error.$t ?? 'error';
      if (isSignedOut(message)) this.markCookie(o, false);
      throw Object.assign(new Error(message), { signedOut: isSignedOut(message) });
    }
    return body;
  }

  /**
   * The owner's team as MFL has it right now, for the lineup screen: roster
   * with IR and taxi, this week's starters, and each NFL team's kickoff (a
   * player locks at his own). Week defaults to MFL's current one.
   */
  async mine(o, weekParam) {
    if (weekParam && !WEEK.test(weekParam)) return { error: 'Bad week', status: 400 };
    if (await this.expired(o)) return EXPIRED;
    const franchiseId = o.franchiseId;
    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const league = `${MFL_HOST}/${MFL_SEASON}/export?L=${MFL_LEAGUE_ID}&JSON=1`;
    try {
      const w = weekParam ? `&W=${weekParam}` : '';
      const [live, rosters] = await Promise.all([
        this.read(o, `${league}&TYPE=liveScoring&DETAILS=1${w}`),
        this.read(o, `${league}&TYPE=rosters&FRANCHISE=${franchiseId}`),
      ]);
      const week = Number(weekParam || live.liveScoring?.week);
      // nflSchedule isn't league data, so only the api host answers it.
      const schedule = await this.read(o, `https://api.myfantasyleague.com/${MFL_SEASON}/export?TYPE=nflSchedule&W=${week}&JSON=1`);

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

  /**
   * Live free agents and the owner's pending blind bids, for the claim
   * screen. Bids are private until MFL runs waivers: never cached or logged.
   */
  async waivers(o) {
    if (await this.expired(o)) return EXPIRED;
    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const league = `${MFL_HOST}/${MFL_SEASON}/export?L=${MFL_LEAGUE_ID}&JSON=1`;
    try {
      const [fa, pending] = await Promise.all([
        this.read(o, `${league}&TYPE=freeAgents`),
        this.read(o, `${league}&TYPE=pendingWaivers`),
      ]);
      const freeAgents = list(fa.freeAgents?.leagueUnit)
        .flatMap((u) => list(u.player))
        .map((p) => p.id)
        .filter(Boolean);
      const bids = readPendingBids(pending.pendingWaivers);
      return {
        freeAgents,
        pending: bids,
        // Only when the shape wasn't understood, so the claim screen can say so
        // (and never offer to rewrite a list it couldn't read).
        pendingUnread: bids === null ? JSON.stringify(pending.pendingWaivers ?? null).slice(0, 1500) : undefined,
        fetchedAt: Date.now(),
      };
    } catch (e) {
      return { error: e.message, signedOut: e.signedOut || undefined, status: e.signedOut ? 401 : 502 };
    }
  }

  /**
   * Trade offers waiting on an answer: ones the owner sent and ones sent to
   * them. Private until answered: never cached or logged.
   */
  async trades(o) {
    if (await this.expired(o)) return EXPIRED;
    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    try {
      const body = await this.read(o, `${MFL_HOST}/${MFL_SEASON}/export?L=${MFL_LEAGUE_ID}&JSON=1&TYPE=pendingTrades`);
      const trades = readPendingTrades(body.pendingTrades);
      return {
        trades,
        unread: trades === null ? JSON.stringify(body.pendingTrades ?? null).slice(0, 1500) : undefined,
        fetchedAt: Date.now(),
      };
    } catch (e) {
      return { error: e.message, signedOut: e.signedOut || undefined, status: e.signedOut ? 401 : 502 };
    }
  }

  async write(o, type, rawParams) {
    const checked = validateWrite(type, rawParams);
    if (checked.error) return { ok: false, error: checked.error, status: 400 };
    if (await this.expired(o)) return { ok: false, ...EXPIRED };

    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    // TYPE and L go in the query, the owner's choices in the POST body.
    const url = `${MFL_HOST}/${MFL_SEASON}/import?TYPE=${encodeURIComponent(type)}&L=${encodeURIComponent(MFL_LEAGUE_ID)}`;
    let outcome;
    let replyText;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...this.headers(o.value), 'Content-Type': 'application/x-www-form-urlencoded' },
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
      replyText = text.slice(0, REPLY_CHARS);
    } catch (e) {
      // Timed out or dropped: MFL may have applied it. Never retry; the caller re-reads the roster.
      outcome = { ok: null, message: `No answer from MFL (${e.name}); the move may or may not have gone through`, signedOut: false };
      replyText = e.message;
    }

    if (outcome.signedOut) this.markCookie(o, false);
    else if (outcome.ok) this.markCookie(o, true);

    this.sql.exec(
      'INSERT INTO audit (at, type, params, outcome, reply, franchise_id) VALUES (?, ?, ?, ?, ?, ?)',
      Date.now(),
      type,
      JSON.stringify(checked.params),
      outcome.ok === true ? 'ok' : outcome.ok === false ? 'error' : 'unknown',
      replyText,
      o.franchiseId,
    );
    this.sql.exec(`DELETE FROM audit WHERE id <= (SELECT MAX(id) FROM audit) - 5000`);

    // Your own claim edits aren't waiver results: start the comparison over.
    if (outcome.ok !== false && type === 'blindBidWaiverRequest') this.setState(`pending:${o.franchiseId}`, undefined);

    if (outcome.ok) return { ok: true };
    return {
      ok: outcome.ok,
      error: outcome.signedOut ? EXPIRED.error : outcome.message,
      signedOut: outcome.signedOut || undefined,
      status: outcome.signedOut ? 401 : outcome.ok === null ? 504 : 422,
    };
  }

  /* ── Push alerts ───────────────────────────────────────────────────── */

  /** The relay's VAPID keys, made on first use and kept here, so there's nothing to configure. */
  async vapid() {
    let keys = this.getState('vapid');
    if (!keys) {
      keys = await newVapidKeys();
      this.setState('vapid', keys);
    }
    return keys;
  }

  /** Subscribes a device to its owner's alerts, with what this device wants. */
  subscribe(o, body) {
    const sub = body?.subscription;
    const endpoint = String(sub?.endpoint ?? '');
    const { p256dh, auth } = sub?.keys ?? {};
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string') {
      return { error: 'Bad subscription', status: 400 };
    }
    const prefs = {};
    for (const k of ALERT_TYPES) prefs[k] = body?.prefs?.[k] !== false;
    this.sql.exec(
      'INSERT OR REPLACE INTO push_subs (endpoint, p256dh, auth, prefs, created_at, franchise_id) VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM push_subs WHERE endpoint = ?), ?), ?)',
      endpoint, p256dh, auth, JSON.stringify(prefs), endpoint, Date.now(), o.franchiseId,
    );
    this.sql.exec(
      `DELETE FROM push_subs WHERE franchise_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE franchise_id = ? ORDER BY created_at DESC LIMIT ${MAX_SUBS})`,
      o.franchiseId, o.franchiseId,
    );
    return { ok: true, prefs };
  }

  subs(franchiseId) {
    const rows = franchiseId
      ? this.sql.exec('SELECT * FROM push_subs WHERE franchise_id = ?', franchiseId).toArray()
      : this.sql.exec('SELECT * FROM push_subs').toArray();
    return rows.map((r) => ({ ...r, prefs: JSON.parse(r.prefs) }));
  }

  async push(sub, alert) {
    const site = (this.env.SITE_URL ?? '').replace(/\/$/, '');
    const message = { title: alert.title, body: alert.body, tag: alert.key.split(':')[0], url: `${site}${alert.url ?? '/'}` };
    try {
      const r = await sendPush(sub, message, await this.vapid(), site || 'https://pimpanzee.github.io', { urgency: alert.urgent ? 'high' : 'normal' });
      if (r.gone) this.sql.exec('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint);
      return r;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async testPush(o, endpoint) {
    const sub = this.subs(o.franchiseId).find((s) => s.endpoint === endpoint);
    if (!sub) return { error: 'This device is not subscribed', status: 404 };
    const r = await this.push(sub, { key: 'test', title: 'Alerts are on', body: 'This is what an alert from THE LIAM looks like.', url: '/settings/' });
    return r.ok ? { ok: true } : { error: `The push service refused it (${r.status ?? r.error})`, status: 502 };
  }

  /** Sends an alert of one type to every device of one owner that wants it, once per key. */
  async notify(franchiseId, type, alert) {
    const key = `${franchiseId}|${alert?.key}`;
    if (!alert || this.sql.exec('SELECT 1 FROM sent WHERE key = ?', key).toArray().length) return 0;
    this.sql.exec('INSERT INTO sent (key, at) VALUES (?, ?)', key, Date.now());
    let n = 0;
    for (const sub of this.subs(franchiseId)) {
      if (sub.prefs[type] === false) continue;
      if ((await this.push(sub, alert)).ok) n += 1;
    }
    return n;
  }

  /**
   * The scheduled alert run (every 15 minutes), for every owner with a
   * device subscribed. League-wide reads (kickoffs, injuries, live scores,
   * results) are made once per run and shared; each owner's pending claims
   * are read with their own login. Nothing is read when nobody is subscribed.
   */
  async alerts() {
    const subscribed = [...new Set(this.subs().map((s) => s.franchise_id))];
    if (!subscribed.length) return { skipped: 'no-subscribers' };
    const owners = [];
    for (const id of subscribed) {
      const o = await this.owner(id);
      if (!o) {
        this.sql.exec('DELETE FROM push_subs WHERE franchise_id = ?', id);
        continue;
      }
      if (o.expiredAt) {
        await this.notify(id, 'login', {
          key: `login:${o.fingerprint}`,
          title: 'Your MFL login expired',
          body: 'Moves are paused until you sign in again: Settings → MFL account.',
          url: '/login/',
        });
        continue;
      }
      owners.push(o);
    }
    if (!owners.length) return { skipped: 'signed-out' };

    const { MFL_HOST, MFL_SEASON, MFL_LEAGUE_ID } = this.env;
    const league = `${MFL_HOST}/${MFL_SEASON}/export?L=${MFL_LEAGUE_ID}&JSON=1`;
    const api = `https://api.myfantasyleague.com/${MFL_SEASON}/export?JSON=1`;
    const now = Date.now();
    const allDone = this.sql.exec('SELECT key FROM sent').toArray().map((r) => r.key);
    this.sql.exec('DELETE FROM sent WHERE at < ?', now - 60 * 24 * 3600 * 1000);
    const sent = [];
    const errors = [];
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
    };
    // League-wide exports are public: read once per run, with the first owner's login.
    const reader = owners[0];
    const memo = new Map();
    const shared = (url) => {
      if (!memo.has(url)) memo.set(url, this.read(reader, url));
      return memo.get(url);
    };

    // The week's kickoffs (re-read every 6 hours) and league basics (daily).
    let sched = this.getState('sched');
    if (!sched || now - sched.at > 6 * 3600 * 1000) {
      const body = await shared(`${api}&TYPE=nflSchedule`);
      const kickoffs = {};
      for (const g of list(body.nflSchedule?.matchup)) for (const t of list(g.team)) kickoffs[t.id] = Number(g.kickoff) * 1000;
      sched = { week: Number(body.nflSchedule?.week) || 0, kickoffs, at: now };
      this.setState('sched', sched);
    }
    let info = this.getState('league');
    if (!info || now - info.at > 24 * 3600 * 1000) {
      const body = await shared(`${league}&TYPE=league`);
      const franchises = {};
      for (const f of list(body.league?.franchises?.franchise)) franchises[f.id] = String(f.name ?? '').trim();
      info = { minStarters: Number(String(body.league?.starters?.count ?? '0').split('-')[0]) || 0, franchises, at: now };
      this.setState('league', info);
    }
    const { week, kickoffs } = sched;
    const names = async (ids) => (ids.length ? playerIndex(await shared(`${api}&TYPE=players&PLAYERS=${[...new Set(ids)].sort().join(',')}`)) : {});

    // Injuries are compared with the last run's once, for everyone.
    let injuries = null;
    let prev = {};
    await step('injuries', async () => {
      // Injuries and players aren't league data, so only the api host answers them.
      injuries = injuryIndex(await shared(`${api}&TYPE=injuries`));
      prev = this.getState('injuries') ?? {};
      this.setState('injuries', injuries);
    });
    const lockDue = Object.values(kickoffs).some((t) => t > now && t - now <= 90 * 60 * 1000);
    const changed = injuries !== null && Object.keys(injuries).some((id) => injuries[id].status !== prev[id]?.status);

    for (const o of owners) {
      const fid = o.franchiseId;
      const prefix = `${fid}|`;
      const done = new Set(allDone.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));

      // Lineup lock and injuries: starters only matter before their kickoff.
      await step(`${fid} lineup`, async () => {
        if (!week || !injuries || !(lockDue || changed)) return;
        const live = await shared(`${league}&TYPE=liveScoring&DETAILS=1&W=${week}`);
        const side = list(live.liveScoring?.matchup).flatMap((m) => list(m.franchise)).concat(list(live.liveScoring?.franchise)).find((f) => f.id === fid);
        const starters = list(side?.players?.player).filter((p) => p.status === 'starter').map((p) => p.id);
        const players = await names(starters);
        const lock = lockAlerts({ now, week, kickoffs, starters, minStarters: info.minStarters, injuries, players, done });
        for (const key of lock.checked) if (!lock.alerts.some((a) => a.key === key)) this.sql.exec('INSERT OR IGNORE INTO sent (key, at) VALUES (?, ?)', prefix + key, now);
        for (const a of lock.alerts) if (await this.notify(fid, 'lock', { ...a, urgent: true })) sent.push(prefix + a.key);
        // A first run has no earlier statuses to compare with.
        if (Object.keys(prev).length) {
          for (const a of injuryAlerts({ now, week, prev, injuries, starters, kickoffs, players, done })) if (await this.notify(fid, 'injury', a)) sent.push(prefix + a.key);
        }
      });

      // Waiver results: compare this run's pending claims with the last run's (each owner's own, read with their login).
      await step(`${fid} waivers`, async () => {
        const after = readPendingBids((await this.read(o, `${league}&TYPE=pendingWaivers`)).pendingWaivers);
        if (after === null) return; // a reply we can't read: no comparison, no guesses
        const before = this.getState(`pending:${fid}`);
        this.setState(`pending:${fid}`, after);
        if (!before?.length) return;
        const tx = await shared(`${league}&TYPE=transactions&TRANS_TYPE=BBID_WAIVER&DAYS=2`);
        const recent = bbidAdds(tx).filter((a) => now - a.at < 6 * 3600 * 1000);
        const adds = bbidAdds(tx, fid).filter((a) => now - a.at < 6 * 3600 * 1000);
        const ids = before.flatMap((b) => [b.player, b.drop].filter(Boolean)).concat(adds.flatMap((a) => a.dropped));
        const a = waiverAlert({ before, after, adds, leagueRan: recent.length > 0, players: await names(ids) });
        if (a && (await this.notify(fid, 'waivers', a))) sent.push(prefix + a.key);
      });

      // Tuesday recap, from mid-morning Eastern.
      await step(`${fid} recap`, async () => {
        const d = new Date(now);
        if (d.getUTCDay() !== 2 || d.getUTCHours() < 14 || !week) return;
        const times = Object.values(kickoffs);
        const recapWeek = times.length && times.every((t) => t < now) ? week : week - 1;
        if (recapWeek < 1 || done.has(`recap:${recapWeek}`)) return;
        const results = await shared(`${league}&TYPE=weeklyResults&W=${recapWeek}`);
        const mine = list(results.weeklyResults?.matchup).flatMap((m) => list(m.franchise)).find((f) => f.id === fid);
        const players = await names(list(mine?.player).map((p) => p.id));
        const a = recapAlert({ week: recapWeek, results, franchiseId: fid, franchises: info.franchises, players });
        if (a && (await this.notify(fid, 'recap', a))) sent.push(prefix + a.key);
      });
    }

    return { week, owners: owners.length, sent, errors };
  }

  /** The owner's own moves, newest first. */
  audit(o) {
    return this.sql
      .exec(`SELECT at, type, params, outcome, reply FROM audit WHERE franchise_id = ? ORDER BY id DESC LIMIT ${AUDIT_LIMIT}`, o.franchiseId)
      .toArray()
      .map((r) => ({ ...r, params: JSON.parse(r.params) }));
  }
}

const EXPIRED = { error: 'Your MFL login has expired. Sign in again from Settings.', signedOut: true, status: 401 };


/**
 * The owner's pending blind bids, in priority order, as
 * [{ player, bid, drop }], or null when the reply's shape isn't one we know.
 * MFL doesn't document this export's fields, so this accepts the shapes it
 * plausibly uses: a PICKS-style "player_bid_drop" string, or objects with
 * player/amount/drop fields, and gives up rather than guess.
 */
export function readPendingBids(root) {
  if (root === undefined || root === null || root === '') return [];
  const out = [];
  let understood = true;
  const visit = (node) => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(/(\d{2,8})_(\d{1,4}(?:\.\d{1,2})?)_(\d{2,8})/g)) {
        out.push({ player: m[1], bid: Number(m[2]), drop: m[3] === '0000' ? null : m[3] });
      }
      return;
    }
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    const player = node.player_id ?? node.playerId ?? node.add ?? (typeof node.player === 'string' ? node.player : undefined) ?? node.id;
    const bid = node.amount ?? node.bid ?? node.bbid;
    if (/^\d{2,8}$/.test(String(player ?? '')) && bid !== undefined && !Number.isNaN(Number(bid))) {
      const drop = node.drop ?? node.drop_id ?? node.dropPlayer;
      out.push({ player: String(player), bid: Number(bid), drop: drop && drop !== '0000' ? String(drop) : null });
      return;
    }
    const values = Object.values(node);
    if (!values.length) return;
    values.forEach(visit);
  };
  visit(root);
  // A non-empty reply that yielded nothing is a shape we don't know.
  if (!out.length && JSON.stringify(root).replace(/[^0-9]/g, '').length > 0) understood = false;
  return understood ? out : null;
}

/**
 * MFL's pendingTrades: [{ id, from, to, give, get, comments, expires }] where
 * give/get are what `from` gives up and receives (player ids, FP_/DP_ picks).
 * Null when the reply isn't the shape MFL documents.
 */
export function readPendingTrades(root) {
  if (root === undefined || root === null || root === '') return [];
  const items = list(root.pendingTrade);
  if (!items.length) return Object.keys(root).length ? null : [];
  const assets = (s) => String(s ?? '').split(',').filter(Boolean);
  const out = [];
  for (const t of items) {
    const id = t.trade_id ?? t.id;
    const from = t.offeringteam ?? t.offeringTeam;
    const to = t.offeredto ?? t.offeredTo;
    if (!/^\d+$/.test(String(id ?? '')) || !/^\d{4}$/.test(String(from ?? '')) || !/^\d{4}$/.test(String(to ?? ''))) return null;
    out.push({
      id: String(id), from: String(from), to: String(to),
      give: assets(t.will_give_up), get: assets(t.will_receive),
      comments: t.comments ?? '', expires: Number(t.expires) * 1000 || null, sent: Number(t.timestamp) * 1000 || null,
    });
  }
  return out;
}

/** Alert types a device can turn on or off. */
export const ALERT_TYPES = ['lock', 'injury', 'waivers', 'recap', 'login'];
/** Devices kept per owner at most (oldest dropped). */
const MAX_SUBS = 5;

function cookieInfo(o) {
  return { firstSeen: o.firstSeen, lastOk: o.lastOk ?? null, expiredAt: o.expiredAt ?? null };
}

function json(body, status = 200) {
  const { status: _omit, ...rest } = body;
  return new Response(JSON.stringify(rest), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** A method's result as a response, with its `status` (if any) as the HTTP status. */
function reply(result) {
  return json(result, result.status ?? 200);
}
