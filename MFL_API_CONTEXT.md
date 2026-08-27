# MyFantasyLeague (MFL) API — Context for Claude Code

Purpose of this doc: give Claude Code everything it needs to build a personal
league hub app (dashboard + draft tools + trade/waiver analysis) against the
MFL Developer API, without re-deriving the API's quirks from scratch.

> League config for this project:
> - `LEAGUE_ID`: `63396`
> - `SEASON`/year: `2026`
> - `FRANCHISE_ID` (your team, 4-digit, e.g. `0001`): `0012`
> - Host server for this league (see "Host discovery" below — resolve once, cache it): _____ (resolve on first run against `https://api.myfantasyleague.com/2026/export?TYPE=league&L=63396&JSON=1`, then cache)

---

## 1. What this API is

- Free, read-oriented XML/JSON API exposed by MyFantasyLeague.com for league data:
  rosters, standings, scoring, draft results, transactions, free agents, live
  scoring, ADP/AAV, NFL schedule/injuries, etc. There's also an **import** side
  for writes (lineups, add/drops, etc.) but this project should default to
  **read-only** unless a specific write feature is explicitly requested.
- No formal API keys/registration required for public data. Private league
  data and any writes require authenticating as a league user (see Auth).
- The API has existed largely unchanged for years; it's XML-first with an
  optional `JSON=1` param for JSON responses (much easier to work with — use
  it everywhere).
- Data updates on MFL's own cadence (player DB ~daily, live scores during
  games, etc.) — this is not a low-latency push API, it's poll/cache.

## 2. URL structure

Two families of endpoint:

```
https://{host}/{year}/export?TYPE={request_type}&{params}&JSON=1   # reads
https://{host}/{year}/import?TYPE={request_type}&{params}          # writes (auth required)
```

- `{year}` — the season, e.g. `2026`. Some endpoints (players, injuries,
  nflSchedule, adp, aav, leagueSearch) are not league-specific and mostly
  year-scoped only.
- `{host}` — see next section. Don't hardcode `api.myfantasyleague.com` for
  league-specific calls in production; resolve the real host once and cache it.
- Always pass `JSON=1` to get JSON instead of XML.
- Non-league requests (players, adp, aav, injuries, nflSchedule, leagueSearch,
  siteNews, topAdds/topDrops/topStarters/topOwns) can use the generic
  `api.myfantasyleague.com` host, which load-balances across MFL's servers.

## 3. Host discovery (important, easy to get wrong)

League-specific requests should NOT be sent to `api.myfantasyleague.com`
long-term — each league lives on a specific numbered server
(`www11.myfantasyleague.com`, `www47.myfantasyleague.com`, etc.). Practical
approach for this app:

1. On first use of a league, call any league-specific export (e.g.
   `TYPE=league`) against `api.myfantasyleague.com`. MFL will resolve/redirect
   this correctly.
2. Inspect the response / follow the redirect to learn the league's actual
   assigned host (this also appears in `leagueSearch` results as `homeURL`,
   e.g. `http://www73.myfantasyleague.com/2020/home/13411`).
3. **Cache that host** (per league + season) and use it directly for all
   subsequent league-specific calls that season. Don't re-resolve on every
   request — that wastes calls and MFL explicitly asks developers to minimize
   unnecessary traffic.

## 4. Authentication

Three tiers, from least to most access:

1. **No auth** — public, non-private league data works with no credentials.
2. **APIKEY param** — a per-user, per-league key available to a logged-in
   league owner from Help → Developer's API on the league site. Pass it as
   `&APIKEY=...` on requests that would otherwise need a login cookie. Good
   fit for a personal app: each teammate who wants "their" view can generate
   their own key rather than sharing a password.
3. **Username/password login flow** — for full parity with the website
   (submitting lineups, add/drops, viewing commissioner-only info as a given
   user):
   - `POST https://api.myfantasyleague.com/{year}/login?USERNAME=...&PASSWORD=...&XML=1`
     (must be HTTPS; GET works but POST is recommended and GET support isn't
     guaranteed long-term).
   - Success returns a `<status cookie_name="cookie_value" .../>` — capture
     both the cookie name and value.
   - Send it back on every subsequent request as an HTTP header:
     `Cookie: {cookie_name}={cookie_value}`. Value is base64 and may contain
     `+ / =` — URL-escape if putting it anywhere that needs escaping.
   - No formal "logout" call — just stop sending/storage-clear the cookie.

