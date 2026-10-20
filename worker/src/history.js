/**
 * The league's history: every game since the league started on MFL (2021),
 * kept in the relay's storage so rivalry records, all-time records and the
 * weekly recap don't need MFL to answer dozens of requests each time.
 *
 * Finished seasons never change, so they're read once. The current season
 * adds each week once it's played, and re-reads the last two played weeks
 * once a day for a week afterwards (MFL stat corrections).
 *
 * The pure functions here turn MFL exports into rows; HistoryStore reads MFL
 * a few requests at a time (every 15 minutes, from the scheduled run) and
 * stores them. All of it is public league data: no owner login is needed.
 */

import { list } from './alerts.js';

/** MFL requests per scheduled run, so a backfill never bursts MFL. */
export const READS_PER_RUN = 8;
/** How long after a week is played its results are re-read (stat corrections). */
const CORRECTION_DAYS = 7;
/** How long after its last kickoff a week counts as played. */
const GAME_TAIL_MS = 4 * 3600 * 1000;

/**
 * A season's basics from a `league` export: team names, the last regular
 * season week, the last week, and the earlier seasons MFL lists.
 */
export function readLeague(body) {
  const l = body?.league ?? {};
  const names = {};
  for (const f of list(l.franchises?.franchise)) names[f.id] = String(f.name ?? '').trim();
  return {
    names,
    regEnd: Number(l.lastRegularSeasonWeek) || 0,
    end: Number(l.endWeek) || 0,
    seasons: list(l.history?.league).map((h) => Number(h.year)).filter(Boolean).sort((a, b) => a - b),
  };
}

/**
 * The games of a week from a `weeklyResults` export, as
 * { games: [{ home, away, homeScore, awayScore, regular }], teams: { id: { score, players } } }.
 * `players` is "id:score:s" per player, s = 1 for a starter, joined by commas.
 */
export function readWeek(body) {
  const w = body?.weeklyResults ?? {};
  const games = [];
  const teams = {};
  const side = (f) => {
    teams[f.id] = {
      score: Number(f.score) || 0,
      players: list(f.player).map((p) => `${p.id}:${Number(p.score) || 0}:${p.status === 'starter' ? 1 : 0}`).join(','),
    };
  };
  for (const m of list(w.matchup)) {
    const fs = list(m.franchise);
    if (fs.length !== 2) continue;
    fs.forEach(side);
    // isHome is "1" on the home side; MFL lists either order.
    const [home, away] = fs[1]?.isHome === '1' && fs[0]?.isHome !== '1' ? [fs[1], fs[0]] : [fs[0], fs[1]];
    games.push({
      home: home.id,
      away: away.id,
      homeScore: Number(home.score) || 0,
      awayScore: Number(away.score) || 0,
      regular: m.regularSeason !== '0',
    });
  }
  return { games, teams };
}

/** The bracket list from a `playoffBrackets` export: [{ id, name, teams }]. */
export function readBrackets(body) {
  return list(body?.playoffBrackets?.playoffBracket).map((b) => ({ id: String(b.id), name: String(b.name ?? '').trim(), teams: Number(b.teamsInvolved) || 0 }));
}

/**
 * The games of one bracket from a `playoffBracket` export, as
 * [{ week, a, b, aScore, bScore }], in round order.
 */
export function readBracket(body) {
  const out = [];
  for (const r of list(body?.playoffBracket?.playoffRound)) {
    for (const g of list(r.playoffGame)) {
      const a = g.home?.franchise_id;
      const b = g.away?.franchise_id;
      if (!a || !b) continue;
      out.push({ week: Number(r.week), a, b, aScore: Number(g.home.points) || 0, bScore: Number(g.away.points) || 0 });
    }
  }
  return out.sort((x, y) => x.week - y.week);
}

/**
 * What each playoff game was, from the season's brackets: { "week:id:id": name },
 * and the champion and runner-up from the main bracket's (most teams) last game.
 */
export function tagPlayoffs(brackets) {
  const tags = {};
  let main = null;
  for (const b of brackets) {
    for (const g of b.games) tags[pairKey(g.week, g.a, g.b)] = b.name || 'Playoffs';
    if (!main || b.teams > main.teams) main = b;
  }
  const final = main?.games.at(-1);
  let champion = null;
  let runnerUp = null;
  if (final && final.aScore !== final.bScore) {
    [champion, runnerUp] = final.aScore > final.bScore ? [final.a, final.b] : [final.b, final.a];
  }
  return { tags, champion, runnerUp, playoffs: main?.name ?? null };
}

