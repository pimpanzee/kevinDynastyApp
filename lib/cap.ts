/** Dead cap if cut: this season's cap hit × years left × 30% (league rule). */
export const deadCap = (salary: number, years: number) => Math.round(salary * Math.max(1, years) * 0.3 * 100) / 100;
