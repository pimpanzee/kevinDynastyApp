/** Position colour token: QB, RB, WR, TE, and draft picks. Anything else reads grey. */
export function posColor(pos: string | undefined): string {
  switch ((pos ?? '').toUpperCase()) {
    case 'QB': return 'var(--pos-qb)';
    case 'RB': return 'var(--pos-rb)';
    case 'WR': return 'var(--pos-wr)';
    case 'TE': return 'var(--pos-te)';
    case 'PICK': return 'var(--pos-pick)';
    default: return 'var(--ink-3)';
  }
}

export const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];

/** Sort key for a position: QB, RB, WR, TE, then everything else. */
export function posRank(pos: string | undefined): number {
  const i = POS_ORDER.indexOf((pos ?? '').toUpperCase());
  return i < 0 ? POS_ORDER.length : i;
}