**Recommendation for this app:** use the APIKEY approach per user. It avoids
storing raw MFL passwords anywhere in the app, and each teammate can get their
own key from their own MFL account. Store keys server-side (env vars / secure
store), never in client-side code.

## 5. Rate limiting & caching (MFL's stated best practices)

- If a request fails or you get a 429, **do not retry immediately** — back off.
- Cache aggressively based on how often data actually changes:
  - Player database: ~once/day.
  - League rules/settings: effectively static within a season — cache for the
    session or refetch daily at most.
  - Rosters/standings/transactions: fine to poll every few minutes during
    active windows (draft night, waiver day), much less otherwise.
  - Live scoring: only poll frequently *during live NFL games*; there's no
    reason to hit it Tuesday morning.
- Don't request data that can't have changed (e.g. don't ask for week 5 stats
  during week 3).
- For non-league-specific calls, use `api.myfantasyleague.com` so MFL can load
  balance; for league-specific calls, use the resolved host (see §3).
- This is a hobby/personal-use integration for a handful of users — polling
  every 5–15 min for live data and hourly/daily for static data is more than
  sufficient and stays well inside acceptable use.

## 6. Response shape

With `JSON=1`, responses are JSON but keep MFL's XML-derived structure —
expect a lot of singular/plural nesting like `{"players": {"player": [...]}}`
and everything-is-a-string values (IDs, scores, etc. often come back as
strings, not numbers — parse defensively). Build a thin normalization layer
rather than trusting raw shapes directly in UI code.

## 7. Core endpoints (export, `TYPE=...`)

All league-specific ones need `L={LEAGUE_ID}`.

| TYPE | Scope | Key params | Returns |
|---|---|---|---|
| `league` | league | `L`, optional `FRANCHISE_ID`, `PASSWORD` | League settings, roster/lineup requirements, franchise list. With valid owner auth, also owner contact info. |
| `rules` | league | `L` | Full scoring rules (pair with `allRules` for abbreviation meanings). |
| `allRules` | global | — | Master list of all scoring rule abbreviations MFL supports. |
| `rosters` | league | `L`, optional `FRANCHISE` | Current rosters incl. status (active/IR/taxi) and salary/contract if applicable. |
| `leagueStandings` | league | `L` | Standings incl. W/L/T, points for/against, power rank, all-play record, etc. |
| `weeklyResults` | league | `L`, `W` (week, or `YTD`) | Full box scores for a week — starters and bench. |
| `liveScoring` | league | `L`, `W`, `DETAILS=1` for bench | In-progress scores during games, seconds remaining, live/upcoming players. |
| `playerScores` | league | `L`, `W` (or `YTD`/`AVG`), `PLAYERS`, `POSITION`, `STATUS=freeagent`, `COUNT` | Per-player fantasy points in this league's scoring. |
| `projectedScores` | league | `L`, `PLAYERS` (required), `W`, `POSITION`, `STATUS`, `COUNT` | Projected points (sourced from FantasySharks) in league scoring. |
| `draftResults` | league | `L` | Rookie/startup draft picks. |
| `auctionResults` | league | `L` | Auction draft results incl. nominating/winning team and bid. |
| `futureDraftPicks` | league | `L` | Traded/owned future picks — useful for dynasty trade tooling. |
| `freeAgents` | league | `L`, `POSITION` | Available free agents. |
| `transactions` | league | `L`, `TRANS_TYPE` (`waiver`,`bbid_waiver`,`trade`,`ir`,`taxi`,`bbid_waiver_request`,`survivor_pick`,`pool_pick`), `FRANCHISE`, `DAYS`, `COUNT` | Transaction log — good source for a trade/waiver history view. |
| `assets` | league | `L` | All tradeable assets per franchise (players + current/future picks) — very useful for trade analysis tooling. |
| `tradeBait` | league | `L` | Players/picks franchises have flagged as available. |
| `accounting` | league | `L` | League financial/salary-cap ledger, if used. |
| `salaryAdjustments` | league | `L` | Salary cap adjustments, if used. |
| `pointsAllowed` | league | `L` | Fantasy points allowed by each NFL team, by position — useful for start/sit and streaming tools. |
| `calendar` | league | `L` | League event calendar (draft date, waiver days, etc.). |
| `playoffBrackets` | league | `L` | Playoff bracket structure/results. |
| `messageBoard` / `messageBoardThread` | league | `L`, `COUNT` / `THREAD` | League message board content. |
| `players` | global | `PLAYERS`, `SINCE`, `DETAILS=1` | Master player DB — names, teams, positions, IDs. Nearly everything else references player IDs from here. Cache ~daily. |
| `playerProfile` | global | `P` | DOB/age/height/weight/ADP for given players. |
| `playerStatus` | league | `L`, `P` | Whether given players are locked / free agent / rostered in this league. |
| `injuries` | global | `W` | Official NFL injury report. |
| `nflSchedule` | global | `W` | NFL game schedule/results, incl. spreads and off/def rankings. |
| `adp` | global | `FRANCHISES`, `IS_MOCK`, `IS_PPR`, `IS_KEEPER`, `TIME`, `DAYS` | Average draft position — good for a draft-assistant/rankings feature. |
| `aav` | global | `FRANCHISES` | Average auction value. |
| `topAdds` / `topDrops` / `topStarters` / `topOwns` | global | `W` | Site-wide trending player activity. |
| `whoShouldIStart` | global/league | `L`, `F`, `W`, `PLAYERS` | Crowd-sourced start/sit comparisons. |
| `leagueSearch` | global | `SEARCH` (≥3 chars) | Find leagues by name/commish or owner email — also reveals a league's assigned host (`homeURL`). |
| `rss` | league | `L` | Combined RSS feed: standings, live scoring, last week's results, latest board posts. |
| `siteNews` | global | — | MFL site news RSS. |

