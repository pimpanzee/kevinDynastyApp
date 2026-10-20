/**
 * What the push alerts say, worked out from MFL exports. Pure functions, so
 * they can be checked without MFL or a browser; relay.js reads MFL, keeps the
 * state between runs and sends the pushes.
 *
 * - lock: a kickoff is coming up and one of your starters in it is out, or
 *   your lineup is empty or has a player on bye.
 * - injury: a starter whose game hasn't started becomes Out, Doubtful or IR.
 * - inactive: a starter is on his team's game-day inactives list, which
 *   comes out about 90 minutes before kickoff.
 * - waivers: blind bids you had pending were processed: won or lost.
 * - recap: Tuesday, last week's result, the high score and the biggest bench mistake.
 * - correction: MFL changed a played week's score (a stat correction) in your
 *   game, with whether it changed the result.
 */

/** How long before a kickoff the lineup check runs. */
export const LOCK_WINDOW_MS = 90 * 60 * 1000;
/** Injury designations worth a push for a starter. */
const BAD = /^(out|ir|doubtful|suspended|ir-r|ir-pup|pup|nfi)/i;

/** MFL wraps a single item as an object. */
export function list(x) {
  return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x];
}

/** "Barkley, Saquon" → "Saquon Barkley". */
export function displayName(mflName) {
  if (!mflName) return 'A player';
  const [last, first] = String(mflName).split(', ');
  return first ? `${first} ${last}` : last;
}

/** id → { name, pos, team, espn } from a players export (espn: ESPN's id, with DETAILS=1). */
export function playerIndex(players) {
  const out = {};
  for (const p of list(players?.players?.player)) out[p.id] = { name: displayName(p.name), pos: p.position ?? '', team: p.team ?? '', espn: p.espn_id ? String(p.espn_id) : '' };
  return out;
}

/** id → MFL injury status ("Out", "Questionable", "IR"…) from an injuries export. */
export function injuryIndex(injuries) {
  const out = {};
  for (const i of list(injuries?.injuries?.injury)) out[i.id] = { status: i.status ?? '', details: i.details ?? '' };
  return out;
}

const fmtStatus = (s) => (/^ir/i.test(s) ? 'on IR' : String(s).toUpperCase());

/**
 * Lineup-lock checks for kickoffs in the next LOCK_WINDOW_MS that haven't
 * been checked yet. Returns [{ key, title, body }], one per kickoff with a
 * problem; the caller records every checked key (`checked`) either way.
 */
export function lockAlerts({ now, week, kickoffs, starters, minStarters, injuries, players, done }) {
  const times = [...new Set(Object.values(kickoffs))].sort((a, b) => a - b);
  const due = times.filter((t) => t > now && t - now <= LOCK_WINDOW_MS && !done.has(`lock:${week}:${t}`));
  const alerts = [];
  const checked = [];
  const first = times[0];
  for (const t of due) {
    checked.push(`lock:${week}:${t}`);
    const problems = [];
    // The whole lineup is checked before the week's first kickoff.
    if (t === first) {
      if (starters.length < minStarters) problems.push(starters.length ? `only ${starters.length} of ${minStarters} starters set` : 'no lineup set');
      for (const id of starters) {
        const p = players[id];
        if (p && p.team && !kickoffs[p.team] && p.team !== 'FA') problems.push(`${p.name} is on bye`);
      }
    }
    for (const id of starters) {
      const p = players[id];
      if (!p || kickoffs[p.team] !== t) continue;
      const inj = injuries[id];
      if (inj && BAD.test(inj.status)) problems.push(`${p.name} is ${fmtStatus(inj.status)}`);
    }
    if (problems.length) {
      const mins = Math.round((t - now) / 60000);
      alerts.push({
        key: `lock:${week}:${t}`,
        title: `Lineup check: kickoff in ${mins} min`,
        body: `${capital(problems.join('; '))}.`,
        url: '/team/lineup/',
      });
    }
  }
  return { alerts, checked };
}

/**
 * Starters newly marked Out/Doubtful/IR since the last run, whose games
 * haven't kicked off. `prev` and `injuries` are injuryIndex() results.
 */
export function injuryAlerts({ now, week, prev, injuries, starters, kickoffs, players, done }) {
  const alerts = [];
  for (const id of starters) {
    const inj = injuries[id];
    const p = players[id];
    if (!inj || !p || !BAD.test(inj.status)) continue;
    if ((prev[id]?.status ?? '') === inj.status) continue;
    const kick = kickoffs[p.team];
    if (!kick || kick <= now) continue;
    const key = `injury:${week}:${id}:${inj.status}`;
    if (done.has(key)) continue;
    alerts.push({
      key,
      title: `${p.name} is ${fmtStatus(inj.status)}`,
      body: `He's in your lineup for week ${week}${inj.details ? ` (${inj.details})` : ''}. Swap him before his kickoff.`,
      url: '/team/lineup/',
    });
  }
  return alerts;
}

