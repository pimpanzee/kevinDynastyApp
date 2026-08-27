/**
 * League configuration. Everything here is overridable by environment so the
 * league, season and simulated clock can change without touching code
 * (MFL_API_CONTEXT.md §10b — never hardcode these in committed source).
 */

export const LEAGUE_ID = process.env.MFL_LEAGUE_ID ?? '63396';

/**
 * Season to read. Defaults to 2025 — a completed season — so the app has real
 * pre/live/final data to render. The 2026 season has not kicked off yet, so
 * against 2026 every score and standing is legitimately zero.
 */
export const SEASON = process.env.MFL_SEASON ?? '2025';

/** The user's own franchise. Rosters default to it; matchups lead with it. */
export const FRANCHISE_ID = process.env.MFL_FRANCHISE_ID ?? '0012';

/**
 * Optional per-user API key (MFL_API_CONTEXT.md §4, tier 2). Nothing in v1
 * requires it — rosters, standings, schedule and projections are all public —
 * but it is attached to every request when present, so private-league data and
 * owner-only fields work without a rewrite. Generate one from the league site
 * under Help → Developer's API. Server-side only: never expose to the client.
 */
export const APIKEY = process.env.MFL_APIKEY ?? '';

/**
 * Simulated "now", as an ISO timestamp. When set, the app treats this instant
 * as the present and refuses to surface anything that had not happened by then
 * — so a completed season can be replayed through its pre / live / final
 * states. Unset means use real wall-clock time.
 *
 * Default lands mid-afternoon on the Week 11 Sunday of 2025: the early games
 * are final, the late slate has not kicked off. That is the live state the
 * designs were drawn against.
 */
export const SIM_NOW = process.env.MFL_SIM_NOW ?? '2025-11-16T21:00:00Z';

/** Generic host. Used for host discovery and non-league-specific requests. */
export const GENERIC_HOST = 'https://api.myfantasyleague.com';

/** How long a completed NFL game takes, for deciding if it is still in play. */
export const GAME_DURATION_MS = 3 * 60 * 60 * 1000 + 15 * 60 * 1000;
