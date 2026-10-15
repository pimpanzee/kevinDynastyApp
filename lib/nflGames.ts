'use client';

import { useEffect, useState } from 'react';
import type { BoxPlayerView } from '@/lib/types';

/**
 * NFL game scores for the matchup page's game line ("W 31-17 vs DAL"), read
 * from Sleeper's public scores feed — the same source as the live stats, and
 * likewise open to cross-origin reads, so the browser fetches it directly.
 */

/** Sleeper team codes back to MFL's, where they differ (the reverse of TEAM_CODES in lib/stats/sleeper.ts). */
const MFL_TEAM_CODES: Record<string, string> = {
  GB: 'GBP', JAX: 'JAC', KC: 'KCC', LV: 'LVR', NE: 'NEP', NO: 'NOS', SF: 'SFO', TB: 'TBB',
};

/** One team's game, from its own side. */
export interface NflScore {
  us: number;
  them: number;
  state: 'pre' | 'in' | 'post';
}

interface RawGame {
  metadata?: {
    home_team?: string;
    away_team?: string;
    home_score?: number;
    away_score?: number;
    is_over?: boolean;
    is_in_progress?: boolean;
  };
}

/** The feed as a map from MFL team code to that team's game. */
function byTeam(games: RawGame[]): Map<string, NflScore> {
  const out = new Map<string, NflScore>();
  for (const g of games) {
    const m = g.metadata;
    if (!m?.home_team || !m.away_team) continue;
    const state = m.is_over ? 'post' : m.is_in_progress ? 'in' : 'pre';
    const home = m.home_score ?? 0;
    const away = m.away_score ?? 0;
    out.set(MFL_TEAM_CODES[m.home_team] ?? m.home_team, { us: home, them: away, state });
    out.set(MFL_TEAM_CODES[m.away_team] ?? m.away_team, { us: away, them: home, state });
  }
  return out;
}

/** Sleeper updates scores through the game; every two minutes, as for stats. */
const POLL_MS = 2 * 60 * 1000;

/**
 * The week's NFL scores by team: read once when the page opens, then every
 * two minutes while one of `spans` (games being played) contains now and the
 * tab is visible. Null before kickoff (no url) or until the first read lands.
 */
export function useNflScores(url: string | undefined, spans: Array<[number, number]> | null): Map<string, NflScore> | null {
  const [scores, setScores] = useState<Map<string, NflScore> | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const controller = new AbortController();

    const read = async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as RawGame[];
        if (!cancelled && Array.isArray(body)) setScores(byTeam(body));
      } catch {
        // Keep what we have; the game line falls back to the opponent alone.
      }
    };
    const poll = () => {
      const now = Date.now();
      if (!document.hidden && spans?.some(([start, end]) => now >= start && now <= end)) read();
    };

    read();
    const timer = spans ? setInterval(poll, POLL_MS) : undefined;
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Inputs come from the build and never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return scores;
}

/**
 * A player's NFL game, under his status line: "W 31-17 vs DAL" once his game
 * is final, "17-14 @ LAR" while it's on, "vs ARI" before kickoff (or whenever
 * there's no score to show). On a simulated clock a game in play shows only
 * its opponent — the feed's score would be the final, which hadn't happened.
 */
export function gameLine(p: BoxPlayerView, scores: Map<string, NflScore> | null, simulated: boolean): string {
  const g = p.live;
  if (!g?.opp) return '';
  const opponent = `${g.home ? 'vs' : '@'} ${g.opp}`;
  const s = scores?.get(g.team);
  if (!s) return opponent;
  if (p.line.includes('FINAL') && s.state === 'post') {
    const result = s.us > s.them ? 'W' : s.us < s.them ? 'L' : 'T';
    return `${result} ${s.us}-${s.them} ${opponent}`;
  }
  if (p.line.includes('in play') && !simulated && s.state !== 'pre') return `${s.us}-${s.them} ${opponent}`;
  return opponent;
}
