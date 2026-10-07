'use client';

import { useEffect, useState } from 'react';
import type { WeekView } from '@/lib/types';

/**
 * The viewer's own team. Pages are prebuilt around the league's default
 * franchise; each person picks theirs in Settings, it's kept on this device,
 * and screens re-point "yours" in the browser. An installed Home Screen app
 * has storage separate from Safari's, so it keeps its own choice.
 */

const KEY = 'gridlock:team';
/** Name and icon of the chosen team, so the header can show it without a lookup. */
const META_KEY = 'gridlock:teamMeta';
const EVENT = 'gridlock:team';

export interface TeamMeta {
  id: string;
  name: string;
  icon: string | null;
}

export function readTeam(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function readMeta(): TeamMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as TeamMeta) : null;
  } catch {
    return null;
  }
}

export function saveTeam(id: string, meta?: Omit<TeamMeta, 'id'>): void {
  try {
    localStorage.setItem(KEY, id);
    if (meta) localStorage.setItem(META_KEY, JSON.stringify({ id, ...meta }));
  } catch {
    // Private browsing or storage blocked: the choice just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The chosen franchise id, or `fallback` (the build's default) until one is set. */
export function useMyTeam(fallback: string): string {
  const [team, setTeam] = useState(fallback);
  useEffect(() => {
    const read = () => setTeam(readTeam() || fallback);
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [fallback]);
  return team;
}

/**
 * A week's view re-pointed at `team`: its matchup leads and is marked as
 * the user's, and the yet-to-play count and week-picker results are theirs.
 * Each matchup keeps its `index`, which addresses its prebuilt detail page.
 */
export function personalizeWeek(view: WeekView, team: string): WeekView {
  if (team === view.myFranchiseId) return view;
  const matchups = view.matchups
    .map((m) => ({ ...m, isMine: m.home.franchiseId === team || m.away.franchiseId === team }))
    .sort((a, b) => Number(b.isMine) - Number(a.isMine));
  const mine = matchups[0]?.isMine ? matchups[0] : null;
  const side = mine ? (mine.home.franchiseId === team ? mine.home : mine.away) : null;
  const ytp = side ? Number(side.meta.split('·')[1]?.trim().split(' ')[0] ?? 0) : 0;
  return {
    ...view,
    matchups,
    myFranchiseId: team,
    playersLeft: view.phase === 'final' || !side ? '' : `${ytp} YET TO PLAY`,
    weeks: view.weeks.map((w) => ({ ...w, note: w.notes ? (w.notes[team] ?? '') : w.note })),
  };
}

/**
 * The team the viewer has explicitly chosen, with its name and icon, or null
 * before they've picked one. A choice saved before names and icons were kept
 * is filled in once from the site's /widget.json.
 */
export function useChosenTeam(): TeamMeta | null {
  const [chosen, setChosen] = useState<TeamMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      const id = readTeam();
      if (!id) return setChosen(null);
      const meta = readMeta();
      if (meta?.id === id) return setChosen(meta);
      setChosen({ id, name: '', icon: null });
      fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/widget.json`)
        .then((r) => r.json())
        .then((ctx: { franchises?: Record<string, { name: string; icon?: string }> }) => {
          const f = ctx.franchises?.[id];
          if (!f || cancelled) return;
          const filled = { id, name: f.name, icon: f.icon ?? null };
          try {
            localStorage.setItem(META_KEY, JSON.stringify(filled));
          } catch {
            // Not persisted; looked up again next time.
          }
          setChosen(filled);
        })
        .catch(() => {});
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return chosen;
}
