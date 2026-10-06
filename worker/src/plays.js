/**
 * Key plays for the Home Screen widget: touchdowns and 20+ yard gains by
 * players on the league's rosters, read from ESPN's public game summaries.
 *
 * ESPN's play-by-play names players as "J.Taylor" with no ids, so a play is
 * tied to a rostered player by matching that abbreviation against players on
 * the offence's team. Collisions (two "J.Smith"s on one NFL team, both
 * rostered) are rare enough to accept.
 */

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

/** MFL's NFL team codes where they differ from ESPN's abbreviations. */
const MFL_TO_ESPN = { GBP: 'GB', JAC: 'JAX', KCC: 'KC', LVR: 'LV', NEP: 'NE', NOS: 'NO', SFO: 'SF', TBB: 'TB', WAS: 'WSH' };

/** Gains shorter than this aren't "big" unless they score. */
export const BIG_PLAY_YARDS = 20;
/**
 * A passer's non-scoring completions need to be longer to count — otherwise a
 * quarterback's every chunk play crowds out everyone else.
 */
export const BIG_PASS_YARDS = 40;

const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Index rostered players by ESPN team, each with a pattern for how ESPN writes
 * them: MFL's "J. Smith-Njigba" becomes "J.Smith-Njigba", suffixes dropped.
 */
export function indexPlayers(players) {
  const byTeam = new Map();
  for (const [id, p] of Object.entries(players)) {
    const m = /^(\S)\.\s+(.+)$/.exec(p.n);
    if (!m) continue;
    const last = m[2].replace(SUFFIX, '');
    const team = MFL_TO_ESPN[p.t] ?? p.t;
    const re = new RegExp(`(^|[^A-Za-z.])${escapeRe(m[1])}\\.${escapeRe(last)}(?![A-Za-z])`, 'i');
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push({ id, re, name: p.n, f: p.f });
  }
  return byTeam;
}

/** The week's games: id, state ('pre' | 'in' | 'post') and the two teams. */
export async function fetchScoreboard(season, week) {
  const res = await fetch(`${ESPN}/scoreboard?seasontype=2&week=${week}&dates=${season}`);
  if (!res.ok) throw new Error(`ESPN scoreboard failed (${res.status})`);
  const body = await res.json();
  return (body.events ?? []).map((e) => {
    const c = e.competitions?.[0] ?? {};
    return {
      id: e.id,
      state: c.status?.type?.state ?? 'pre',
      teams: (c.competitors ?? []).map((t) => t.team?.abbreviation).filter(Boolean),
    };
  });
}

/** Every key play in one game that involves a rostered player. */
export async function fetchGamePlays(gameId, byTeam) {
  const res = await fetch(`${ESPN}/summary?event=${gameId}`);
  if (!res.ok) throw new Error(`ESPN summary ${gameId} failed (${res.status})`);
  const body = await res.json();
  const drives = [...(body.drives?.previous ?? []), ...(body.drives?.current ? [body.drives.current] : [])];
  const out = [];
  for (const drive of drives) {
    const team = drive.team?.abbreviation;
    const candidates = byTeam.get(team);
    if (!candidates) continue;
    for (const play of drive.plays ?? []) {
      for (const e of keyPlayEvents(play, team, candidates)) out.push(e);
    }
  }
  return out;
}

/** Zero or more events from one play: one per rostered player it credits. */
export function keyPlayEvents(play, team, candidates) {
  const type = play.type?.text ?? '';
  const yards = Number(play.statYardage) || 0;
  const td = type === 'Rushing Touchdown' || type === 'Passing Touchdown';
  const isRush = type === 'Rush' || type === 'Rushing Touchdown';
  const isPass = type === 'Pass Reception' || type === 'Passing Touchdown';
  if (!(isRush || isPass) || (!td && yards < BIG_PLAY_YARDS)) return [];

  // Ignore any preamble such as "L.Tenuta reported in as eligible."
  const text = play.text ?? '';
  const passAt = text.search(/\spass\s/);
  const toAt = passAt >= 0 ? text.indexOf(' to ', passAt) : -1;

  const events = [];
  for (const c of candidates) {
    const m = c.re.exec(text);
    if (!m) continue;
    const at = m.index + m[1].length;
    let role;
    if (isRush) role = 'run';
    else if (toAt >= 0 && at > toAt) role = 'catch';
    else if (passAt >= 0 && at < passAt) role = 'pass';
    else continue; // named in the play but not the passer or catcher (a tackler, say)
    if (role === 'pass' && !td && yards < BIG_PASS_YARDS) continue;
    const target = role === 'pass' ? receiverIn(text, toAt) : null;
    events.push({
      id: `${play.id}:${c.id}`,
      at: Date.parse(play.wallclock ?? '') || 0,
      player: c.id,
      name: c.name,
      f: c.f,
      team,
      td,
      yards,
      label: `${yards}-yd ${td ? 'TD ' : ''}${role}${target ? ` to ${target}` : ''}`,
    });
  }
  return events;
}

/** "J.Chase" from "... pass deep left to J.Chase for 47 yards ...". */
function receiverIn(text, toAt) {
  if (toAt < 0) return null;
  const m = /^ to ([A-Z][A-Za-z'-]*\.\s?[A-Z][A-Za-z.'-]*(?: (?:Jr|Sr|II|III|IV)\.?)?)/.exec(text.slice(toAt));
  return m ? m[1].replace(/\.\s/, '.') : null;
}
