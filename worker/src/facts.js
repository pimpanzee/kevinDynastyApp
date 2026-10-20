/**
 * The weekly fact sheet: everything worth saying about one week, worked out
 * from the league's stored history (history.js) plus that week's MFL
 * transactions and player names. The AI recap (a later step) writes only from
 * this, so every number in a recap traces back to here.
 *
 * Pure functions: the relay gathers the inputs (relay.js `facts`).
 */

import { list } from './alerts.js';

const r1 = (n) => Math.round(n * 10) / 10;

/** "id:score:starter,…" (hist_teams.players) → [{ id, score, starter }]. */
export function parsePlayers(s) {
  return String(s ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => {
      const [id, score, starter] = p.split(':');
      return { id, score: Number(score) || 0, starter: starter === '1' };
    });
}

/** Win/loss/tie of a score against another. */
const res = (a, b) => (a > b ? 'W' : a < b ? 'L' : 'T');

/**
 * Each team's games this season up to `week`, in order:
 * { fid: [{ week, opp, pf, pa, result, playoff }] }.
 * `games` are history rows: [season, week, home, homeScore, away, awayScore, kind].
 */
export function seasonLog(games, season, week) {
  const log = {};
  for (const [s, w, h, hs, a, as, kind] of games) {
    if (s !== season || w > week) continue;
    const playoff = kind !== 'regular';
    (log[h] ??= []).push({ week: w, opp: a, pf: hs, pa: as, result: res(hs, as), playoff });
    (log[a] ??= []).push({ week: w, opp: h, pf: as, pa: hs, result: res(as, hs), playoff });
  }
  for (const k of Object.keys(log)) log[k].sort((x, y) => x.week - y.week);
  return log;
}

/** The current run of the same result at the end of a log: { result, n }. */
export function streak(entries) {
  const last = entries.at(-1);
  if (!last) return { result: null, n: 0 };
  let n = 0;
  for (let i = entries.length - 1; i >= 0 && entries[i].result === last.result; i -= 1) n += 1;
  return { result: last.result, n };
}

/**
 * Regular season standings after `week`: wins, then points for. [{ fid, w, l, t, pf, rank }].
 * A simple order for "who moved up": the app's Standings use the league's
 * own sort (victory points and tiebreakers), so the recap shouldn't quote ranks as official.
 */
