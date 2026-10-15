/**
 * The league's rookie salary scale: base salary by draft round and slot
 * (1–12). MFL doesn't expose it, so it lives here, in one place. Round 4 is
 * a flat $5. Rookie contracts run two years; the second year is +10%.
 */
export const ROOKIE_SCALE: Record<number, number[]> = {
  1: [125, 122, 119, 116, 112, 108, 104, 100, 96, 92, 88, 84],
  2: [72, 69, 66, 63, 60, 57, 53, 49, 45, 41, 37, 33],
  3: [28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6],
  4: Array(12).fill(5),
};

/** Base rookie salary for a pick; rounds past the table pay the round-4 floor. */
export function rookieSalary(round: number, slot: number): number {
  const row = ROOKIE_SCALE[round] ?? ROOKIE_SCALE[4];
  return row[Math.min(Math.max(slot, 1), row.length) - 1];
}

/** "2.10", never "2.1". */
export function slotLabel(round: number, slot: number): string {
  return `${round}.${String(slot).padStart(2, '0')}`;
}

/**
 * True when MFL marks the contract as a rookie-draft deal: contractStatus
 * holds the draft round as "1.0"–"4.0" (sometimes with a trailing space) or
 * "Rd1". "FT1" is a franchise tag; blank is an ordinary contract.
 */
export function isRookieContract(contractStatus: string): boolean {
  return /^(\d)\.0$|^Rd\d$/i.test(contractStatus.trim());
}
