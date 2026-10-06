'use client';

import { useEffect } from 'react';

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? '';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Don't re-check more often than this when the app flips back and forth. */
const MIN_INTERVAL_MS = 60 * 1000;

/**
 * Keeps an installed app current. iOS resumes a Home Screen app exactly as it
 * was left, possibly hours and several rebuilds ago. Whenever the app comes
 * back on screen, ask for the live build's id; if it differs, reload the same
 * screen. The reload carries the new id as a query string so neither GitHub
 * Pages' ten-minute cache nor the browser's serves the old page again.
 */
export default function UpdateCheck() {
  useEffect(() => {
    if (!BUILD_ID) return;
    let lastCheck = Date.now();

    const check = async () => {
      if (document.hidden || Date.now() - lastCheck < MIN_INTERVAL_MS) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === BUILD_ID) return;
        // Reload once per new build; if the old page still comes back, wait
        // for the next resume rather than looping.
        if (sessionStorage.getItem('gridlock:reloadedFor') === build) return;
        sessionStorage.setItem('gridlock:reloadedFor', build);
        const url = new URL(window.location.href);
        url.searchParams.set('v', build);
        window.location.replace(url.toString());
      } catch {
        // Offline or storage blocked: stay on the current build.
      }
    };

    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  return null;
}
