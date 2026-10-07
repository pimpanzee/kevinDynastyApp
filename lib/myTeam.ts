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
const EVENT = 'gridlock:team';

export function readTeam(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveTeam(id: string): void {
  try {
    localStorage.setItem(KEY, id);
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
