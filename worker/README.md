# Live relay

A Cloudflare Worker that lets the static site show live scores on game day.

MFL refuses cross-origin requests from browsers, so the site cannot read live
scores itself. During games the matchup screens poll this Worker once a
minute; the Worker answers from one shared copy of MFL's `liveScoring` that it
refreshes at most every `CACHE_SECONDS` (90). MFL sees about 40 requests an
hour per live week, however many people have the app open. After a 429 the
Worker leaves MFL alone for two minutes and keeps serving the last scores,
marked stale.

The copy lives in a single Durable Object, not the Cache API, which does
nothing on `*.workers.dev` addresses. Durable Objects are on the free plan.

## Setup (once)

1. Create a free Cloudflare account.
2. **My Profile → API Tokens → Create Token →** template **Edit Cloudflare
   Workers**. Copy the token.
3. Copy your **Account ID** (Workers & Pages overview, right-hand column).
4. In GitHub, **Settings → Secrets and variables → Actions → Secrets**, add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. **Actions → Deploy live relay → Run workflow.** The log ends with the
   Worker's URL, e.g. `https://gridlock-live.<you>.workers.dev`.
6. The site defaults to `https://gridlock-live.flynnliam3.workers.dev`
   (`.github/workflows/pages.yml`). If the Worker moves, set the `LIVE_URL`
   variable to the new URL and re-run **Deploy site**.

Live polling only runs against the real clock: set the variables
`MFL_SEASON=2026` and `MFL_SIM_NOW=live`, then re-run both workflows. On a
simulated clock the site replays a past week and never calls the relay.

## API

`GET /live?week=N` →

```json
{ "week": 6, "fetchedAt": 1791297197909, "stale": false,
  "franchises": { "0012": { "score": 78.84, "ytp": 2, "playing": 1, "secondsRemaining": 5400,
    "players": { "15337": [12.3, 1, 1800] } } } }
```

`players` maps id → `[score, isStarter, gameSecondsRemaining]`.

`GET /widget?franchise=ID[&week=N]` feeds the Home Screen widget (`widget/`):
that franchise's matchup (score, projected final, players yet to play), win
odds, and up to 8 recent key plays. It reads the site's `/widget.json`
(`SITE_URL`) for matchups and rosters, the live scores above, and ESPN's
public game summaries for touchdowns and big gains, re-read at most every 2
minutes while games are on (a finished game is read once). `franchise`
defaults to the league's default team, and `week` to the current week. Season and
league come from configuration, never the caller. CORS is granted only to
the site (`SITE_URL`) and `ALLOWED_ORIGINS` in `wrangler.toml`.

`GET /history` is every game the league has played on MFL (2021 on), for
rivalry records and the weekly recap (`src/history.js`):

```json
{ "seasons": { "2025": { "names": { "0001": "Tuna Fish" }, "regEnd": 14, "end": 17,
                         "champion": "0008", "runnerUp": "0001", "complete": true } },
  "games": [[2025, 17, "0008", 162.2, "0001", 77.54, "Playoffs"]] }
```

Each game is `[season, week, home, homeScore, away, awayScore, kind]`, where
`kind` is `regular`, a playoff bracket's name (`Playoffs`, `3rd Place Game`)
or `Consolation`. The relay fills it 8 MFL reads at a time from the
15-minute run, so after the first deploy it takes a few hours to reach 2021.
Finished seasons are read once. This season adds each week once it's played
and re-reads it every 6 hours for a week (stat corrections, which push a
correction alert). Player scores per team
and week are stored too, for the recap, but not served here. `lastFill` says
when the last fill ran and what it read, or the error that stopped it.

`GET /recap/facts[?week=N]` is the fact sheet for a week of this season
(`src/facts.js`), which the weekly recap is written from. It covers results with
the all-time series, high and low scores, lucky and unlucky results, records
broken, the top starters and duds, starters listed as out, points left on benches, streaks, standings
moves, trades and waiver adds (with how each new player was used that week and any injury report),
MFL projections on duds and bench calls, starters on a bye, revenge games against a former team, trade
scoreboards, salary busts and bargains, the best possible lineup, season luck (record vs all-play) and
dropped players who scored for someone else, future firsts and seconds that changed hands (latest
week only, as owned now), and next week's games. It's built from the
stored history plus the season's MFL trades, waiver adds and drops (split by
time: after last week's games ended, up to the end of this week's), next week's schedule,
the week's injury report, projections and NFL schedule, current salaries, and player names, and kept for 6 hours. It defaults to the last stored week.
Until every earlier season is stored, `historyComplete` is false and nothing
claims "all-time" or "league history".

