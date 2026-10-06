import { SIM_NOW } from '@/lib/config';

/**
 * The app's notion of "now".
 *
 * With MFL_SIM_NOW set, this returns that fixed instant instead of wall-clock
 * time, and every read is filtered so nothing that happened after it is shown.
 * That lets a completed season be replayed through its real pre / live / final
 * states — the 2026 season has not started, so simulating 2025 is the only way
 * to exercise those states against genuine data.
 *
 * An `?now=<ISO>` query parameter overrides it per request, so different
 * scenarios can be checked without restarting the server.
 */

export function resolveNow(override?: string | null): Date {
  const candidate = override || SIM_NOW;
  if (candidate) {
    const d = new Date(candidate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** True when the app is running against a simulated clock rather than live time. */
export function isSimulated(override?: string | null): boolean {
  return Boolean(override || SIM_NOW);
}

// The formatters are pure and also run in the browser (lib/live.ts), so they
// live with the other display helpers.
export { formatClock, formatKickoff } from '@/lib/format';
