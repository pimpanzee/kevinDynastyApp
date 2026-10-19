'use client';

import { useEffect, useState } from 'react';

/**
 * The write relay (worker/src/relay.js): moves on MFL as the owner signed in
 * on this device. Signing in (the login screen) sends the owner's MFL
 * username and password to the relay once; the relay swaps them for MFL's
 * login, keeps that encrypted, and hands back a session token. Only the
 * token and the team it belongs to are kept here, on this device.
 */

const RELAY = (process.env.NEXT_PUBLIC_LIVE_URL ?? '').replace(/\/$/, '');
const KEY = 'gridlock:session';
const EVENT = 'gridlock:session';

/** Who is signed in on this device. */
export interface Account {
  token: string;
  franchiseId: string;
  franchiseName: string | null;
}

export function readAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return a && typeof a.token === 'string' && typeof a.franchiseId === 'string' ? a : null;
  } catch {
    return null;
  }
}

function saveAccount(a: Account | null): void {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
    // The single-owner app token this replaced.
    localStorage.removeItem('gridlock:appToken');
  } catch {
    // Storage blocked: moves stay off on this device.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The signed-in account, kept up to date; undefined until read. */
export function useAccount(): Account | null | undefined {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setAccount(RELAY ? readAccount() : null);
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return account;
}

/** Whether this device can make moves (an owner is signed in and the relay is configured). */
export function useCanMove(): boolean {
  return Boolean(useAccount());
}

/** Whether sign-in is possible from this build at all. */
export const canSignIn = Boolean(RELAY);

export interface RelayError {
  error: string;
  /** The owner's MFL login has expired, or this device was signed out: sign in again. */
  signedOut?: boolean;
  /** True when MFL may have applied a write that timed out. */
  unknown?: boolean;
}

/** What the move screens say when the owner has to sign in again. */
export const SIGNED_OUT = 'Your MFL login has expired, or this device was signed out. Sign in again to keep making moves.';

export async function call<T>(path: string, init?: RequestInit): Promise<T | RelayError> {
  const account = readAccount();
  if (!RELAY || !account) return { error: 'Sign in with your MFL account to make moves.', signedOut: true };
  try {
    const res = await fetch(`${RELAY}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${account.token}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && body.noSession) {
      // Signed out elsewhere, or the session lapsed: this device is signed out too.
      if (readAccount()?.token === account.token) saveAccount(null);
      return { error: body.error ?? 'Sign in with your MFL account again.', signedOut: true };
    }
    if (!res.ok || body.ok === false || body.ok === null || body.error) {
      return { error: body.error ?? `Relay error (${res.status})`, signedOut: body.signedOut, unknown: body.ok === null };
    }
    return body as T;
  } catch {
    return { error: 'Could not reach the relay. Check your connection.' };
  }
}

export function isError<T>(r: T | RelayError): r is RelayError {
  return typeof r === 'object' && r !== null && 'error' in r;
}

/**
 * Signs in with an MFL username and password. They go to the relay, which
 * passes them to MFL once and keeps only MFL's login, encrypted.
 */
export async function login(username: string, password: string): Promise<Account | RelayError> {
  if (!RELAY) return { error: 'Sign-in isn’t available on this copy of the app.' };
  try {
    const res = await fetch(`${RELAY}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.session) return { error: body.error ?? `Sign-in failed (${res.status}).` };
    const account: Account = { token: body.session, franchiseId: body.franchiseId, franchiseName: body.franchiseName ?? null };
    saveAccount(account);
    return account;
  } catch {
    return { error: 'Could not reach the relay. Check your connection.' };
  }
}

/**
 * Signs this device out (and stops its alerts, given its push endpoint).
 * With `everywhere`, the relay also forgets the MFL login and signs out
 * every device.
 */
export async function logout({ everywhere = false, endpoint }: { everywhere?: boolean; endpoint?: string } = {}): Promise<true | RelayError> {
  const r = await call<{ ok: true }>('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(everywhere ? { all: true } : { endpoint }),
  });
  // "Everywhere" has to reach the relay, or MFL's login stays stored there.
  if (everywhere && isError(r) && !r.signedOut) return r;
  saveAccount(null);
  return true;
}

export interface Me {
  signedIn: boolean | null;
  franchiseId?: string;
  franchiseName?: string | null;
  season: string;
  reason?: string;
  error?: string;
}

export interface Mine {
  week: number;
  franchiseId: string;
  roster: Array<{ id: string; status: 'ROSTER' | 'TAXI_SQUAD' | 'INJURED_RESERVE'; salary: number; contractYear: number }>;
  starters: string[];
  /** NFL team → kickoff, ms. */
  kickoffs: Record<string, number>;
  fetchedAt: number;
}

export interface PendingBid {
  player: string;
  bid: number;
  drop: string | null;
}

export interface Waivers {
  /** Every free agent MFL has right now. */
  freeAgents: string[];
  /** Your pending blind bids in priority order; null when MFL's reply couldn't be read. */
  pending: PendingBid[] | null;
  fetchedAt: number;
}

export const getMe = () => call<Me>('/me');
export const getWaivers = () => call<Waivers>('/waivers');
export const getMine = (week?: number) => call<Mine>(`/mine${week ? `?week=${week}` : ''}`);

/** One allowlisted MFL write (worker/src/relay.js `WRITES`). Never retried. */
export const write = (type: string, params: Record<string, string>) =>
  call<{ ok: true }>('/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, params }) });

export interface PendingTrade {
  id: string;
  /** Franchise that made the offer, and the one it was made to. */
  from: string;
  to: string;
  /** What `from` gives up and gets: player ids and FP_/DP_ pick ids. */
  give: string[];
  get: string[];
  comments: string;
  /** ms, or null when MFL gives none. */
  expires: number | null;
  sent: number | null;
}

export interface Trades {
  /** Null when MFL's reply couldn't be read. */
  trades: PendingTrade[] | null;
  fetchedAt: number;
}

export const getTrades = () => call<Trades>('/trades');
