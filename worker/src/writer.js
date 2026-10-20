/**
 * The weekly recap writer: one Claude call per week, written from the fact
 * sheet (facts.js) and the storyline ledger (storylines.js).
 *
 * Claude only writes; every number it may use is in the facts it's given.
 * checkNumbers() rejects a recap that cites a number the facts don't hold.
 * After one retry, a plain recap built from the facts (factsRecap) is used.
 *
 * The tone is one setting, RECAP_TONE: a preset below, or any description.
 */

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';

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
        'Use empty strings and an empty teams list where a field does not apply. At most 5.',
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

export function system(tone) {
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
  ].join('\n');
}

export function userMessage({ facts, storylines, previous }) {
  const parts = [
    `Week ${facts.week} of the ${facts.season} season${facts.playoffs ? ' (playoffs)' : ''}.`,
    '',
    'Fact sheet:',
    JSON.stringify(facts),
    '',
    'Storyline ledger (open stories, and any closed this week):',
    JSON.stringify(storylines),
  ];
  if (previous) parts.push('', `Last week's headline, so you don't repeat it: ${previous}`);
  parts.push('', 'Write this week\'s recap.');
  return parts.join('\n');
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
 * Writes the recap. Returns { recap, source: 'ai' | 'facts', model, usage, problems }.
 * `client` is an Anthropic client (tests pass a stand-in).
 */
export async function writeRecap({ client, tone, facts, storylines, previous }) {
  const messages = [{ role: 'user', content: userMessage({ facts, storylines, previous }) }];
  const usage = [];
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: RECAP_SCHEMA } },
      system: system(tone),
      messages,
    });
    const msg = await stream.finalMessage();
    usage.push(msg.usage);
    if (msg.stop_reason === 'refusal') {
      problems = [`refused (${msg.stop_details?.category ?? 'no category'})`];
      break;
    }
    if (msg.stop_reason === 'max_tokens') {
      problems = ['ran out of room'];
      continue;
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let recap;
    try {
      recap = JSON.parse(text);
    } catch {
      problems = ['unreadable reply'];
      continue;
    }
    problems = checkNumbers(recap, { facts, storylines });
    if (!problems.length) return { recap, source: 'ai', model: msg.model, usage, problems: [] };
    // One retry, told what was wrong.
    messages.push(
      { role: 'assistant', content: msg.content },
      { role: 'user', content: `These numbers aren't in the facts: ${problems.join(', ')}. Rewrite the recap using only numbers from the JSON.` },
    );
  }
  return { recap: factsRecap(facts, storylines), source: 'facts', model: null, usage, problems };
}

export const client = (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60 * 1000 });
