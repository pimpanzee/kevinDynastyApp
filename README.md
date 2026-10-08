# The Liam

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

`npm run build` writes a fully static site to `out/` (about 90s from a cold
cache); `npm start` serves it.

## GitHub Pages

The site is published to GitHub Pages by `.github/workflows/pages.yml`. Pages
cannot run a server, so the app is a static export: every screen is rendered
from MFL at build time, and the workflow rebuilds it on every push to `main`,
every hour, and on demand (Actions → Deploy to GitHub Pages → Run
workflow).

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions.**

League settings are read from repository variables (Settings → Secrets and
variables → Actions → Variables), falling back to the `.env.example` values:
`MFL_LEAGUE_ID`, `MFL_FRANCHISE_ID`, `MFL_SEASON`, `MFL_SIM_NOW`, `MFL_HOST`,
`MFL_REQUEST_GAP_MS`. `MFL_APIKEY`, if needed, goes in as a secret. To follow
the live 2026 season, set `MFL_SEASON=2026` and `MFL_SIM_NOW=live`.

Because pages are prebuilt, the published site shows what MFL said at the last
build — up to an hour old — and the matchup screens cover the weeks the
week picker offers. Lineups and live scores are the exception: until a week is
over, the matchup screens read them from the live relay (worker/) every minute
or two, so a lineup change shows within a couple of minutes.

## Home Screen widget

`widget/` is a Scriptable widget for the iPhone Home Screen and Lock Screen,
showing the live matchup and the latest touchdowns and big plays. Setup is in
`widget/README.md`.

## Live scores on game day

Between rebuilds, the matchup screens keep scores current themselves. From the
week's first kickoff to the end of its last game they poll a small Cloudflare
Worker (`worker/`) every minute, and `lib/live.ts` patches scores, win odds,
yet-to-play counts and player lines into the prebuilt page. The Worker holds one
shared copy of MFL's `liveScoring` and refreshes it at most every 90 seconds, so
MFL's traffic stays flat however many people are watching.

Setup is in `worker/README.md`: Cloudflare secrets, then the `LIVE_URL`
variable. It only runs against the real clock (`MFL_SIM_NOW=live`); nothing
polls while replaying a simulated week. Lineup changes after a build (who
starts) reach the matchup detail rows at the next rebuild.

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
only, and its results are never fetched. Pages are rendered ahead of time, so
to try another scenario change `MFL_SIM_NOW` and restart (or rebuild):

| Scenario | `MFL_SIM_NOW` |
|---|---|
| Week 11 not yet kicked off | `2025-11-12T18:00:00Z` |
| Early games under way | `2025-11-16T18:30:00Z` |
| Late afternoon, one side pulling clear | `2025-11-16T21:00:00Z` |
| Week complete | `2025-11-19T12:00:00Z` |

To point the app at the live 2026 season, set `MFL_SEASON=2026` and set
`MFL_SIM_NOW=live` (or clear it).

## Architecture

```
lib/config.ts      league id, season, franchise, API key, simulated clock
lib/mfl/client.ts  host discovery, JSON, auth, throttling, backoff
lib/mfl/cache.ts   in-memory + on-disk cache, TTL per data volatility
lib/mfl/*.ts       one module per endpoint family, returning clean types
lib/mfl/view.ts    assembles the view models the screens render
lib/stats/         box-score stats from Sleeper, joined to MFL players
lib/scoring.ts     scores a stat line with the league's MFL rules (byline + breakdown)
app/               server components fetch at build; client components hold local state
```

MFL blocks cross-domain browser access, so every read happens at build time —
in a server component, or in `app/api/roster/[franchise]`, which writes one
roster JSON file per team for the franchise switcher to fetch, so it can swap
teams without leaving the page.

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
- **In-progress player scores are prorated** by elapsed game time, under a
  simulated clock only. MFL keeps no historical in-game snapshot, only the
  final line, so replaying a past week models the climb rather than recording
  it. On the real clock MFL's numbers are used as reported, and the browser
  keeps them current from `liveScoring`.
- **Box-score stat lines and score breakdowns come from Sleeper**, not MFL.
  MFL reports each player's points but not the stats behind them, so Matchup
  Detail reads weekly stats from Sleeper's public API (no key), joins players
  on the Sportradar id both databases carry, and scores them with this league's
  MFL `rules`. Checked against MFL's weekly results for 2025 weeks 2, 4, 11
  and 15, the two agree to the hundredth for every player. Any gap (a stat
  correction, or live data from the two arriving at different times) shows as
  an "Other" row so a breakdown always adds up to the score shown. During live
  games the browser re-reads Sleeper every two minutes; under a simulated
  clock a player still in play shows no stat line, since only final stats
  exist.

Three fields in the roster design were **dropped** rather than invented: ECR,
the 1–5 star matchup rating and bye week. MFL has no source for the first two,
and they were not worth faking. The expand row shows PROJ and PTS.

## Not built yet

Draft tools, trade and waiver analysis, and multi-user accounts are out of
scope (`MFL_API_CONTEXT.md` §9c), as is PWA packaging (§10a). The app is
read-only; no `import` endpoint is ever called.
