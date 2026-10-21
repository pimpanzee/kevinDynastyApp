'use client';

import { useEffect, useState } from 'react';

/**
 * Scores are normally under three minutes old: the relay re-reads MFL every
 * 90 seconds and the app asks it every minute. Past this, say they're behind.
 */
export const BEHIND_MS = 4 * 60 * 1000;

/** "40s", "3 min", "1 hr 5 min". */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/** What the stamp says for scores read at `fetchedAt`, as of `now`. */
export function stampText(fetchedAt: number, stale: boolean, now: number): { text: string; behind: boolean } {
  const age = now - fetchedAt;
  const behind = stale || age >= BEHIND_MS;
  return {
    text: behind ? `Scores may be behind: last updated ${ago(age)} ago` : `Scores updated ${ago(age)} ago`,
    behind,
  };
}

/**
 * "Scores updated 40s ago" under live scores, ticking, so a frozen feed is
 * obvious. Turns orange once scores are BEHIND_MS old or the relay says MFL
 * isn't answering (it is serving its last good copy).
 */
export default function LiveStamp({ fetchedAt, stale, style }: { fetchedAt: number; stale: boolean; style?: React.CSSProperties }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [fetchedAt]);

  const { text, behind } = stampText(fetchedAt, stale, now);
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', font: '500 11px/1.2 var(--font-body)', color: behind ? 'var(--fall)' : 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', ...style }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: behind ? 'var(--fall)' : 'var(--live)', flex: 'none' }} />
      {text}
    </div>
  );
}
