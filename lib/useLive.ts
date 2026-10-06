'use client';

import { useEffect, useState } from 'react';
import type { LiveData } from '@/lib/live';
import type { Stats } from '@/lib/scoring';

/** Relay base URL, baked in at build time. Unset means no live updates. */
const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? '';

/**
 * How often to ask the relay. It refreshes from MFL at most every 90 seconds
 * whoever asks, so polling faster than that only re-reads its copy.
 */
const POLL_MS = 60 * 1000;

/**
 * Latest live scores for `week`, polled while one of `spans` (games being
 * played) contains now and the tab is visible. Null before the first game, on
 * a simulated clock (no spans), or when no relay is configured.
 */
export function useLive(week: number, spans: Array<[number, number]> | null): LiveData | null {
  const [live, setLive] = useState<LiveData | null>(null);

  useEffect(() => {
    if (!LIVE_URL || !spans) return;
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      const now = Date.now();
      if (document.hidden || !spans.some(([start, end]) => now >= start && now <= end)) return;
      try {
        const res = await fetch(`${LIVE_URL.replace(/\/$/, '')}/live?week=${week}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as LiveData;
        if (!cancelled && data.week === week) setLive(data);
      } catch {
        // A missed poll just leaves the last scores up; the next one retries.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Spans come from the build and never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  return live;
}

/** Sleeper refreshes stats through the game; every two minutes is plenty for a byline. */
const STATS_POLL_MS = 2 * 60 * 1000;

/**
 * Box-score stats for a week, read straight from Sleeper while one of `spans`
 * contains now and the tab is visible. Null outside games, on a simulated
 * clock (no spans), or until the first read lands.
 */
export function useLiveStats(url: string | undefined, spans: Array<[number, number]> | null): Record<string, Stats> | null {
  const [stats, setStats] = useState<Record<string, Stats> | null>(null);

  useEffect(() => {
    if (!url || !spans) return;
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      const now = Date.now();
      if (document.hidden || !spans.some(([start, end]) => now >= start && now <= end)) return;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as Record<string, Stats>;
        if (!cancelled) setStats(body);
      } catch {
        // Keep the last stats; the next poll retries.
      }
    };

    poll();
    const timer = setInterval(poll, STATS_POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // As with useLive, inputs come from the build and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return stats;
}
