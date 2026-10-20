/**
 * The weekly recap: what the writer is told, the shape it must return, and
 * the checks a recap must pass before the relay keeps it.
 *
 * The writing itself is done by a weekly Claude task on the league owner's
 * Claude plan (README): it reads GET /recap/brief (facts, storylines and the
 * instructions below), writes the recap as JSON, checks it with POST
 * /recap/check and saves it with POST /recap/save. Nothing here calls an AI.
 *
 * Every number a recap uses must be in the facts it was given
 * (checkNumbers). The tone is one setting, RECAP_TONE: a preset below, or
 * any description.
 */

export const TONES = {
  roast:
    'Full roast. You are the league\'s merciless trash-talking columnist. Mock bad lineups, blowouts, ' +
    'benched points, losing streaks and panic trades without mercy, and give winners grudging credit. ' +
    'Funny first: specific, quick jokes beat long insults. Roast the teams and their decisions, never ' +
    'anyone\'s family, looks, or identity.',
  playful: 'Playful and teasing, like a friendly league group chat. Light jokes, no real cruelty.',
  straight: 'A straight sports-page recap: lively, but mostly reporting.',
};

/** What the writer must return (structured output). */
export const RECAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'intro', 'matchups', 'storylines', 'nextWeek', 'ledger'],
  properties: {
    headline: { type: 'string', description: 'One punchy line, under 90 characters.' },
    intro: { type: 'string', description: '2-3 sentences on the week as a whole.' },
    matchups: {
      type: 'array',
      description: 'One entry per game in results, in the same order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['winner', 'loser', 'text'],
        properties: {
          winner: { type: 'string' },
          loser: { type: 'string' },
          text: { type: 'string', description: '2-4 sentences.' },
        },
      },
    },
    storylines: {
      type: 'array',
      description: 'The 2-4 running stories most worth following, from the ledger.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: { title: { type: 'string' }, text: { type: 'string' } },
      },
    },
    nextWeek: { type: 'string', description: '1-3 sentences previewing next week, or empty if there is none.' },
    ledger: {
      type: 'array',
      description:
        'Your changes to the storyline ledger. open: a new story you spotted (new id, a title, team names). ' +
        'note: something new on an existing story (its id). close: a story that has played out (its id). ' +
        'Use empty strings and an empty teams list where a field does not apply. Don\'t start text with the week number; it is added. At most 5.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'title', 'teams', 'text'],
        properties: {
          op: { type: 'string', enum: ['open', 'note', 'close'] },
          id: { type: 'string' },
          title: { type: 'string' },
          teams: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
        },
      },
    },
  },
};

export function instructions(tone) {
  const voice = TONES[tone] ?? (tone && String(tone).trim()) ?? TONES.roast;
  return [
    'You write the weekly recap for a 12-team dynasty fantasy football league on MyFantasyLeague.',
    'The whole league reads it in the league app every Tuesday.',
    '',
    `Tone: ${voice || TONES.roast}`,
    '',
    'You get the week\'s fact sheet and the season\'s storyline ledger as JSON. Rules:',
    '- Use only what is in them. Every number you write (scores, records, margins, streaks, ranks, bids, ' +
      'points) must appear in the JSON; do not compute new ones such as differences or averages. ' +
      'Write numbers exactly as given (88.2, not 88).',
    '- Do not invent events, injuries, quotes, or player news. Refer to teams by their team names.',
    '- "seriesBefore" is the all-time series before this week\'s game. Standings are by record, unofficial.',
    '- If historyComplete is false, make no "all-time" or "league history" claims.',
    '- Carry the season\'s stories forward: tie this week to the ledger where it fits ("the skid hits six").',
    '- Plain text only, no markdown. Keep the whole recap under about 600 words.',
    '- Reply with the recap as JSON matching the schema you are given.',
  ].join('\n');
}

/** Every number in a piece of text, as written. */
const numbers = (text) => String(text).match(/\d+(?:\.\d+)?/g) ?? [];

/** All the text the recap shows. */
export function recapText(r) {
  return [r.headline, r.intro, ...r.matchups.map((m) => m.text), ...r.storylines.flatMap((s) => [s.title, s.text]), r.nextWeek].join('\n');
}

/**
 * The numbers in a recap that aren't in the facts or ledger. Small whole
 * numbers (counts, weeks, ranks) and the season are always fine.
 */
export function checkNumbers(recap, { facts, storylines }) {
  const known = new Set(numbers(JSON.stringify([facts, storylines])));
  const ok = (n) => known.has(n) || known.has(String(Number(n))) || (/^\d+$/.test(n) && Number(n) <= 20) || n === String(facts.season);
  return [...new Set(numbers(recapText(recap)).filter((n) => !ok(n)))];
}

/** A plain recap from the facts alone, for when the writer can't be used. */
export function factsRecap(facts, storylines) {
  return {
    headline: `Week ${facts.week} results`,
    intro: facts.highScore ? `${facts.highScore.team} put up the week's best score, ${facts.highScore.score}.` : '',
    matchups: (facts.results ?? []).map((g) => ({
      winner: g.winner,
      loser: g.loser,
      text: g.tie ? `${g.winner} and ${g.loser} tied, ${g.score}.` : `${g.winner} beat ${g.loser}, ${g.score}.`,
    })),
    storylines: (storylines ?? []).slice(0, 4).map((s) => ({ title: s.title, text: s.notes.at(-1)?.replace(/^Week \d+: /, '') ?? '' })),
    nextWeek: (facts.nextWeek ?? []).map((g) => g.game).join('; '),
    ledger: [],
  };
}

/**
 * What's wrong with a recap: missing or mistyped fields, then numbers that
 * aren't in the facts. An empty list means it can be kept.
 */
export function problems(recap, { facts, storylines }) {
  const str = (v) => typeof v === 'string';
  const out = [];
  if (!recap || typeof recap !== 'object') return ['The recap must be a JSON object.'];
  for (const k of ['headline', 'intro', 'nextWeek']) if (!str(recap[k])) out.push(`${k} must be a string.`);
  if (!str(recap.headline) || !recap.headline.trim()) out.push('headline is empty.');
  if (!Array.isArray(recap.matchups) || recap.matchups.some((m) => !m || !str(m.winner) || !str(m.loser) || !str(m.text))) out.push('matchups must be a list of {winner, loser, text}.');
  else if (recap.matchups.length !== (facts.results ?? []).length) out.push(`matchups must have one entry per game (${(facts.results ?? []).length}).`);
  if (!Array.isArray(recap.storylines) || recap.storylines.some((x) => !x || !str(x.title) || !str(x.text))) out.push('storylines must be a list of {title, text}.');
  if (!Array.isArray(recap.ledger) || recap.ledger.some((c) => !c || !['open', 'note', 'close'].includes(c.op) || !str(c.id))) out.push('ledger must be a list of {op: open|note|close, id, title, teams, text}.');
  if (out.length) return out;
  if (recapText(recap).length > 8000) out.push('The recap is too long; keep it under about 600 words.');
  const bad = checkNumbers(recap, { facts, storylines });
  if (bad.length) out.push(`These numbers aren't in the facts: ${bad.join(', ')}. Use only numbers from the JSON, exactly as written.`);
  return out;
}
