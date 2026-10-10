import { FRANCHISE_ID, SEASON } from '@/lib/config';
import { TTL } from '@/lib/mfl/cache';
import { asArray, mflGet } from '@/lib/mfl/client';
import { getLeague } from '@/lib/mfl/league';
import { getPlayers, lookup } from '@/lib/mfl/players';
import { getRosters, getSalaryAdjustments } from '@/lib/mfl/rosters';
import type { CapView, PickBoardView } from '@/lib/types';

/**
 * League-wide money and picks: every franchise's cap position side by side,
 * and who holds each future draft pick. Built at build time from MFL.
 *
 * Contract years count down: 1 is a contract's final season. Future
 * commitments assume today's salaries carry over (MFL has no escalators here).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getCapView(): Promise<CapView> {
  const [league, rosters, adjustments, players] = await Promise.all([
    getLeague(), getRosters(SEASON), getSalaryAdjustments(), getPlayers(),
  ]);

  const teams = league.franchises.map((f) => {
    const slots = rosters.get(f.id) ?? [];
    // The taxi squad doesn't count against the cap; IR does, in this league.
    const counting = slots.filter((s) => s.status !== 'TAXI_SQUAD');
    const salary = counting.reduce((t, s) => t + s.salary, 0);
    const adj = adjustments.get(f.id) ?? 0;
    const expiring = counting
      .filter((s) => s.contractYear <= 1)
      .map((s) => {
        const p = lookup(players, s.playerId);
        return { id: s.playerId, name: p.name, pos: p.position, salary: s.salary };
      })
      .sort((a, b) => b.salary - a.salary);
    return {
      id: f.id,
      name: f.name,
      abbrev: f.abbrev || f.name.slice(0, 4),
      icon: f.icon,
      salary: round2(salary),
      adj: round2(adj),
      room: round2(league.salaryCap - salary - adj),
      next: round2(counting.filter((s) => s.contractYear >= 2).reduce((t, s) => t + s.salary, 0)),
      after: round2(counting.filter((s) => s.contractYear >= 3).reduce((t, s) => t + s.salary, 0)),
      expiring,
      expiringTotal: round2(expiring.reduce((t, p) => t + p.salary, 0)),
      counts: {
        roster: slots.filter((s) => s.status === 'ROSTER').length,
        taxi: slots.filter((s) => s.status === 'TAXI_SQUAD').length,
        ir: slots.filter((s) => s.status === 'INJURED_RESERVE').length,
      },
    };
  });

  return { cap: league.salaryCap, season: Number(SEASON), limits: league.limits, teams, myFranchiseId: FRANCHISE_ID };
}

interface RawPicks {
  futureDraftPicks?: {
    franchise?: Array<{ id?: string; futureDraftPick?: RawPick | RawPick[] }> | { id?: string; futureDraftPick?: RawPick | RawPick[] };
  };
}
interface RawPick { year?: string; round?: string; originalPickFor?: string }

export async function getPickBoard(): Promise<PickBoardView> {
  const [league, body] = await Promise.all([
    getLeague(),
    mflGet<RawPicks>('futureDraftPicks', { ttl: TTL.ROSTERS, cacheKey: `futureDraftPicks:${SEASON}` }),
  ]);

  // year → original franchise → round → current owner
  const held = new Map<string, Map<string, Map<number, string>>>();
  const maxRound = new Map<string, number>();
  for (const f of asArray(body.futureDraftPicks?.franchise)) {
    for (const p of asArray(f.futureDraftPick)) {
      if (!f.id || !p.year || !p.originalPickFor || !p.round) continue;
      const round = Number(p.round);
      if (!held.has(p.year)) held.set(p.year, new Map());
      const byOrig = held.get(p.year)!;
      if (!byOrig.has(p.originalPickFor)) byOrig.set(p.originalPickFor, new Map());
      byOrig.get(p.originalPickFor)!.set(round, f.id);
      maxRound.set(p.year, Math.max(maxRound.get(p.year) ?? 0, round));
    }
  }

  const years = [...held.keys()].sort().map((year) => {
    const rounds = maxRound.get(year) ?? 0;
    const byOrig = held.get(year)!;
    return {
      year,
      rounds,
      rows: league.franchises.map((f) => ({
        original: f.id,
        owners: Array.from({ length: rounds }, (_, i) => byOrig.get(f.id)?.get(i + 1) ?? null),
      })),
    };
  });

  return {
    years,
    franchises: league.franchises.map((f) => ({ id: f.id, name: f.name, abbrev: f.abbrev || f.name.slice(0, 4), icon: f.icon })),
    myFranchiseId: FRANCHISE_ID,
  };
}
