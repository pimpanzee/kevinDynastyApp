'use client';

import { useEffect, useState } from 'react';

/**
 * Live game situations for the matchup page's field-position slider: the
 * clock, who has the ball, where, and the down. Read from ESPN's public
 * scoreboard, which is open to cross-origin reads, so the browser fetches it
 * directly (Sleeper's scores feed, used for the game line, has none of this).
 */

const URL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/** ESPN team codes to MFL's, where they differ. */
const MFL_CODES: Record<string, string> = {
  GB: 'GBP', JAX: 'JAC', KC: 'KCC', LV: 'LVR', NE: 'NEP', NO: 'NOS', SF: 'SFO', TB: 'TBB', WSH: 'WAS',
};
/** MFL team code as fans write it: GBP → GB, LVR → LV, WAS stays WAS. */
export const shortTeam = (mfl: string) =>
  Object.entries(MFL_CODES).find(([espn, m]) => m === mfl && espn !== 'WSH')?.[0] ?? mfl;

/** One team's live game, from its own side. */
export interface GameSituation {
  /** "Q4 9:21", "Half", "End Q3", "OT 4:10". */
  clock: string;
  /** True while this team has the ball, false while the other team has it, null between plays that hand it over. */
  offense: boolean | null;
  /** Ball spot in yards from this team's own goal line (0-100), while on offense. */
  ball?: number;
  /** "3rd & 7", "1st & Goal". */
  down?: string;
  /** "ARI 34". */
  spot?: string;
  redZone?: boolean;
}

interface RawCompetitor { homeAway?: string; team?: { id?: string; abbreviation?: string } }
interface RawEvent {
  status?: { displayClock?: string; period?: number; type?: { name?: string; state?: string } };
  competitions?: Array<{
    competitors?: RawCompetitor[];
    situation?: { possession?: string; yardLine?: number; shortDownDistanceText?: string; possessionText?: string; isRedZone?: boolean };
  }>;
}

const quarter = (p: number) => (p > 4 ? (p === 5 ? 'OT' : `${p - 4}OT`) : `Q${p}`);

function clockText(s: NonNullable<RawEvent['status']>): string {
  const p = s.period ?? 0;
  const name = s.type?.name ?? '';
  if (name === 'STATUS_HALFTIME') return 'Half';
  if (name === 'STATUS_END_PERIOD') return `End ${quarter(p)}`;
  return `${quarter(p)} ${s.displayClock ?? ''}`.trim();
}

/** The feed as a map from MFL team code to that team's game in progress. */
export function situations(events: RawEvent[]): Map<string, GameSituation> {
  const out = new Map<string, GameSituation>();
  for (const e of events) {
    if (e.status?.type?.state !== 'in') continue;
    const c = e.competitions?.[0];
    const teams = c?.competitors ?? [];
    const home = teams.find((t) => t.homeAway === 'home');
    const away = teams.find((t) => t.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;
    const clock = clockText(e.status);
    const sit = c?.situation;
    const holder = sit?.possession;
    for (const [us, isHome] of [[home, true], [away, false]] as const) {
      const code = MFL_CODES[us.team!.abbreviation!] ?? us.team!.abbreviation!;
      const offense = holder ? holder === us.team!.id : null;
      // ESPN's yardLine counts from the home team's goal line.
      const ball = offense && typeof sit?.yardLine === 'number' ? (isHome ? sit.yardLine : 100 - sit.yardLine) : undefined;
      out.set(code, {
        clock, offense,
        ...(offense && { ball, down: sit?.shortDownDistanceText, spot: sit?.possessionText, redZone: !!sit?.isRedZone }),
      });
    }
  }
  return out;
}

/** The field moves play by play; every 30 seconds while games are on. */
const POLL_MS = 30 * 1000;

/**
 * The week's games in progress by team: read once when the page opens, then
 * every 30 seconds while one of `spans` (games being played) contains now and
 * the tab is visible. Off (null) on a simulated clock, where real-time game
 * state would be from the wrong moment.
 */
export function useSituations(season: string | number, week: number, spans: Array<[number, number]> | null, simulated: boolean): Map<string, GameSituation> | null {
  const [games, setGames] = useState<Map<string, GameSituation> | null>(null);
  useEffect(() => {
    if (simulated || !spans) return;
    let cancelled = false;
    const controller = new AbortController();
    const url = `${URL_BASE}?seasontype=2&week=${week}&dates=${season}`;

    const read = async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { events?: RawEvent[] };
        if (!cancelled && Array.isArray(body.events)) setGames(situations(body.events));
      } catch {
        // Keep what we have; rows fall back to "Live" without a slider.
      }
    };
    const live = () => {
      const now = Date.now();
      return spans.some(([start, end]) => now >= start && now <= end);
    };
    const poll = () => { if (!document.hidden && live()) read(); };

    if (live()) read();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Inputs come from the build and never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, week, simulated]);
  return games;
}