export function standingsAfter(log, week) {
  const rows = Object.entries(log).map(([fid, es]) => {
    const reg = es.filter((e) => !e.playoff && e.week <= week);
    return {
      fid,
      w: reg.filter((e) => e.result === 'W').length,
      l: reg.filter((e) => e.result === 'L').length,
      t: reg.filter((e) => e.result === 'T').length,
      pf: r1(reg.reduce((n, e) => n + e.pf, 0)),
    };
  });
  rows.sort((a, b) => b.w + b.t / 2 - (a.w + a.t / 2) || b.pf - a.pf);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * The bench player who would have added the most over a starter at his
 * position: { bench, starter, gain } or null. `pos` maps player id → position.
 */
export function benchMiss(players, pos) {
  let worst = null;
  for (const b of players.filter((p) => !p.starter && pos[p.id])) {
    const same = players.filter((s) => s.starter && pos[s.id] === pos[b.id]);
    if (!same.length) continue;
    const low = same.reduce((a, s) => (s.score < a.score ? s : a));
    const gain = r1(b.score - low.score);
    if (gain > 0 && (!worst || gain > worst.gain)) worst = { bench: b.id, starter: low.id, gain };
  }
  return worst;
}

/** One team's all-time head-to-head with another, before (season, week). */
function series(games, a, b, season, week) {
  let w = 0, l = 0, t = 0;
  for (const [s, wk, h, hs, aw, as] of games) {
    if (s > season || (s === season && wk >= week)) continue;
    if (h === a && aw === b) { const r = res(hs, as); r === 'W' ? w++ : r === 'L' ? l++ : t++; }
    else if (h === b && aw === a) { const r = res(as, hs); r === 'W' ? w++ : r === 'L' ? l++ : t++; }
  }
  return { w, l, t };
}

/**
 * Highest and lowest single-game scores before this week, league-wide and per
 * team, from every stored game: { league: { high, low }, team: { fid: { high, low } } }.
 */
function priorRecords(games, season, week) {
  const league = { high: -Infinity, low: Infinity };
  const team = {};
  const see = (fid, pts) => {
    league.high = Math.max(league.high, pts);
    league.low = Math.min(league.low, pts);
    const t = (team[fid] ??= { high: -Infinity, low: Infinity });
    t.high = Math.max(t.high, pts);
    t.low = Math.min(t.low, pts);
  };
  for (const [s, w, h, hs, a, as] of games) {
    if (s > season || (s === season && w >= week)) continue;
    see(h, hs);
    see(a, as);
  }
  return { league, team };
}

/**
 * The week's moves from a `transactions` export for that week:
 * { trades: [{ a, b, aGave, bGave }], adds: [{ fid, player, bid, dropped }] }.
 * Draft picks stay as MFL writes them (FP_0003_2027_2 = 0003's 2027 2nd).
 */
export function readMoves(transactions) {
  const trades = [];
  const adds = [];
  for (const t of list(transactions?.transactions?.transaction)) {
    const ids = (s) => String(s ?? '').split(',').filter(Boolean);
    if (t.type === 'TRADE') {
      trades.push({ a: t.franchise, b: t.franchise2, aGave: ids(t.franchise1_gave_up), bGave: ids(t.franchise2_gave_up) });
    } else if (t.type === 'BBID_WAIVER') {
      const [add = '', amount = '', drop = ''] = String(t.transaction ?? '').split('|');
      for (const player of ids(add)) adds.push({ fid: t.franchise, player, bid: Number(amount) || 0, dropped: ids(drop) });
    }
  }
  return { trades, adds };
}

/** "FP_0003_2027_2" → "0003's 2027 round 2 pick"; player ids stay ids. */
function asset(id, players, team) {
  const pick = /^FP_(\d{4})_(\d{4})_(\d+)$/.exec(id);
  if (pick) return `${team(pick[1])}'s ${pick[2]} round ${pick[3]} pick`;
  return players[id] ? playerLabel(players[id]) : `player ${id}`;
}

const playerLabel = (p) => `${p.name} (${[p.pos, p.team].filter(Boolean).join(', ')})`;

/**
 * The fact sheet for one week.
 *
 * - `history`: { games: [[season, week, home, hs, away, as, kind]] } — every stored game.
 * - `teams`: { fid: { week: playersString } } for this season (hist_teams), at least this week.
 * - `names`: { fid: team name } this season.
 * - `players`: { id: { name, pos, team } } for everyone named below.
 * - `moves`: readMoves() of this week's transactions.
 * - `next`: [[home, away]] next week's games, or [] after the last week.
 * - `regEnd`: last regular season week.
 * - `complete`: every earlier season is stored. Until then, nothing claims
 *   "all-time" or "league history", since it would be wrong.
 */
export function buildFacts({ season, week, history, teams, names, players, moves, next = [], regEnd = 14, complete = true }) {
  const team = (fid) => names[fid] ?? `Team ${fid}`;
  const pos = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, p.pos]));
  const log = seasonLog(history.games, season, week);
  const thisWeek = history.games.filter(([s, w]) => s === season && w === week);
  const scores = thisWeek.flatMap(([, , h, hs, a, as]) => [[h, hs], [a, as]]);
  const prior = priorRecords(history.games, season, week);

  // Results, closest to most lopsided.
  const results = thisWeek
    .map(([, , h, hs, a, as, kind]) => {
      const [wid, ws, lid, ls] = hs >= as ? [h, hs, a, as] : [a, as, h, hs];
      const s = series(history.games, wid, lid, season, week);
      return {
        winner: team(wid), loser: team(lid), score: `${r1(ws)}–${r1(ls)}`, margin: r1(ws - ls), tie: hs === as,
        playoff: kind !== 'regular' ? kind : undefined,
        seriesBefore: complete ? `${team(wid)} ${s.w}-${s.l}${s.t ? `-${s.t}` : ''} all-time vs ${team(lid)}` : undefined,
      };
    })
    .sort((a, b) => a.margin - b.margin);

  // High and low, and wins that only happened because of the schedule.
  const sorted = scores.slice().sort((a, b) => b[1] - a[1]);
  const allPlay = Object.fromEntries(scores.map(([fid, pts]) => [fid, scores.filter(([o, p]) => o !== fid && p < pts).length]));
  const n = scores.length - 1;
  const outcome = Object.fromEntries(scores.map(([fid]) => [fid, log[fid]?.find((e) => e.week === week)?.result]));
  const unlucky = scores.filter(([fid]) => outcome[fid] === 'L' && allPlay[fid] >= Math.ceil(n * 0.6))
    .map(([fid, pts]) => ({ team: team(fid), score: r1(pts), wouldHaveBeaten: `${allPlay[fid]} of ${n}` }));
  const lucky = scores.filter(([fid]) => outcome[fid] === 'W' && allPlay[fid] <= Math.floor(n * 0.4))
    .map(([fid, pts]) => ({ team: team(fid), score: r1(pts), wouldHaveBeaten: `${allPlay[fid]} of ${n}` }));

  // Records broken this week.
  const records = [];
  for (const [fid, pts] of complete ? scores : []) {
    if (pts > prior.league.high) records.push(`${team(fid)} scored ${r1(pts)}, the highest score in league history (old mark ${r1(prior.league.high)})`);
    else if (prior.team[fid] && pts > prior.team[fid].high) records.push(`${team(fid)} scored ${r1(pts)}, a franchise record (old mark ${r1(prior.team[fid].high)})`);
    if (pts < prior.league.low) records.push(`${team(fid)} scored ${r1(pts)}, the lowest score in league history (old mark ${r1(prior.league.low)})`);
    else if (prior.team[fid] && pts < prior.team[fid].low) records.push(`${team(fid)} scored ${r1(pts)}, a franchise low (old mark ${r1(prior.team[fid].low)})`);
  }

  // Players: the week's best starters, bench points that stayed on the bench.
  const rosters = Object.fromEntries(Object.entries(teams).map(([fid, weeks]) => [fid, parsePlayers(weeks[week])]));
  const starters = Object.entries(rosters).flatMap(([fid, ps]) => ps.filter((p) => p.starter).map((p) => ({ fid, ...p })));
  const topPlayers = starters.sort((a, b) => b.score - a.score).slice(0, 5)
    .map((p) => ({ player: players[p.id] ? playerLabel(players[p.id]) : `player ${p.id}`, team: team(p.fid), points: r1(p.score) }));
  const duds = starters.filter((p) => players[p.id] && p.score <= 3).sort((a, b) => a.score - b.score).slice(0, 5)
    .map((p) => ({ player: playerLabel(players[p.id]), team: team(p.fid), points: r1(p.score) }));
  const benchMisses = Object.entries(rosters)
    .map(([fid, ps]) => ({ fid, miss: benchMiss(ps, pos) }))
    .filter((x) => x.miss && x.miss.gain >= 5)
    .sort((a, b) => b.miss.gain - a.miss.gain)
    .map(({ fid, miss }) => ({
      team: team(fid),
      benched: players[miss.bench] ? playerLabel(players[miss.bench]) : `player ${miss.bench}`,
      benchedPoints: r1(rosters[fid].find((p) => p.id === miss.bench)?.score ?? 0),
      started: players[miss.starter] ? playerLabel(players[miss.starter]) : `player ${miss.starter}`,
      startedPoints: r1(rosters[fid].find((p) => p.id === miss.starter)?.score ?? 0),
      pointsLeft: miss.gain,
      // Would starting him have flipped the result?
      costTheGame: outcome[fid] === 'L' && (() => {
        const g = thisWeek.find(([, , h, , a]) => h === fid || a === fid);
        if (!g) return false;
        const [mine, theirs] = g[2] === fid ? [g[3], g[5]] : [g[5], g[3]];
        return mine + miss.gain > theirs;
      })(),
    }));

  // Streaks of 3 or more, and standings moves.
  const streaks = Object.entries(log)
    .map(([fid, es]) => ({ fid, ...streak(es) }))
    .filter((s) => s.n >= 3 && s.result !== 'T')
    .map((s) => `${team(s.fid)} has ${s.result === 'W' ? 'won' : 'lost'} ${s.n} straight`);
  const now = standingsAfter(log, Math.min(week, regEnd));
  const before = Object.fromEntries(standingsAfter(log, Math.min(week - 1, regEnd)).map((r) => [r.fid, r.rank]));
  const standings = now.map((r) => ({
    rank: r.rank, team: team(r.fid), record: `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`, pointsFor: r.pf,
    move: week > 1 && before[r.fid] ? before[r.fid] - r.rank : 0,
  }));

  const trades = moves.trades.map((t) => ({
    teams: [team(t.a), team(t.b)],
    [`${team(t.a)} gave`]: t.aGave.map((id) => asset(id, players, team)),
    [`${team(t.b)} gave`]: t.bGave.map((id) => asset(id, players, team)),
  }));
  const waivers = moves.adds
    .sort((a, b) => b.bid - a.bid)
    .map((a) => ({ team: team(a.fid), added: asset(a.player, players, team), bid: a.bid, dropped: a.dropped.map((id) => asset(id, players, team)) }));

  const nextWeek = next.map(([h, a]) => {
    const s = series(history.games, h, a, season, week + 1);
    const rec = (fid) => standings.find((r) => r.team === team(fid))?.record ?? '';
    return { game: `${team(h)} (${rec(h)}) vs ${team(a)} (${rec(a)})`, series: complete ? `${team(h)} ${s.w}-${s.l}${s.t ? `-${s.t}` : ''} all-time` : undefined };
  });

  return {
    season, week, playoffs: week > regEnd, historyComplete: complete,
    results,
    highScore: sorted[0] && { team: team(sorted[0][0]), score: r1(sorted[0][1]) },
    lowScore: sorted.at(-1) && { team: team(sorted.at(-1)[0]), score: r1(sorted.at(-1)[1]) },
    unlucky, lucky, records,
    topPlayers, duds, benchMisses,
    streaks,
    standingsNote: 'Ordered by record, then points for; not the official standings (those use victory points).',
    standings,
    trades, waivers,
    nextWeek,
  };
}
