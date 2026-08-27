import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet, num } from './client';

/**
 * Franchise rosters, including this league's dynasty contract fields (salary,
 * contract year) and where each player sits — active, taxi squad or IR.
 */

export type RosterStatus = 'ROSTER' | 'TAXI_SQUAD' | 'INJURED_RESERVE';

export interface RosterSlot {
  playerId: string;
  salary: number;
  contractYear: number;
  contractStatus: string;
  status: RosterStatus;
}

interface RawRosters {
  rosters?: { franchise?: RawFranchise | RawFranchise[] };
}
interface RawFranchise { id?: string; player?: RawSlot | RawSlot[] }
interface RawSlot {
  id?: string;
  salary?: string;
  contractYear?: string;
  contractStatus?: string;
  status?: string;
}

/** All franchises' rosters in one request, keyed by franchise id. */
export async function getRosters(season: string = SEASON, week?: number): Promise<Map<string, RosterSlot[]>> {
  const body = await mflGet<RawRosters>('rosters', {
    params: { W: week },
    ttl: TTL.ROSTERS,
    season,
    cacheKey: `rosters:${season}:${week ?? 'current'}`,
  });

  const out = new Map<string, RosterSlot[]>();
  for (const f of asArray(body.rosters?.franchise)) {
    if (!f.id) continue;
    out.set(
      f.id,
      asArray(f.player)
        .filter((p) => p.id)
        .map((p) => ({
          playerId: p.id as string,
          salary: num(p.salary),
          contractYear: num(p.contractYear),
          contractStatus: p.contractStatus ?? '',
          status: (p.status as RosterStatus) ?? 'ROSTER',
        })),
    );
  }
  return out;
}

/** Salary-cap adjustments, if the league records any. Absent leagues yield 0. */
export async function getSalaryAdjustments(season: string = SEASON): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const body = await mflGet<{
      salaryAdjustments?: { salaryAdjustment?: Array<{ franchise_id?: string; amount?: string }> | { franchise_id?: string; amount?: string } };
    }>('salaryAdjustments', { ttl: TTL.ROSTERS, season });
    for (const a of asArray(body.salaryAdjustments?.salaryAdjustment)) {
      if (!a.franchise_id) continue;
      out.set(a.franchise_id, (out.get(a.franchise_id) ?? 0) + num(a.amount));
    }
  } catch {
    // Not every league uses adjustments; absence is not an error.
  }
  return out;
}
