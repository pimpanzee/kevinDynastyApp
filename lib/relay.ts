'use client';

import { useEffect, useState } from 'react';

/**
 * The write relay (worker/src/relay.js): moves on MFL as the owner whose
 * login the relay holds. The relay answers only requests carrying its
 * APP_TOKEN, which the owner pastes into Settings once; it is kept on this
 * device only, never in the build.
 */

const RELAY = (process.env.NEXT_PUBLIC_LIVE_URL ?? '').replace(/\/$/, '');
const KEY = 'gridlock:appToken';
const EVENT = 'gridlock:appToken';

export function readToken(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: moves stay off on this device.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether this device can make moves (a token is saved and the relay is configured). */
export function useCanMove(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const read = () => setCan(Boolean(RELAY && readToken()));
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return can;
}

export interface RelayError {
  error: string;
  /** The MFL login on the relay has expired; it needs replacing. */
  signedOut?: boolean;
  /** True when MFL may have applied a write that timed out. */
  unknown?: boolean;
}

export async function call<T>(path: string, init?: RequestInit): Promise<T | RelayError> {
  const token = readToken();
  if (!RELAY || !token) return { error: 'Moves are not set up on this device (Settings → Make moves).' };
  try {
    const res = await fetch(`${RELAY}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !body.signedOut) return { error: 'The app token was not accepted. Check it in Settings.' };
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

export interface Me {
  signedIn: boolean | null;
  franchiseId?: string;
  franchiseName?: string | null;
  season: string;
  reason?: string;
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
