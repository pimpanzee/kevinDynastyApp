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

/** The longest a recap may be, and its parts. */
export const MAX_WORDS = 500;
const MAX_GAME_WORDS = 75;
const MAX_STORYLINES = 3;
const MAX_GAME_HEADLINE = 70;

/**
 * Stock lines a recap may not use. They read as filler, and the writer
 * leaned on them every week. Matched without case, anywhere in the text.
 */
export const BANNED_LINES = [
  'brutal', 'bold strategy', 'math checks out', 'the math checks out', 'ouch', 'yikes', 'woof', 'oof',
  'you hate to see it', 'tough break', 'some weeks', 'the universe', 'just saying', 'say less',
  'that\'s football', 'any given sunday', 'it is what it is', 'chef\'s kiss', 'not great',
  'let that sink in', 'we\'ve all been there', 'rough week',
];

/**
 * The bar for a joke, shown to the writer. Each one twists a specific
 * decision or result. Made up, and the writer is told never to copy them.
 */
export const EXAMPLE_LINES = [
  'Paid top-five money for a receiver who delivered a kicker\'s stat line. At least the receipt is itemized.',
  'Benched the guy who went off for the guy who went to the medical tent, then called it trusting the process.',
  'Traded two picks for a quarterback listed Out. The vision was clear; the quarterback was not available.',
  'Second-most points in the league and a loss: the fantasy version of studying all night and missing the exam.',
  'Their best lineup would have won comfortably. Their actual lineup would have lost to a bye week.',
  'Five straight wins, none against a winning team. A schedule booked by a travel agent.',
  'They own everyone\'s first-round picks except their own, which belongs to the team that just beat them.',
  'Started a player whose team had the week off. Somewhere an app is still asking "are you sure?"',
];

export const TONES = {
  roast:
    'Full roast. You are the league\'s merciless trash-talking columnist. Every game gets roasted: the ' +
    'loser always, the winner too when they won ugly. Mock bad lineups, blowouts, benched points, losing ' +
    'streaks, overpays and panic trades without mercy, and give winners only grudging credit. Funny first: ' +
    'specific, cutting jokes built on the numbers beat generic insults. Roast the teams and their decisions, ' +
    'never anyone\'s family, looks, or identity.',
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
        required: ['headline', 'winner', 'loser', 'text'],
        properties: {
          headline: { type: 'string', description: `This game's own headline: a few punchy words, under ${MAX_GAME_HEADLINE} characters.` },
          winner: { type: 'string' },
          loser: { type: 'string' },
          text: { type: 'string', description: '2-3 sentences: the best detail of this game, and a roast.' },
        },
      },
    },
    storylines: {
      type: 'array',
      description: 'At most 3 big running stories, from the ledger (can be empty). Two or three sentences each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: { title: { type: 'string' }, text: { type: 'string' } },
      },
    },
    nextWeek: { type: 'string', description: 'One sentence on next week\'s best game, or empty if there is none.' },
    ledger: {
      type: 'array',
      description:
        'Your changes to the storyline ledger. open: a new story you spotted (new id, a title, team names). ' +
        'note: something new on an existing story (its id). close: a story that has played out (its id). ' +
        'Use empty strings and an empty teams list where a field does not apply. Don\'t start text with the week number; it is added. ' +
        'Only open a story the whole league would care about for weeks (a title race, a long streak, a blockbuster trade, a record, a rivalry). At most 3.',
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
    '- Keep it tight: pick the best one or two details for each game and leave the rest out, but every game gets a roast.',
    '- Check how new players were used: each trade and big waiver add has "thisWeek" (started, benched, or not ' +
      'on the roster, and any injury report). Trading for an injured player who could not play, or benching the guy ' +
      'you just paid for, is prime roast material. So is starting someone listed as out ("injuredStarters").',
    '- Other roast material in the facts: "byeStarters" (started a player whose NFL team had no game), "revenge" ' +
      '(a player torching the team that traded him away), "tradeScoreboard" (points each side has got from a trade ' +
      'since it happened), "salaryBusts" and "bargains" (salary vs points), "bestLineups" (points left on the bench, ' +
      'and whether the best lineup would have won), "seasonLuck" (record vs all-play record), and "droppedAndWentOff" ' +
      '(a player a team cut, now scoring for someone else), and "draftPicks" (who owns whose future firsts and ' +
      'seconds: a bad team that traded away its own first gets no reward for losing, and someone else profits).',
    '- Bench calls: benchMisses and duds carry MFL projections. If the started player was projected well above the ' +
      'benched one, the start was the right call and it just didn\'t work out. Don\'t flame that as a dumb decision; ' +
      'call it bad luck or skip it. Save the "what were you thinking" roasts for starting the lower projection, a bye, ' +
      'an injured player, or benching the guy you just traded or paid for.',
    '- Only call a trade or pickup new, fresh or "this week" if it is in this week\'s trades or waivers. ' +
      'The ledger notes say which week older moves happened.',
    '- Each game gets its own headline: a few punchy words on the best joke or detail of that game, like a ' +
      `newspaper headline (under ${MAX_GAME_HEADLINE} characters, no team-name-beat-team-name). Don't repeat the game's text.`,
    '- Jokes: write like the funniest person in the group chat, not a sports bot. A joke lands on one specific number ' +
      'or decision from the facts and twists it. No generic filler, no one-word closers, no ending a game on a ' +
      'shrug line. These show the bar (made-up teams and players, so never copy or echo them):',
    ...EXAMPLE_LINES.map((l) => `    "${l}"`),
    `- Never use these stock lines, in any form: ${BANNED_LINES.map((b) => `"${b}"`).join(', ')}.`,
    '- "recentJokes" are lines from the last three recaps. The league has read them: don\'t reuse a joke, its ' +
      'setup or its punchline shape ("the universe hates them" twice is once too many). Find a new angle.',
    '- "lore" (when given) is the league\'s own notes on each team: nicknames, grudges, running jokes, and what is ' +
      'off limits. Work in one or two lore bits a week where this week\'s facts set them up, never forced. Never touch ' +
      'anything marked off limits. Lore is not a source of facts or numbers.',
    '- Storylines are only the big ones a league member would bring up in the group chat: the title race, ' +
      'long streaks, blockbuster trades and whether they are paying off, records, rivalries. Skip waiver churn and backups.',
    `- Plain text only, no markdown. Keep the whole recap under ${MAX_WORDS} words.`,
    '- Reply with the recap as JSON matching the schema you are given.',
  ].join('\n');
}

