'use client';

import { useEffect, useState } from 'react';
import type { History } from '@/lib/rivalry';

const RELAY = (process.env.NEXT_PUBLIC_LIVE_URL ?? '').replace(/\/$/, '');

/** One read per page load, shared by every component that asks. */
let pending: Promise<History | null> | null = null;

function load(): Promise<History | null> {
  pending ??= fetch(`${RELAY}/history`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((h: History | null) => (h && Array.isArray(h.games) && h.games.length ? h : null))
    .catch(() => {
      pending = null; // try again next time something asks
      return null;
    });
  return pending;
}

/**
 * The league's history since 2021 from the relay, or null while it loads,
 * when the relay isn't configured, or before the relay has stored any.
 */
export function useHistory(): History | null {
  const [history, setHistory] = useState<History | null>(null);
  useEffect(() => {
    if (!RELAY) return;
    let live = true;
    load().then((h) => live && setHistory(h));
    return () => {
      live = false;
    };
  }, []);
  return history;
}