This list covers everything needed for the "all-in-one league hub" scope
(dashboard, draft tools, trade/waiver analysis). Full canonical list/params
live at `https://api.myfantasyleague.com/{year}/api_info` if something new is
needed later — that page is not scrapeable by automated tools (robots-blocked)
so a human needs to check it manually in a browser if we hit a gap.

## 8. Import (write) endpoints — only if/when needed

Same `import?TYPE=...` pattern, always requires auth (cookie or APIKEY),
always POST for anything with real payload. Examples: `submitLineup`,
`waiver`/`bbidWaiver`, `addDrop`, `tradeProposal`. **Do not build write
features unless explicitly asked** — this project is scoped as a read-mostly
companion app, not a lineup-submission replacement.

## 9. Scope

### v1 (build this first)

Single user (you), manual refresh (no polling/live-push), PWA.

- **League standings** — `leagueStandings`.
- **Weekly matchups (all games)** — `weeklyResults` for the selected week, or
  `liveScoring` when the selected week is the current/in-progress week (see
  §9a below for how "live" works with manual refresh).
- **Matchup detail** (one matchup, full box score: every starter + bench
  player, live or final score) — `weeklyResults`/`liveScoring` for the two
  franchises in that matchup, joined against `players` for names/positions.
- **Rosters** — `rosters` + `players` (joined for name/team/position), grouped
  by position, including salary/contract fields (this league uses a salary
  cap). Defaults to the user's own franchise (`FRANCHISE_ID` above); includes
  a franchise switcher to view any other franchise's roster. No trade action —
  that's v2+ (§9c).
- **Bottom tab navigation**: three tabs — **Matchups**, **Rosters**,
  **Standings** — persistent across all v1 pages except Matchup Detail, which
  is reached by drilling into a matchup and returns via back action rather
  than a tab.

Everything else — draft tools, trade/waiver analysis, multi-user login — is
explicitly **out of scope for v1**. Design the data layer so those are
additive later (see §9c), but don't build UI for them yet.

### 9a. "Live" with manual refresh

