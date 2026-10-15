/** "$1,196.80"; negatives as "-$12.00". */
export function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1,302.6" */
export function pts1(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "+$273" / "−$330", whole dollars. */
export function signedDollars(n: number): string {
  return `${n > 0 ? '+' : '−'}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

export const DISPLAY = (size: number, weight = 700) => `${weight} ${size}px/1 var(--font-display)`;