/** How long before a kickoff inactives are looked for: NFL teams name them 90 minutes out. */
export const INACTIVES_WINDOW_MS = 85 * 60 * 1000;
/** Already pushed as out (injury or lineup check), so being inactive is no news. */
const KNOWN_OUT = /^(out|ir|suspended|pup|nfi)/i;

/**
 * Starters on their team's game-day inactives whose games haven't kicked
 * off. `inactive` is NFL team → Set of ESPN ids (plays.js fetchInactives),
 * for the teams whose lists are posted.
 */
export function inactiveAlerts({ now, week, starters, kickoffs, players, injuries, inactive, done }) {
  const alerts = [];
  for (const id of starters) {
    const p = players[id];
    const kick = p && kickoffs[p.team];
    if (!p?.espn || !kick || kick <= now || kick - now > INACTIVES_WINDOW_MS) continue;
    if (!inactive[p.team]?.has(p.espn)) continue;
    if (KNOWN_OUT.test(injuries?.[id]?.status ?? '')) continue;
    const key = `inactive:${week}:${id}`;
    if (done.has(key)) continue;
    const mins = Math.round((kick - now) / 60000);
    alerts.push({
      key,
      title: `${p.name} is inactive`,
      body: `He's in your week ${week} lineup and won't play. Kickoff is in ${mins} min: swap him now.`,
      url: '/team/lineup/',
      urgent: true,
    });
  }
  return alerts;
}

/**
 * Blind bid adds from a transactions export, as [{ player, bid, dropped, at }]:
 * one team's, or every team's without `franchiseId`.
 * MFL writes a BBID_WAIVER as "added,|amount|dropped,".
 */
export function bbidAdds(transactions, franchiseId) {
  const out = [];
  for (const t of list(transactions?.transactions?.transaction)) {
    if (t.type !== 'BBID_WAIVER' || (franchiseId && t.franchise !== franchiseId)) continue;
    const [adds = '', amount = '', drops = ''] = String(t.transaction ?? '').split('|');
    for (const player of adds.split(',').filter(Boolean)) {
      out.push({ player, bid: Number(amount) || 0, dropped: drops.split(',').filter(Boolean), at: Number(t.timestamp) * 1000 });
    }
  }
  return out;
}

/**
 * Waivers ran when every claim you had pending is gone from MFL's list and
 * MFL logged blind bid adds (yours, or any team's: `leagueRan`). Claims you
 * removed yourself don't count. Each became an add (won) or didn't (lost);
 * one push for the whole run.
 */
export function waiverAlert({ before, after, adds, leagueRan, players }) {
  if (!before?.length || !after) return null;
  const still = new Set(after.map((b) => `${b.player}_${b.bid}_${b.drop ?? ''}`));
  const gone = before.filter((b) => !still.has(`${b.player}_${b.bid}_${b.drop ?? ''}`));
  if (gone.length < before.length || !(adds.length || leagueRan)) return null;
  const won = new Map(adds.map((a) => [a.player, a]));
  const seen = new Set();
  const lines = [];
  let wins = 0;
  for (const b of gone) {
    if (seen.has(b.player)) continue; // several bids on one player: one line
    seen.add(b.player);
    const name = players[b.player]?.name ?? `Player ${b.player}`;
    const a = won.get(b.player);
    if (a) {
      wins += 1;
      const dropped = a.dropped.map((id) => players[id]?.name ?? `Player ${id}`).join(', ');
      lines.push(`Won ${name} for $${a.bid}${dropped ? `, dropped ${dropped}` : ''}`);
    } else {
      lines.push(`Lost ${name}`);
    }
  }
  return {
    key: `waivers:${gone.map((b) => `${b.player}_${b.bid}`).sort().join(',')}`,
    title: wins ? `Waivers: you won ${wins} of ${seen.size}` : 'Waivers: no wins this time',
    body: `${lines.join('. ')}.`,
    url: '/players/',
  };
}

/**
 * Tuesday recap from a weeklyResults export: your result, the week's high
 * score, and the bench player who would have added the most over a starter
 * at his position.
 */