No background polling in v1 — the user taps refresh and the app re-fetches.
"Live" just means: when the selected week is the current NFL week and games
are in progress, hit `liveScoring` (not `weeklyResults`) on that refresh, so
the score shown is up to the moment of the tap. Once a week is final,
`weeklyResults` is the source of truth and can be cached harder (final scores
don't change).

### 9b. Multi-user login (planned, not v1)

You want leaguemates to eventually log in and use the app. Two viable models
when you get there:
- **Per-user APIKEY**: each teammate generates their own MFL APIKEY and pastes
  it in once; app stores it server-side keyed to their account. No MFL
  password ever touches your app.
- **MFL username/password login flow** (§4, tier 3): closer to "real" auth
  but means handling MFL credentials, even briefly, on your backend.

Recommend the APIKEY model when you build this — simpler, safer, and MFL
explicitly designed it for third-party apps like this. Nothing in v1 blocks
this later, but don't build a login/accounts system now.

### 9c. Later (v2+)

- **Draft tools**: `adp`/`aav`, `draftResults`/`auctionResults`, `injuries`.
- **Trade/waiver analysis**: `assets`, `tradeBait`, `transactions`
  (`TRADE`/`WAIVER`), `freeAgents`, `playerScores`/`projectedScores`. Includes
  adding the "Trade" action back onto the Rosters page.
- **Multi-user accounts** (§9b).

## 10. Practical build notes for Claude Code

- **Stack**: Next.js (App Router) — React frontend + its own API routes acting
  as the thin backend/relay to MFL. One deployable, one codebase, and it's the
  natural fit for both the PWA requirement (§10a) and the hosting target
  (§10b).
- MFL does not allow cross-domain browser JS access from outside its own
  domain, so calls must originate from your backend and be relayed to the
  client — don't try to call MFL directly from frontend JS. Next.js API routes
  are the right place for the `mflClient` module from §5/§7.
- No cron/background jobs needed for v1 (manual refresh, §9a) — keep it
  simple: API route hits MFL on request, returns normalized JSON, done.

### 10a. PWA

Goal: installable to a phone home screen, opens full-screen (no browser
chrome), works without an app store.
- `manifest.json` with `display: "standalone"`, app name, theme color, and
  icon set (need at minimum 192×192 and 512×512 PNG icons — pull these from
  the Claude Design mockups' branding once finalized).
- A minimal service worker for installability + basic asset caching. Since v1
  is manual-refresh and not offline-first, the service worker doesn't need to
  cache live MFL data — just make the app shell installable and fast to
  reopen. `next-pwa` (or Next's built-in PWA support, whichever is current
  when Claude Code builds this — worth a quick check at build time) is the
  standard way to wire this into Next.js.
- iOS home-screen install needs the `apple-touch-icon` link tag and
  `apple-mobile-web-app-capable` meta tag specifically — Android's PWA install
  prompt behavior differs from iOS's "Add to Home Screen," so test both if
  you and teammates are on different phones.

### 10b. Hosting

**Recommendation: Vercel free tier.** It's the native host for Next.js (zero
config deploy), has a generous free tier for a single-league personal app's
traffic, handles HTTPS automatically (MFL's login flow requires HTTPS — §4),
and needs no server maintenance. Self-hosting (e.g. a Raspberry Pi or a VPS)
is the alternative if you'd rather not have anything on a third-party
platform, but it adds ongoing maintenance (uptime, HTTPS certs, updates) for
no real benefit at this scale — Vercel is the better default unless you have
a specific reason to self-host.

- Store `LEAGUE_ID`, `SEASON`, and your `APIKEY` as Vercel environment
  variables (never committed to the repo).
- Everything in §5 (caching) still applies even without polling — e.g. cache
  the `players` DB response in a Vercel KV store or even just a static JSON
  file regenerated daily, rather than re-fetching it on every manual refresh.
- Central `mflClient` module: one place that knows the resolved host, injects
  `JSON=1`, attaches auth (cookie or APIKEY), and applies the caching rules
  from §5. Everything else in the app should call through it, not hit MFL
  directly.
- Normalize MFL's XML-ish JSON shapes into clean typed objects at the client
  boundary (see §6) so UI code isn't full of defensive `?.player?.[0]` chains.
- Store the resolved per-league host and the player DB snapshot locally
  (file/db/KV — whatever fits the stack) so a normal run doesn't need to hit
  MFL for static data at all.
- Config: `LEAGUE_ID`, `SEASON`, and per-user `APIKEY` (or username/password
  for the login flow) should be environment/config values, never hardcoded.
