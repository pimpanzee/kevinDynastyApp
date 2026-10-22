/** Dead cap if cut: this season's cap hit × years left × 30% (league rule). */
export const deadCap = (salary: number, years: number) => Math.round(salary * Math.max(1, years) * 0.3 * 100) / 100;

/**
 * Cap used the way MFL counts it: every non-taxi salary (active and IR) plus
 * salary adjustments (dead cap, carryover, refunds). MFL refuses lineups over the cap.
 */
export function capUsed(roster: Array<{ status: string; salary: number }>, adjust: number): number {
  return Math.round((roster.filter((p) => p.status !== 'TAXI_SQUAD').reduce((t, p) => t + p.salary, 0) + adjust) * 100) / 100;
}

/** How far over the cap, rounded to cents; 0 when at or under. */
export const overCapBy = (used: number, cap: number) => (cap > 0 && used > cap ? Math.round((used - cap) * 100) / 100 : 0);
