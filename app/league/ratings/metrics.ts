import type { RatingsView } from '@/lib/types';

type Row = RatingsView['rows'][number];
export type MetricKey = 'pwr' | 'elo' | 'allPlay' | 'luck';

export interface Metric {
  key: MetricKey;
  label: string;
  name: string;
  /** One plain sentence: what the number tells you. */
  short: string;
  /** How it's worked out, in plain words. */
  how: string[];
  /** How to read the number: label and meaning, best first. */
  scale: Array<[string, string]>;
  /** A sentence about this team's own number. */
  example: (r: Row) => string;
  /** Sort value for league high / low. */
  value: (r: Row) => number;
  show: (r: Row) => string;
}

const apPct = (r: Row) => {
  const [w = 0, l = 0, t = 0] = r.allPlay.split('-').map(Number);
  const n = w + l + t;
  return n ? (w + t / 2) / n : 0;
};
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

export const METRICS: Metric[] = [
  {
    key: 'pwr',
    label: 'PWR',
    name: 'Power score',
    short: 'Who is actually the best team right now, on a 0 to 100 scale where 50 is an average team.',
    how: [
      'It mixes four things: your all-play record (40%), how much you scored in the last 3 weeks (25%), your total points (20%), and how well you set your lineup (15%).',
      'Each one is compared with the rest of the league, so a 60 means "clearly better than average", not "60 points".',
      'Lineup efficiency is the points you started divided by the most you could have scored with your best lineup. Leaving 30 on the bench hurts.',
      'The rank and the arrow next to each team come from PWR. The arrow is how many places they moved since last week.',
    ],
    scale: [['65+', 'Contender'], ['50', 'Average'], ['Under 35', 'Rough season']],
    example: (r) => `${r.pwr} is ${r.pwr >= 65 ? 'contender level' : r.pwr > 52 ? 'above average' : r.pwr >= 48 ? 'right around average' : r.pwr > 35 ? 'below average' : 'near the bottom'}, good for #${r.rank} in the league.`,
    value: (r) => r.pwr,
    show: (r) => String(r.pwr),
  },
  {
    key: 'elo',
    label: 'ELO',
    name: 'Head-to-head rating',
    short: 'A chess-style rating that only cares about who you actually played and whether you won.',
    how: [
      'Everyone starts the season at 1500. When you win, you take rating points from the team you beat. When you lose, you give them up.',
      'Beating a team rated higher than you earns more. Losing to a team rated lower costs more. Beating a bad team barely moves it.',
      'Blowouts count a bit more than nail-biters (up to 1.5×), close games a bit less.',
    ],
    scale: [['1550+', 'Strong'], ['1500', 'Average'], ['Under 1450', 'Struggling']],
    example: (r) => {
      const d = r.elo - 1500;
      return `${r.elo.toLocaleString('en-US')} is ${Math.abs(d)} ${d >= 0 ? 'above' : 'below'} where everyone started.`;
    },
    value: (r) => r.elo,
    show: (r) => r.elo.toLocaleString('en-US'),
  },
  {
    key: 'allPlay',
    label: 'ALL-PLAY',
    name: 'Record vs everyone',
    short: 'Your record if you had played every other team in the league every single week.',
    how: [
      'Each week your score is checked against every other team’s score. Top score of the week goes 11-0, lowest goes 0-11.',
      'Add those up over the season and you get your all-play record.',
      'It takes your schedule out of it: it shows how good your scores were, not who you happened to draw.',
    ],
    scale: [['Over .600', 'Scoring with the best'], ['.500', 'Middle of the pack'], ['Under .400', 'Scoring is the problem']],
    example: (r) => `${r.allPlay} means you outscored ${Math.round(apPct(r) * 100)}% of the league’s teams in an average week.`,
    value: apPct,
    show: (r) => r.allPlay,
  },
  {
    key: 'luck',
    label: 'LUCK',
    name: 'Luck',
    short: 'How many more (or fewer) wins you have than your scores deserve.',
    how: [
      'Take your all-play win rate and multiply it by games played. That’s how many wins an average schedule would have given you.',
      'Luck is your real wins minus that number.',
      'Plus means you’ve won more than your scoring earned: easy schedule, or opponents had bad weeks against you. Minus means you’ve been robbed.',
    ],
    scale: [['+0.5 or more', 'Lucky (blue)'], ['−0.4 to +0.4', 'About fair (grey)'], ['−0.5 or less', 'Unlucky (orange)']],
    example: (r) => r.luck === 0
      ? 'Exactly 0.0: your record is what your scoring deserves.'
      : `${signed(r.luck)} means about ${Math.abs(r.luck).toFixed(1)} ${Math.abs(r.luck) === 1 ? 'win' : 'wins'} ${r.luck > 0 ? 'more' : 'fewer'} than your scoring has earned.`,
    value: (r) => r.luck,
    show: (r) => signed(r.luck),
  },
];
