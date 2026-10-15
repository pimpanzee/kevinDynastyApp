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
   variable to the new URL and re-run **Deploy to GitHub Pages**.

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
`ALLOWED_ORIGINS` in `wrangler.toml`.

## Write relay (solo)

`GET /me`, `POST /write` and `GET /audit` let the app make moves on MFL as
you. They answer only requests carrying `Authorization: Bearer <APP_TOKEN>`.
MFL's API key can't write, so the relay uses your MFL login cookie, held as a
Cloudflare secret. Your password is never stored anywhere.

What it will send (`src/relay.js`, `WRITES`), always for league
`MFL_LEAGUE_ID` and never with `FRANCHISE_ID`, so MFL applies each one to your
own team: `lineup`, `blindBidWaiverRequest`, `fcfsWaiver` (drops only; every
pickup goes through blind bids), `ir`, `taxi_squad`, `tradeProposal`,
`tradeResponse`. Anything else, or any other parameter, is refused.

- **No retries.** A timeout or a 429 comes back as `ok: null`, "may or may
  not have gone through"; re-read the roster before trying again.
- **Success is read from MFL's reply body**, since MFL answers failures with
  HTTP 200 and an `<error>`.
- **An expired login stops writes** (`401`, `signedOut: true`) until the
  cookie is replaced.
- **Live team read:** `GET /mine[?week=N]` returns your roster (with IR and
  taxi), that week's starters and each NFL team's kickoff, read fresh from MFL
  and never cached. The lineup screen (My Team → SET LINEUP) uses it.
- **Audit log:** every write, its parameters and MFL's reply, kept in the
  relay's Durable Object. `GET /audit` returns the last 100.
- **Login lifetime:** a daily scheduled run calls `/me`, which records when the
  current cookie was first seen, last worked and first failed
  (`cookie.firstSeen`, `lastOk`, `expiredAt`). That answers how long an MFL
  login lasts.

```bash
curl -H "Authorization: Bearer $APP_TOKEN" https://gridlock-live.flynnliam3.workers.dev/me
curl -X POST -H "Authorization: Bearer $APP_TOKEN" https://gridlock-live.flynnliam3.workers.dev/write \
  -d '{"type":"ir","params":{"DEACTIVATE":"15337"}}'
```

### Setup (once)

1. **Register the app with MFL** (optional, raises MFL's rate limit about
   2.5×): sign in on MFL, open the API Client Registration page from
   [MFL's developer docs](https://api.myfantasyleague.com/2026/api_info), and
   verify by text. Put the User-Agent it gives you in the GitHub variable
   `MFL_USER_AGENT` (no spaces), then re-run **Deploy live relay**.
2. **Get your MFL cookie** on your own computer:
   `node scripts/mfl-login.mjs 2026`. Add what it prints as the secret
   `MFL_COOKIE` (Cloudflare → Workers & Pages → gridlock-live → Settings →
   Variables and Secrets → Add, type Secret).
3. **Add `APP_TOKEN`** the same way: a long random string, e.g. from
   `openssl rand -hex 32`. The app will send it; keep a copy for your phone.
4. Check: the `/me` call above should say `"signedIn": true` with your
   franchise. Writes go to `MFL_SEASON`, so that variable must be the real
   season (2026), not a replayed one.

When a login expires, run step 2 again and replace `MFL_COOKIE`.

## Local

```bash
cd worker && npx wrangler dev        # http://localhost:8787/live?week=11
```

For the write relay, put `MFL_COOKIE`, `APP_TOKEN` and `MFL_SEASON=2026` in
`worker/.dev.vars` (git-ignored). Build the site with `NEXT_PUBLIC_LIVE_URL=http://localhost:8787` to point it
at the local relay.
