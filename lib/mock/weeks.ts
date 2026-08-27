import type { Week } from '@/lib/types';

/**
 * The weeks the prototype knows about, in the order the design's dropdown
 * lists them. `n` is both the NFL week and the `?week=` value.
 */
export const WEEKS: Week[] = [
  { n: 12, label: 'Week 12 · next', note: 'THU 8:15', status: 'future' },
  { n: 11, label: 'Week 11 · current', note: 'LIVE', status: 'current' },
  { n: 10, label: 'Week 10', note: 'W 118.2–101.6', status: 'past' },
  { n: 9, label: 'Week 9', note: 'L 94.0–110.7', status: 'past' },
];

export const CURRENT_WEEK = 11;

export function getWeek(n: number): Week {
  return WEEKS.find((w) => w.n === n) ?? WEEKS[1];
}

/** Phase is a property of the week, not a control the user can flip. */
export function phaseForWeek(n: number) {
  const status = getWeek(n).status;
  return status === 'past' ? 'final' : status === 'future' ? 'pre' : 'live';
}

/** True when `n` is a week the prototype has data for. */
export function isKnownWeek(n: number): boolean {
  return WEEKS.some((w) => w.n === n);
}
