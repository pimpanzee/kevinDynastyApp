# GRIDLOCK

A mobile-web hub for the MyFantasyLeague dynasty league **The Kevin** (league
`63396`). Four screens — weekly matchups, a matchup box score, franchise
rosters and league standings — built to the Modernist design handoff in
`design_handoff_gridlock/` and wired to the live MFL API.

## Running it

```bash
npm install
cp .env.example .env.local     # adjust if needed
npm run dev                    # http://localhost:3000
```

Open at a 390px viewport — the design is a fixed-width mobile column.

The first page load is slow (roughly 20–30s) while the league settings, player
database, NFL schedule and completed box scores are fetched and written to
`.cache/mfl`. After that, pages render in well under a second and MFL is barely
touched again.

## The simulated clock

The 2026 season has not kicked off, so against 2026 every score and standing is
legitimately zero. To exercise the app's real pre / live / final states it
defaults to reading **2025**, a completed season, through a simulated present:

```
MFL_SEASON=2025
MFL_SIM_NOW=2025-11-16T21:00:00Z
```

`MFL_SIM_NOW` is treated as *now*. Nothing that had not happened by that
instant reaches the UI — a later week is read from the schedule and projections
only, and its results are never fetched. Any page also accepts `?now=<ISO>` to
try a scenario without restarting:

| Scenario | URL |
|---|---|
| Week 11 not yet kicked off | `/matchups?week=11&now=2025-11-12T18:00:00Z` |
| Early games under way | `/matchups?now=2025-11-16T18:30:00Z` |
| Late afternoon, one side pulling clear | `/matchups?now=2025-11-16T21:00:00Z` |
| Week complete | `/matchups?now=2025-11-19T12:00:00Z` |

To point the app at the live 2026 season, set `MFL_SEASON=2026` and clear
`MFL_SIM_NOW`.

## Architecture

```
lib/config.ts      league id, season, franchise, API key, simulated clock
lib/mfl/client.ts  host discovery, JSON, auth, throttling, backoff
lib/mfl/cache.ts   in-memory + on-disk cache, TTL per data volatility
lib/mfl/*.ts       one module per endpoint family, returning clean types
lib/mfl/view.ts    assembles the view models the screens render
app/               server components fetch; client components hold local state
```

MFL blocks cross-domain browser access, so every read happens on the server —
in a server component, or through `app/api/roster` for the franchise switcher,
which swaps teams without leaving the page.

`lib/mfl/client.ts` is the only place that talks to MFL. It resolves the
league's assigned host once (or takes `MFL_HOST`), attaches `JSON=1` and an
`APIKEY` when configured, serialises requests with a minimum gap, and backs off
progressively on a 429 rather than retrying tightly.

## Things that are derived, not reported

MFL does not supply everything the designs show. Where a figure is computed
rather than read, it is marked here and in the code:

- **Standings are computed from weekly results**, not read from
  `TYPE=leagueStandings`. That endpoint always reports the finished season and
  ignores its week parameter, so under a simulated clock it would show a team
  as 12-2 in week 11. Aggregating completed weeks keeps the table honest.
  Verified against MFL's own figures: this league scores the submitted lineup
  (`bestLineup = No`), and `score` decides all 84 regular-season matchups.
- **Power points** are the running sum of each week's optimal-lineup total.
- **Games back** is derived from the win and loss differentials.
- **Win probability** is a normal model over the projected margin (σ ≈ 30
  points), shifted during a live week by what each side still has to come.
  Indicative only — MFL reports no such figure.
- **Projected totals for an unplayed week** assume the manager starts their
  best lineup by projection, subject to the league's real starter limits
  (7–10 starters; QB 1-2, RB 2-5, WR 3-6, TE 1-4).
- **In-progress player scores are prorated** by elapsed game time. MFL keeps no
  historical in-game snapshot, only the final line, so replaying a past week
  models the climb rather than recording it. Against a live season MFL's
  `liveScoring` supplies real in-progress numbers.

Three fields in the roster design were **dropped** rather than invented: ECR,
the 1–5 star matchup rating and bye week. MFL has no source for the first two,
and they were not worth faking. The expand row shows PROJ and PTS.

## Not built yet

Draft tools, trade and waiver analysis, and multi-user accounts are out of
scope (`MFL_API_CONTEXT.md` §9c), as is PWA packaging (§10a). The app is
read-only; no `import` endpoint is ever called.
