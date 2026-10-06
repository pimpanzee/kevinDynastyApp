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
6. Under **Variables**, add `LIVE_URL` with that URL, then re-run **Deploy to
   GitHub Pages** so the site picks it up.

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

`players` maps id → `[score, isStarter, gameSecondsRemaining]`. Season and
league come from configuration, never the caller. CORS is granted only to
`ALLOWED_ORIGINS` in `wrangler.toml`.

## Local

```bash
cd worker && npx wrangler dev        # http://localhost:8787/live?week=11
```

Build the site with `NEXT_PUBLIC_LIVE_URL=http://localhost:8787` to point it
at the local relay.
