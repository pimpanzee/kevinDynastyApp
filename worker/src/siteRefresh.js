/**
 * Rebuild the site soon after a roster move.
 *
 * The site is a static build, so rosters on the matchup, team and trade
 * screens only change when "Deploy site" runs. GitHub's hourly schedule for
 * it is unreliable (runs are often hours apart), so a trade could take half
 * a day to show. The relay's 15-minute run checks MFL's transactions instead
 * and, when there is one it hasn't seen, starts the workflow itself.
 *
 * Needs SITE_REBUILD_TOKEN: a GitHub token that can run workflows on the
 * repository (README). Without it this does nothing.
 */

/**
 * Transactions that move a player onto, off or around a roster. MFL's
 * TRANS_TYPE filter refuses IR and TAXI, so all types are read (`*`) and
 * filtered here. LOAD_ROSTERS is the commissioner editing rosters directly.
 */
export const ROSTER_MOVES = new Set(['TRADE', 'BBID_WAIVER', 'FREE_AGENT', 'WAIVER', 'IR', 'TAXI', 'AUCTION_WON', 'LOAD_ROSTERS']);

/** Newest roster move in an MFL transactions export, as ms (0 when none). */
export function latestMove(body) {
  const raw = body?.transactions?.transaction;
  const all = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return all
    .filter((x) => ROSTER_MOVES.has(x?.type))
    .reduce((t, x) => Math.max(t, (Number(x.timestamp) || 0) * 1000), 0);
}

/** Starts the site's deploy workflow on main. Throws with GitHub's reason on failure. */
export async function dispatchRebuild(env, fetchImpl = fetch) {
  const repo = env.SITE_REPO || 'pimpanzee/kevinDynastyApp';
  const workflow = env.SITE_WORKFLOW || 'pages.yml';
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SITE_REBUILD_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gridlock-live',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
    signal: AbortSignal.timeout(10 * 1000),
  });
  if (res.status !== 204) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * One check: `seen` is the newest move already rebuilt for (undefined on the
 * first run, which only takes note). Returns the new state and whether a
 * rebuild is due.
 */
export function decide(seen, latest) {
  if (seen === undefined) return { seen: latest, rebuild: false };
  return latest > seen ? { seen: latest, rebuild: true } : { seen, rebuild: false };
}
