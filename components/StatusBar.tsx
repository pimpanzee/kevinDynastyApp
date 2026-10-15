/**
 * Retired with the Hashmark redesign (no status strip). Kept as a no-op so a
 * screen not yet migrated still compiles.
 */
export default function StatusBar(_: { label: string; simulatedAt?: string | null }) {
  return null;
}