/** Every number in a piece of text, as written. */
const numbers = (text) => String(text).match(/\d+(?:\.\d+)?/g) ?? [];

/** All the text the recap shows. */
export function recapText(r) {
  return [r.headline, r.intro, ...r.matchups.flatMap((m) => [m.headline ?? '', m.text]), ...r.storylines.flatMap((s) => [s.title, s.text]), r.nextWeek].join('\n');
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
      headline: g.tie ? 'A tie' : `${g.winner} win`,
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
export function problems(recap, { facts, storylines, recentJokes = [] }) {
  const str = (v) => typeof v === 'string';
  const out = [];
  if (!recap || typeof recap !== 'object') return ['The recap must be a JSON object.'];
  for (const k of ['headline', 'intro', 'nextWeek']) if (!str(recap[k])) out.push(`${k} must be a string.`);
  if (!str(recap.headline) || !recap.headline.trim()) out.push('headline is empty.');
  if (!Array.isArray(recap.matchups) || recap.matchups.some((m) => !m || !str(m.headline) || !str(m.winner) || !str(m.loser) || !str(m.text))) out.push('matchups must be a list of {headline, winner, loser, text}.');
  else if (recap.matchups.length !== (facts.results ?? []).length) out.push(`matchups must have one entry per game (${(facts.results ?? []).length}).`);
  if (!Array.isArray(recap.storylines) || recap.storylines.some((x) => !x || !str(x.title) || !str(x.text))) out.push('storylines must be a list of {title, text}.');
  if (!Array.isArray(recap.ledger) || recap.ledger.some((c) => !c || !['open', 'note', 'close'].includes(c.op) || !str(c.id))) out.push('ledger must be a list of {op: open|note|close, id, title, teams, text}.');
  if (out.length) return out;
  const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
  // Game headlines don't count toward the length: they sit above the text.
  const length = words(recapText({ ...recap, matchups: recap.matchups.map(({ text }) => ({ text })) }));
  if (length > MAX_WORDS) out.push(`The recap is ${length} words; keep it under ${MAX_WORDS}.`);
  const noHead = recap.matchups.filter((m) => !m.headline.trim()).map((m) => m.winner);
  if (noHead.length) out.push(`Every game needs a headline (missing: ${noHead.join(', ')}).`);
  const longHead = recap.matchups.filter((m) => m.headline.length > MAX_GAME_HEADLINE).map((m) => m.winner);
  if (longHead.length) out.push(`Keep each game headline under ${MAX_GAME_HEADLINE} characters (too long: ${longHead.join(', ')}).`);
  const stock = bannedIn(recap);
  if (stock.length) out.push(`Don't use stock lines: ${stock.map((b) => `"${b}"`).join(', ')}. Write a specific joke instead.`);
  const reused = reusedIn(recap, recentJokes);
  if (reused.length) out.push(`These were in a recent recap; write new ones: ${reused.map((x) => `"${x}"`).join(' ')}`);
  const long = recap.matchups.filter((m) => words(m.text) > MAX_GAME_WORDS).map((m) => m.winner);
  if (long.length) out.push(`Keep each game under ${MAX_GAME_WORDS} words (too long: ${long.join(', ')}).`);
  if (recap.storylines.length > MAX_STORYLINES) out.push(`At most ${MAX_STORYLINES} storylines.`);
  const bad = checkNumbers(recap, { facts, storylines });
  if (bad.length) out.push(`These numbers aren't in the facts: ${bad.join(', ')}. Use only numbers from the JSON, exactly as written.`);
  return out;
}

/** The banned stock lines a recap uses, matched as whole words. */
export function bannedIn(recap) {
  const text = recapText(recap).toLowerCase().replace(/[\u2018\u2019]/g, "'");
  return BANNED_LINES.filter((b) => new RegExp(`(^|[^a-z'])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z'])`).test(text));
}

/** A recap's sentences, normalised for comparing. */
const sentences = (text) =>
  String(text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

/** Sentences of four or more words that a recent recap already used. */
export function reusedIn(recap, recentJokes) {
  const seen = new Set((recentJokes ?? []).map(norm));
  return [...new Set(sentences(recapText(recap)).filter((x) => x.split(/\s+/).length >= 4 && seen.has(norm(x))))];
}

/**
 * The jokes from past recaps the writer shouldn't repeat: each recap's
 * headline, its game headlines, and the last line of its intro and of
 * every game, where the punchlines go.
 */
export function recentJokesFrom(recaps) {
  const out = [];
  for (const r of recaps) {
    if (!r) continue;
    out.push(r.headline, sentences(r.intro).at(-1));
    for (const m of r.matchups ?? []) out.push(m.headline, sentences(m.text).at(-1));
  }
  return [...new Set(out.filter(Boolean))];
}
