/**
 * The storyline ledger: the running stories of a season, carried from week to
 * week so the recap can say "the Shit-Hawks' skid hits seven" or "that
 * McConkey trade is looking worse every week" instead of starting fresh.
 *
 * Simple detectors open stories from the data (streaks, trades, big waiver
 * bids, the playoff line) and add a note each week something happens to
 * them. The AI writer can also open, update or close one (applyChanges).
 * A story with nothing new for QUIET_WEEKS closes on its own.
 *
 * Pure functions: the relay replays the season week by week (relay.js `ledger`).
 */

import { parsePlayers, seasonLog, standingsAfter, streak } from './facts.js';

/** A story with no new note for this many weeks closes. */
export const QUIET_WEEKS = 3;
/** Weeks a trade or waiver story follows the players. */
const FOLLOW_WEEKS = 4;
/** A waiver bid this big is a story. */
const BIG_BID = 20;
/** Points that make a followed player's week worth a note: a boom, or a starter's bust. */
const BOOM = 15;
const BUST = 3;
/** Stories the writer sees at most. */
const WRITER_MAX = 15;

const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;
/** Teams that make the playoffs. */
const PLAYOFF_TEAMS = 6;
/** The first week the playoff line is worth a story. */
const RACE_FROM = 4;

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Opens a story, or adds a note to it if it's already open.
 * Story: { id, kind, title, teams, opened, updated, status, notes: [{ week, text }], data }.
 */
function touch(ledger, week, { id, kind, title, teams, text, data }) {
  let s = ledger.find((x) => x.id === id && x.status === 'open');
  if (!s) {
    s = { id, kind, title, teams, opened: week, updated: week, status: 'open', notes: [], data: data ?? {} };
    ledger.push(s);
  }
  if (title) s.title = title;
  s.updated = week;
  if (text) s.notes.push({ week, text });
  return s;
}

/** Closes a story. Without `text` it closes quietly: the writer isn't told. */
function close(s, week, text) {
  if (s.status !== 'open') return;
  if (text) s.notes.push({ week, text });
  s.status = 'closed';
  s.closed = week;
  s.quiet = !text;
}

/**
 * The ledger after `week`, from the ledger after the week before.
 *
 * - `games`: every stored game ([season, week, home, hs, away, as, kind]).
 * - `teams`: { fid: { week: playersString } } this season.
 * - `moves`: readMoves() of this week's transactions.
 * - `names`: { fid: team name }; `players`: { id: { name, pos, team } }.
 */