export function pairKey(week, a, b) {
  return `${week}:${[a, b].sort().join(':')}`;
}

/**
 * The last week of the current season that has been played: the schedule's
 * week once its last kickoff is GAME_TAIL_MS gone, otherwise the week before.
 */
export function lastPlayedWeek({ week, kickoffs, now }) {
  if (!week) return 0;
  const times = Object.values(kickoffs ?? {});
  return times.length && Math.max(...times) + GAME_TAIL_MS < now ? week : week - 1;
}

/**
 * The history, stored and filled in. `env` has MFL_HOST, MFL_SEASON,
 * MFL_LEAGUE_ID and MFL_USER_AGENT.
 */
export class HistoryStore {
  constructor(sql, env, fetcher = fetch) {
    this.sql = sql;
    this.env = env;
    this.fetch = fetcher;
    // One row per game. kind: "regular", or the playoff bracket's name
    // ("Playoffs", "3rd Place Game"…), or "Consolation" for other playoff-week games.
    sql.exec(`CREATE TABLE IF NOT EXISTS hist_games (
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      home TEXT NOT NULL,
      away TEXT NOT NULL,
      home_score REAL NOT NULL,
      away_score REAL NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (season, week, home)
    )`);
    // One row per team per week: its score and every player's ("id:score:starter,…").
    sql.exec(`CREATE TABLE IF NOT EXISTS hist_teams (
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      franchise_id TEXT NOT NULL,
      score REAL NOT NULL,
      players TEXT NOT NULL,
      PRIMARY KEY (season, week, franchise_id)
    )`);
    // One row per season: team names, weeks, champion, and what's been read.
    sql.exec(`CREATE TABLE IF NOT EXISTS hist_seasons (
      season INTEGER PRIMARY KEY,
      info TEXT NOT NULL
    )`);
  }