`GET /recap/storylines[?week=N]` is the storyline ledger after a week
(`src/storylines.js`): the season's running stories, carried from week to
week. The bar is high on purpose. Stories open for win or losing streaks of
4 or more, trades that move at least 2 starters, waiver bids of $50 or
more, and teams crossing the playoff line (from week 4). A story gets a
note when something happens to it, such as a followed player scoring 20+
or a starter scoring 1 or less, and closes after 3 quiet weeks.
The AI writer's own changes for a week are kept in `ledgerAi:<season>:<week>`
and replayed too. `forWriter` is the 8 liveliest stories.

`GET /recap[?week=N]` is a stored weekly recap (the latest by default), plus
`weeks`, the weeks that have one.

Recaps are written by a weekly Claude task on the league owner's Claude
plan (no API key or per-call cost), not by the relay. Each Tuesday it:

1. reads `GET /recap/brief[?week=N]`: the instructions (in the
   `RECAP_TONE` voice), the JSON shape (`schema`), the week's fact sheet,
   the storylines, last week's headline and `recentJokes`, lines from the
   last three recaps not to reuse (`src/writer.js`);
2. reads the league lore, a private file in the Claude project
   (`weekly-recap/lore.md`) and the shared Google Doc it points to, where the league adds
   lore. Both are kept out of this public repo and the relay;
   the brief's instructions tell the task where it is (`LORE_FILE`);
3. writes the recap as JSON, under 500 words: headline, a short intro, a
   headline and two or three lines per game, at most 3 storylines, next
   week, and its own changes to the storyline ledger; after saving, it adds
   a lore bit only when something is truly juicy (most weeks, nothing).
   It also reads the league Slack (`SLACK_CHANNELS`, read only) for the
   week's drama;
4. sends drafts to `POST /recap/check?week=N` until `problems` is empty
   (every field present, one paragraph and headline per game, every number
   found in the facts, no banned stock lines such as "Brutal" or "Math
   checks out", and no sentence repeated from `recentJokes`);
5. saves it with `POST /recap/save?week=N`, which needs
   `Authorization: Bearer <RECAP_KEY>`. The relay checks it again, keeps it
   (replacing an earlier one), and stores its ledger changes as
   `ledgerAi:<season>:<week>` for later weeks' storylines. The next alert run
   (from 14:00 UTC Tuesday) pushes it to every owner with recap alerts on.

The voice is `RECAP_TONE`: `roast` (the default), `playful`, `straight`, or
any description of a voice. Change it with the GitHub variable
`RECAP_TONE` and re-run **Deploy live relay**.

**Setup:** make up a long random `RECAP_KEY` (e.g. from a password manager)
and add it in two places: the GitHub repository secret `RECAP_KEY` (then
re-run **Deploy live relay**, which copies it to the Worker), and a network
secret on the Claude cloud environment the weekly task runs in (type
Bearer, allowed website `gridlock-live.flynnliam3.workers.dev`, path prefix
`/recap/save`, header `Authorization`, prefix `Bearer`). The task never
sees the key; Anthropic's proxy adds it to its save request.

## Site rebuild after roster moves

The site is a static build, so rosters on the matchup, team and trade screens
only change when **Deploy site** runs, and GitHub's hourly schedule for it
often skips hours. The 15-minute run (`src/siteRefresh.js`) reads MFL's last
3 days of transactions and, when there is a trade, waiver or free-agent add,
drop, IR or taxi move, auction win or commissioner roster load it hasn't
seen, starts **Deploy site** itself. A move shows on the site within about
20 minutes. The last check is on `GET /history` as `siteRefresh`.

**Setup:** in GitHub, **Settings → Developer settings → Fine-grained
tokens → Generate new token**, repository access *Only select repositories*
→ this repo, permission **Actions: Read and write** (nothing else). Add it as
the repository secret `SITE_REBUILD_TOKEN`, then re-run **Deploy live
relay**, which copies it to the Worker. Without it the relay skips this.

## Write relay (whole league)

Any owner in the league can make moves for their own team from the app.
MFL's API key can't write, so the relay acts with each owner's own MFL login.

**Signing in.** The app's login screen (Settings → MFL account → Sign in)
sends the owner's MFL username and password to `POST /login`. The relay
passes them to MFL's HTTPS login once, gets back MFL's login cookie, checks
with `myleagues` that the account owns a team in `MFL_LEAGUE_ID` (a
commissioner account with no team is refused), and then:

- **never stores the password** (it isn't logged either);
- stores the cookie **encrypted** (AES-256-GCM with the `COOKIE_KEY` secret,
  bound to the team), one per team; signing in again replaces it;
- returns a **session token** for that device, kept only as a SHA-256 hash.
  Sessions end after 180 days unused, at most 10 per owner.

Sign-in is rate limited (8 tries per address and 60 in all per 15 minutes),
so the relay can't be used to guess MFL passwords.

Every other route needs `Authorization: Bearer <session token>` and acts as
that owner: `GET /me` (is the MFL login still good), `GET /mine`,
`GET /waivers`, `GET /trades`, `POST /write`, `GET /audit` (that owner's own
moves) and `/push/*`. `POST /logout` ends this device's session (and its
alerts); `{"all": true}` also forgets the owner's MFL login and ends every
session. A session that no longer works answers `401` with `noSession: true`.

What it will send (`src/relay.js`, `WRITES`), always for league
`MFL_LEAGUE_ID` and never with `FRANCHISE_ID`, so MFL applies each one to the
signed-in owner's own team: `lineup`, `blindBidWaiverRequest`, `fcfsWaiver`
(drops only; every pickup goes through blind bids), `ir`, `taxi_squad`,
`tradeProposal`, `tradeResponse`. Anything else, or any other parameter, is
refused. Commissioner actions are out of scope.

- **No retries.** A timeout or a 429 comes back as `ok: null`, "may or may
  not have gone through"; re-read the roster before trying again.
- **Success is read from MFL's reply body**, since MFL answers failures with
  HTTP 200 and an `<error>`.
- **An expired login stops that owner's writes** (`401`, `signedOut: true`)
  until they sign in again.
- **Live team read:** `GET /mine[?week=N]` returns the owner's roster (with
  IR and taxi), that week's starters and each NFL team's kickoff, read fresh
  from MFL and never cached.