export function stepLedger(prev, { season, week, games, teams, moves, names, players, regEnd = 14 }) {
  const ledger = structuredClone(prev ?? []);
  const team = (fid) => names[fid] ?? `Team ${fid}`;
  const who = (id) => players[id]?.name ?? `player ${id}`;
  const log = seasonLog(games, season, week);
  // Points each player scored this week, and for whom.
  const scored = {};
  for (const [fid, weeks] of Object.entries(teams)) {
    for (const p of parsePlayers(weeks[week])) scored[p.id] = { fid, score: p.score, starter: p.starter };
  }

  // Streaks: 3 or more opens a story; a snapped streak closes it.
  for (const [fid, es] of Object.entries(log)) {
    const s = streak(es);
    const id = `streak:${fid}`;
    const open = ledger.find((x) => x.id === id && x.status === 'open');
    const word = s.result === 'W' ? 'won' : 'lost';
    if (s.n >= 3 && s.result !== 'T') {
      if (open && open.data.result !== s.result) close(open, week, `${team(fid)}'s run ended.`);
      const story = touch(ledger, week, {
        id, kind: 'streak', teams: [fid], data: { result: s.result },
        title: `${team(fid)} has ${word} ${s.n} straight`,
        text: `${word === 'won' ? 'Won' : 'Lost'} again: ${s.n} straight.`,
      });
      story.data.n = s.n;
    } else if (open) {
      close(open, week, `${team(fid)} snapped a ${open.data.n}-game ${open.data.result === 'W' ? 'winning' : 'losing'} streak.`);
    }
  }

  // Trades open a story that follows what each side got.
  for (const t of moves.trades) {
    const id = `trade:${week}:${t.a}:${t.b}`;
    const got = { [t.a]: t.bGave.filter((x) => /^\d+$/.test(x)), [t.b]: t.aGave.filter((x) => /^\d+$/.test(x)) };
    if (!got[t.a].length && !got[t.b].length) continue; // picks for picks: nothing to follow
    const label = (ids) => ids.map(who).join(', ') || 'picks only';
    touch(ledger, week, {
      id, kind: 'trade', teams: [t.a, t.b], data: { got },
      title: `Trade: ${team(t.a)} ↔ ${team(t.b)}`,
      text: `${team(t.a)} got ${label(got[t.a])}; ${team(t.b)} got ${label(got[t.b])}.`,
    });
  }
  // Big waiver bids open a story that follows the player.
  for (const a of moves.adds.filter((x) => x.bid >= BIG_BID)) {
    touch(ledger, week, {
      id: `waiver:${a.player}:${a.fid}`, kind: 'waiver', teams: [a.fid], data: { player: a.player, fid: a.fid },
      title: `${team(a.fid)} spent $${a.bid} on ${who(a.player)}`,
      text: `${team(a.fid)} won ${who(a.player)} for $${a.bid}.`,
    });
  }

  // Follow-ups: how traded and bid-on players did this week.
  for (const s of ledger.filter((x) => x.status === 'open' && (x.kind === 'trade' || x.kind === 'waiver') && x.opened < week)) {
    if (week - s.opened > FOLLOW_WEEKS) {
      close(s, week);
      continue;
    }
    const lines = [];
    // Only weeks worth a line: a boom (started or not), or a starter who flopped.
    const follow = (fid, ids) => {
      for (const id of ids) {
        const p = scored[id];
        if (!p || p.fid !== fid) continue; // since moved on, or not rostered
        if (p.score >= BOOM) lines.push(`${who(id)} scored ${r1(p.score)} for ${team(fid)}${p.starter ? '' : ', on the bench'}`);
        else if (p.starter && p.score <= BUST) lines.push(`${who(id)} started for ${team(fid)} and scored ${r1(p.score)}`);
      }
    };
    if (s.kind === 'trade') for (const [fid, ids] of Object.entries(s.data.got)) follow(fid, ids);
    else follow(s.data.fid, [s.data.player]);
    if (lines.length) touch(ledger, week, { id: s.id, text: lines.join('; ') + '.' });
  }

  // The playoff line: teams moving in or out of the top PLAYOFF_TEAMS in the
  // regular season, from RACE_FROM on (before that, half the league is tied).
  if (week >= RACE_FROM && week <= regEnd) {
    const now = standingsAfter(log, week);
    const before = Object.fromEntries(standingsAfter(log, week - 1).map((r) => [r.fid, r.rank]));
    for (const r of now) {
      const was = before[r.fid];
      if (!was) continue;
      const inNow = r.rank <= PLAYOFF_TEAMS, inBefore = was <= PLAYOFF_TEAMS;
      if (inNow === inBefore) continue;
      touch(ledger, week, {
        id: `race:${r.fid}`, kind: 'race', teams: [r.fid],
        title: `${team(r.fid)} and the playoff line`,
        text: inNow ? `${team(r.fid)} climbed into a playoff spot (${ordinal(r.rank)} by record).` : `${team(r.fid)} fell out of a playoff spot (${ordinal(r.rank)} by record).`,
      });
    }
  }

  // Quiet stories close.
  for (const s of ledger) if (s.status === 'open' && week - s.updated >= QUIET_WEEKS) close(s, week);
  return ledger;
}

/**
 * The AI writer's own changes, applied after the week's step:
 * [{ op: 'open', id, title, teams, text } | { op: 'note', id, text } | { op: 'close', id, text }].
 * Unknown ids for note/close are ignored; AI-opened ids are prefixed "ai:".
 */
export function applyChanges(ledger, week, changes) {
  const out = structuredClone(ledger);
  // Notes are shown as "Week N: …", so drop a week the writer already put there.
  const clean = (t) => String(t).replace(/^\s*week \d+\s*[:\-–—]\s*/i, '').slice(0, 300);
  for (const c of changes ?? []) {
    if (!c || typeof c.id !== 'string') continue;
    if (c.op === 'open' && c.title) {
      touch(out, week, { id: c.id.startsWith('ai:') ? c.id : `ai:${c.id}`, kind: 'ai', title: String(c.title).slice(0, 120), teams: Array.isArray(c.teams) ? c.teams.slice(0, 4) : [], text: c.text ? clean(c.text) : undefined });
    } else if (c.op === 'note' && c.text) {
      const s = out.find((x) => x.id === c.id && x.status === 'open');
      if (s) touch(out, week, { id: s.id, text: clean(c.text) });
    } else if (c.op === 'close') {
      const s = out.find((x) => x.id === c.id && x.status === 'open');
      if (s) close(s, week, c.text ? clean(c.text) : undefined);
    }
  }
  return out;
}

/**
 * What the writer sees: the WRITER_MAX liveliest stories, open or closed
 * this week with something said, with their last few notes. Fresh news
 * first: anything touched this week, then streaks by length, then the rest.
 * Team ids become names.
 */
export function ledgerForWriter(ledger, week, names) {
  const weight = (s) =>
    (s.updated === week ? 100 : 0) + (s.kind === 'streak' ? 10 + (s.data.n ?? 0) : 0) + (s.kind === 'race' ? 8 : 0) + (s.kind === 'ai' ? 9 : 0) + s.updated;
  return ledger
    .filter((s) => s.status === 'open' || (s.closed === week && !s.quiet))
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, WRITER_MAX)
    .map((s) => ({
      id: s.id,
      title: s.title,
      teams: s.teams.map((fid) => names[fid] ?? fid),
      since: `week ${s.opened}`,
      status: s.status === 'open' ? 'open' : 'closed this week',
      notes: s.notes.slice(-4).map((n) => `Week ${n.week}: ${n.text}`),
    }));
}
