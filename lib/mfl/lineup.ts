import type { League } from './league';

/**
 * Pick the best starting lineup from a pool, honouring the league's starter
 * requirements (this league: 7–10 starters, QB 1-2, RB 2-5, WR 3-6, TE 1-4).
 *
 * Needed because a week that has not been played has no submitted lineup, so a
 * projected team total has to assume the manager starts their best available
 * players. Once a week is played, MFL reports the real starters and this is
 * not used.
 */

export interface Startable {
  id: string;
  position: string;
  points: number;
}

export function bestLineup<T extends Startable>(pool: T[], lineup: League['lineup']): T[] {
  const byPosition = new Map<string, T[]>();
  for (const p of pool) {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }
  for (const list of byPosition.values()) list.sort((a, b) => b.points - a.points);

  const chosen: T[] = [];
  const used = new Map<string, number>();

  // Positional minimums first — they are mandatory regardless of projection.
  for (const [position, limit] of Object.entries(lineup.positions)) {
    const list = byPosition.get(position) ?? [];
    const take = list.slice(0, limit.min);
    chosen.push(...take);
    used.set(position, take.length);
  }

  // Then fill the flex space with the best remaining, respecting per-position
  // maximums and the overall starter cap.
  const remaining = pool
    .filter((p) => !chosen.includes(p))
    .sort((a, b) => b.points - a.points);

  for (const p of remaining) {
    if (chosen.length >= lineup.max) break;
    const limit = lineup.positions[p.position];
    if (!limit) continue;
    const count = used.get(p.position) ?? 0;
    if (count >= limit.max) continue;
    chosen.push(p);
    used.set(p.position, count + 1);
  }

  return chosen;
}

export function sumPoints(players: Startable[]): number {
  return Number(players.reduce((t, p) => t + p.points, 0).toFixed(2));
}
