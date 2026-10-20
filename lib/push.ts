'use client';

import { call, isError, readAccount, type RelayError } from '@/lib/relay';

/**
 * Push alerts on this device, for the team signed in on it: a service
 * worker (public/sw.js) subscribed with the relay's VAPID key, and which
 * alerts this device wants. The relay keeps the subscription under that
 * owner and sends the pushes (worker/src/alerts.js).
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const PREFS_KEY = 'gridlock:alertPrefs';

export const ALERTS = [
  { key: 'lock', label: 'Lineup check', sub: '90 minutes before a kickoff, if a starter in it is out' },
  { key: 'injury', label: 'Injuries', sub: 'A starter is ruled Out, Doubtful or IR before his game' },
  { key: 'waivers', label: 'Waiver results', sub: 'Who you won and lost when claims run' },
  { key: 'recap', label: 'Weekly recap', sub: 'Tuesday: your result, the high score, your bench' },
  { key: 'login', label: 'MFL login expired', sub: 'When your MFL login stops working and you need to sign in again' },
] as const;
export type AlertKey = (typeof ALERTS)[number]['key'];
export type Prefs = Record<AlertKey, boolean>;

/** Why push can't work here, or null when it can. */
export function unsupported(): string | null {
  if (typeof window === 'undefined') return 'Not available';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'On iPhone, alerts only work from the app on your Home Screen. Add it from Settings → Install the app, then turn alerts on there.' : 'This browser can’t receive push alerts.';
  }
  return null;
}

export function readPrefs(): Prefs {
  const all = Object.fromEntries(ALERTS.map((a) => [a.key, true])) as Prefs;
  try {
    return { ...all, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return all;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the relay still has them.
  }
}

async function registration() {
  return navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
}

/** This device's current subscription, if alerts are on. */
export async function current(): Promise<PushSubscription | null> {
  if (unsupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(`${BASE}/`);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Asks permission, subscribes and registers with the relay. */
export async function enable(prefs: Prefs): Promise<true | RelayError> {
  const why = unsupported();
  if (why) return { error: why };
  if ((await Notification.requestPermission()) !== 'granted') {
    return { error: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.' };
  }
  const key = await call<{ publicKey: string }>('/push/key');
  if (isError(key)) return key;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (a reset relay) has to be replaced.
  const want = b64urlToBytes(key.publicKey);
  const have = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  if (sub && (!have || have.length !== want.length || have.some((b, i) => b !== want[i]))) {
    await sub.unsubscribe();
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want as BufferSource });
  } catch (e) {
    return { error: `This browser couldn’t set up push alerts (${e instanceof Error ? e.message : 'unknown error'}).` };
  }
  return update(sub, prefs);
}

/** Sends this device's choices to the relay. */
export async function update(sub: PushSubscription, prefs: Prefs): Promise<true | RelayError> {
  savePrefs(prefs);
  const r = await call<{ ok: true }>('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), prefs }),
  });
  return isError(r) ? r : true;
}

/**
 * Makes sure the relay still has this device. The phone keeps its push
 * subscription even when the relay forgets it (a relay reset, or the move to
 * per-owner sign-in, which dropped every device), and Settings would still
 * show alerts as on. Run on launch and after sign-in; does nothing when
 * alerts are off here or nobody is signed in.
 */
export async function resync(): Promise<void> {
  if (!readAccount()) return;
  const sub = await current();
  if (sub) await update(sub, readPrefs());
}

export async function disable(sub: PushSubscription): Promise<void> {
  await call('/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

export async function test(sub: PushSubscription): Promise<true | RelayError> {
  const r = await call<{ ok: true }>('/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  return isError(r) ? r : true;
}