export function recapAlert({ week, results, franchiseId, franchises, players }) {
  const sides = list(results?.weeklyResults?.matchup).map((m) => list(m.franchise));
  const all = sides.flat().concat(list(results?.weeklyResults?.franchise));
  const mine = all.find((f) => f.id === franchiseId);
  if (!mine || !all.some((f) => Number(f.score) > 0)) return null;
  const name = (id) => franchises[id] ?? `Team ${id}`;
  const opp = sides.find((s) => s.some((f) => f.id === franchiseId))?.find((f) => f.id !== franchiseId);
  const my = Number(mine.score);
  const parts = [];
  if (opp) {
    const theirs = Number(opp.score);
    const verb = my > theirs ? 'Beat' : my < theirs ? 'Lost to' : 'Tied';
    parts.push(`${verb} ${name(opp.id)} ${fmt(my)}–${fmt(theirs)}`);
  } else {
    parts.push(`Scored ${fmt(my)}`);
  }
  const high = all.reduce((a, f) => (Number(f.score) > Number(a.score) ? f : a), all[0]);
  parts.push(high.id === franchiseId ? `Week's high score: you, ${fmt(Number(high.score))}` : `High score: ${name(high.id)}, ${fmt(Number(high.score))}`);

  const roster = list(mine.player).map((p) => ({ id: p.id, score: Number(p.score) || 0, starter: p.status === 'starter', pos: players[p.id]?.pos ?? '' }));
  let worst = null;
  for (const b of roster.filter((p) => !p.starter && p.pos)) {
    const sameSpot = roster.filter((s) => s.starter && s.pos === b.pos);
    if (!sameSpot.length) continue;
    const low = sameSpot.reduce((a, s) => (s.score < a.score ? s : a));
    const gain = b.score - low.score;
    if (gain > 0 && (!worst || gain > worst.gain)) worst = { bench: b, starter: low, gain };
  }
  if (worst) {
    parts.push(`Bench miss: ${players[worst.bench.id]?.name ?? 'a bench player'} (${fmt(worst.bench.score)}) over ${players[worst.starter.id]?.name ?? 'a starter'} (${fmt(worst.starter.score)}), ${fmt(worst.gain)} pts left on the bench`);
  } else {
    parts.push('No points left on your bench');
  }
  return { key: `recap:${week}`, title: `Week ${week} recap`, body: `${parts.join('. ')}.`, url: '/matchups/' };
}

/** Score changes smaller than this are float noise, not corrections. */
const SCORE_EPS = 0.005;

/** "id:score:starter,…" (history.js readWeek) → id → { score, starter }. */
function playerScores(s) {
  const out = {};
  for (const part of String(s ?? '').split(',').filter(Boolean)) {
    const [id, score, starter] = part.split(':');
    out[id] = { score: Number(score) || 0, starter: starter === '1' };
  }
  return out;
}

/**
 * Stat corrections between two reads of one week's results (history.js
 * readWeek() shapes): each game where either side's score moved, with the
 * starters whose points changed. [{ home, away, before: [h, a], after: [h, a],
 * players: { franchiseId: [{ id, delta }] } }].
 */
export function statCorrections(before, after) {
  if (!before?.games?.length || !after?.games?.length) return [];
  const out = [];
  for (const g of after.games) {
    const old = before.games.find((b) => b.home === g.home && b.away === g.away);
    if (!old) continue;
    if (Math.abs(old.homeScore - g.homeScore) < SCORE_EPS && Math.abs(old.awayScore - g.awayScore) < SCORE_EPS) continue;
    const players = {};
    for (const id of [g.home, g.away]) {
      const was = playerScores(before.teams?.[id]?.players);
      const now = playerScores(after.teams?.[id]?.players);
      players[id] = Object.entries(now)
        .filter(([pid, p]) => p.starter && Math.abs(p.score - (was[pid]?.score ?? 0)) >= SCORE_EPS)
        .map(([pid, p]) => ({ id: pid, delta: p.score - (was[pid]?.score ?? 0) }))
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    }
    out.push({ home: g.home, away: g.away, before: [old.homeScore, old.awayScore], after: [g.homeScore, g.awayScore], players });
  }
  return out;
}

/**
 * The push for one team about a corrected game (from statCorrections()):
 * both scores before and after, who moved, and whether the result flipped.
 */
export function correctionAlert({ season, week, change, franchiseId, franchises, players }) {
  const home = change.home === franchiseId;
  if (!home && change.away !== franchiseId) return null;
  const oppId = home ? change.away : change.home;
  const [myWas, oppWas] = home ? change.before : [change.before[1], change.before[0]];
  const [my, opp] = home ? change.after : [change.after[1], change.after[0]];
  const result = (a, b) => (a > b ? 'win' : a < b ? 'loss' : 'tie');
  const was = result(myWas, oppWas);
  const now = result(my, opp);
  const oppName = franchises[oppId] ?? `Team ${oppId}`;
  const who = (id) => {
    const moved = (change.players[id] ?? []).slice(0, 3).map((p) => `${players[p.id]?.name ?? `Player ${p.id}`} ${p.delta > 0 ? '+' : '−'}${fmt2(Math.abs(p.delta))}`);
    return moved.length ? ` (${moved.join(', ')})` : '';
  };
  const parts = [];
  if (Math.abs(myWas - my) >= SCORE_EPS) parts.push(`You: ${fmt2(myWas)} → ${fmt2(my)}${who(franchiseId)}`);
  if (Math.abs(oppWas - opp) >= SCORE_EPS) parts.push(`${oppName}: ${fmt2(oppWas)} → ${fmt2(opp)}${who(oppId)}`);
  const line = `${fmt2(my)}–${fmt2(opp)}`;
  parts.push(was === now ? `Still a ${now}, ${line}` : `That turns your ${was} into a ${now}, ${line}`);
  return {
    key: `correction:${season}:${week}:${fmt2(my)}:${fmt2(opp)}`,
    title: was === now ? `Stat correction in week ${week}` : `Stat correction: week ${week} is now a ${now}`,
    body: `${parts.join('. ')}.`,
    url: `/matchups/${week}/`,
    urgent: was !== now,
  };
}

const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