- **Waivers:** `GET /waivers` returns MFL's current free agents and the
  owner's pending blind bids (`pending`, or `null` if MFL's reply couldn't be
  read, in which case the app won't rewrite them). Never cached.
- **Trades:** `GET /trades` returns the owner's trade offers waiting on an
  answer. Never cached.
- **Push alerts, per owner:** Settings → Alerts subscribes a device to the
  signed-in owner's alerts, with its own choice of which ones
  (`GET /push/key`, `POST /push/subscribe`, `/push/unsubscribe`,
  `/push/test`). A run every 15 minutes (`src/alerts.js`) checks each owner
  with a device subscribed: a lineup check 90 minutes before each kickoff
  when a starter in it is out (or the lineup is short or has a bye), a
  starter newly ruled Out/Doubtful/IR, a starter on his team's game-day
  inactives (from ESPN's game roster, looked for in the 85 minutes before his
  kickoff), waiver results, the Tuesday recap (the saved written recap's
  headline and its line on their game, opening the Recap tab; the plain
  result and bench recap instead if none is saved by 19:00 UTC), a stat correction that moved a
  score in their game (found by the history re-reads), and a notice when
  their MFL login expires. League-wide reads are shared across
  owners in a run; pending claims are read with each owner's own login. The
  VAPID keys are made by the relay on first use. On iPhone, push only works
  from the app added to the Home Screen.
- **Audit log:** every write, its parameters, MFL's reply and whose it was.
- **Login lifetime:** a daily run checks every stored login and records when
  each was first seen, last worked and first failed.

```bash
curl -X POST -H 'Content-Type: application/json' https://gridlock-live.flynnliam3.workers.dev/login \
  -d '{"username":"you","password":"…"}'          # → { "session": "…", "franchiseId": "0012" }
curl -H "Authorization: Bearer $SESSION" https://gridlock-live.flynnliam3.workers.dev/me
```

### Setup (once)

1. **`COOKIE_KEY`**: nothing to do. The **Deploy live relay** workflow
   creates it on its first run (32 random bytes, stored only as a Cloudflare
   secret). Changing or deleting it signs everyone out.
2. **Register the app with MFL** (optional, raises MFL's rate limit about
   2.5×): sign in on MFL, open the API Client Registration page from
   [MFL's developer docs](https://api.myfantasyleague.com/2026/api_info), and
   verify by text. Put the User-Agent it gives you in the GitHub variable
   `MFL_USER_AGENT` (no spaces), then re-run **Deploy live relay**.
3. Writes go to `MFL_SEASON`, so that variable must be the real season
   (2026), not a replayed one.

The single-owner secrets from before, `MFL_COOKIE` and `APP_TOKEN`, are no
longer used and can be deleted.

## Local

```bash
cd worker && npx wrangler dev        # http://localhost:8787/live?week=11
```

For the write relay, put `COOKIE_KEY` (`openssl rand -base64 32`) and
`MFL_SEASON=2026` in `worker/.dev.vars` (git-ignored). Build the site with `NEXT_PUBLIC_LIVE_URL=http://localhost:8787` to point it
at the local relay.