  async mfl(url) {
    const res = await this.fetch(url, {
      headers: { 'User-Agent': this.env.MFL_USER_AGENT || 'gridlock/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10 * 1000),
    });
    if (res.status !== 200) throw new Error(`MFL answered ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.$t ?? 'MFL error');
    return body;
  }

  url(season, query) {
    const { MFL_HOST, MFL_LEAGUE_ID } = this.env;
    return `${MFL_HOST}/${season}/export?L=${MFL_LEAGUE_ID}&JSON=1&${query}`;
  }

  season(season) {
    const row = this.sql.exec('SELECT info FROM hist_seasons WHERE season = ?', season).toArray()[0];
    return row ? JSON.parse(row.info) : null;
  }

  saveSeason(season, info) {
    this.sql.exec('INSERT OR REPLACE INTO hist_seasons (season, info) VALUES (?, ?)', season, JSON.stringify(info));
  }

  saveWeek(season, week, { games, teams }, tags = {}) {
    this.sql.exec('DELETE FROM hist_games WHERE season = ? AND week = ?', season, week);
    for (const g of games) {
      const kind = g.regular ? 'regular' : tags[pairKey(week, g.home, g.away)] ?? 'Consolation';
      this.sql.exec(
        'INSERT OR REPLACE INTO hist_games (season, week, home, away, home_score, away_score, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
        season, week, g.home, g.away, g.homeScore, g.awayScore, kind,
      );
    }
    for (const [id, t] of Object.entries(teams)) {
      this.sql.exec(
        'INSERT OR REPLACE INTO hist_teams (season, week, franchise_id, score, players) VALUES (?, ?, ?, ?, ?)',
        season, week, id, t.score, t.players,
      );
    }
  }

  /**
   * One scheduled run's share of the work: at most READS_PER_RUN reads.
   * `sched` is the relay's { week, kickoffs } for the current season.
   * Returns what it did, for the run's log.
   */
  async fill({ now, sched }) {
    const current = Number(this.env.MFL_SEASON);
    let budget = READS_PER_RUN;
    const done = [];
    const read = async (season, query) => {
      budget -= 1;
      return this.mfl(this.url(season, query));
    };

    // The current season's basics, and the list of seasons, once a day.
    let info = this.season(current);
    if (!info || now - (info.at ?? 0) > 24 * 3600 * 1000) {
      const league = readLeague(await read(current, 'TYPE=league'));
      info = { ...info, ...league, at: now, weeks: info?.weeks ?? {} };
      this.saveSeason(current, info);
      done.push(`${current} league`);
    }

    // This season's played weeks.
    const played = Math.min(lastPlayedWeek({ ...sched, now }), info.end || 99);
    const weeks = info.weeks ?? {};
    for (let w = 1; w <= played && budget > 0; w += 1) {
      const seen = weeks[w];
      // New, or played recently and not re-read today: read (again).
      const recent = seen && now - seen.first < CORRECTION_DAYS * 24 * 3600 * 1000 && now - seen.last > 20 * 3600 * 1000;
      if (seen && !recent) continue;
      const week = readWeek(await read(current, `TYPE=weeklyResults&W=${w}`));
      // A week whose games haven't scored yet isn't stored.
      if (!week.games.length || !week.games.some((g) => g.homeScore || g.awayScore)) continue;
      this.saveWeek(current, w, week);
      weeks[w] = { first: seen?.first ?? now, last: now };
      done.push(`${current} week ${w}`);
    }
    this.saveSeason(current, { ...info, weeks });

    // Earlier seasons, oldest first, until each is complete.
    for (const season of info.seasons.filter((s) => s < current)) {
      if (budget <= 0) break;
      const r = await this.fillPast(season, read, () => budget);
      if (r) done.push(r);
    }
    return { done, reads: READS_PER_RUN - budget };
  }

  /** Reads what's missing of a finished season, within the budget. Returns a log line or null. */
  async fillPast(season, read, budget) {
    let info = this.season(season);
    if (info?.complete) return null;
    const did = [];
    // A season first stored while it was the current one is read again in
    // full, so its playoff games get their bracket names.
    if (!info?.past) {
      info = { ...readLeague(await read(season, 'TYPE=league')), weeks: {}, past: true };
      this.saveSeason(season, info);
      did.push('league');
    }
    if (!info.brackets && budget() > 0) {
      const found = readBrackets(await read(season, 'TYPE=playoffBrackets'));
      info.brackets = found.map((b) => ({ ...b, games: null }));
      this.saveSeason(season, info);
      did.push('brackets');
    }
    for (const b of info.brackets ?? []) {
      if (b.games || budget() <= 0) continue;
      b.games = readBracket(await read(season, `TYPE=playoffBracket&BRACKET_ID=${b.id}`));
      this.saveSeason(season, info);
      did.push(`bracket ${b.id}`);
    }
    const bracketsRead = Boolean(info.brackets?.every((b) => b.games));
    if (!bracketsRead) return did.length ? `${season} ${did.join(', ')}` : null;
    const tagged = tagPlayoffs(info.brackets);
    for (let w = 1; w <= info.end && budget() > 0; w += 1) {
      if (info.weeks[w]) continue;
      this.saveWeek(season, w, readWeek(await read(season, `TYPE=weeklyResults&W=${w}`)), tagged.tags);
      info.weeks[w] = { first: Date.now(), last: Date.now() };
      this.saveSeason(season, info);
      did.push(`week ${w}`);
    }
    if (Object.keys(info.weeks).length >= info.end) {
      info = { ...info, complete: true, champion: tagged.champion, runnerUp: tagged.runnerUp };
      this.saveSeason(season, info);
      did.push('complete');
    }
    return did.length ? `${season} ${did.join(', ')}` : null;
  }

  /**
   * Everything the app needs for rivalries and records, small:
   * { seasons: { year: { names, regEnd, end, champion, runnerUp, complete } },
   *   games: [[season, week, home, homeScore, away, awayScore, kind]] }.
   * Player scores stay here; the recap reads them directly.
   */
  summary() {
    const seasons = {};
    for (const r of this.sql.exec('SELECT season, info FROM hist_seasons ORDER BY season').toArray()) {
      const i = JSON.parse(r.info);
      seasons[r.season] = {
        names: i.names, regEnd: i.regEnd, end: i.end,
        champion: i.champion ?? null, runnerUp: i.runnerUp ?? null,
        complete: Boolean(i.complete),
      };
    }
    const games = this.sql
      .exec('SELECT season, week, home, home_score, away, away_score, kind FROM hist_games ORDER BY season, week')
      .toArray()
      .map((g) => [g.season, g.week, g.home, g.home_score, g.away, g.away_score, g.kind]);
    return { seasons, games };
  }
}
