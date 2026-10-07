import { FRANCHISE_ID, SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet, num } from './client';

/**
 * League settings, franchises and the division/conference tree. Effectively
 * static within a season, so cached for a day.
 */

export interface Franchise {
  id: string;
  name: string;
  divisionId: string;
  conferenceId: string;
  isMine: boolean;
  /** Owner-uploaded square icon (or, failing that, the logo). */
  icon?: string;
  /** MFL's short name for the franchise, e.g. "Tuna". */
  abbrev: string;
}

export interface League {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  lastRegularSeasonWeek: number;
  salaryCap: number;
  usesSalaries: boolean;
  franchises: Franchise[];
  /** Ordered conference → division groups, for the standings screen. */
  groups: Array<{ id: string; label: string; franchiseIds: string[] }>;
  /** Starting-lineup requirements, used to project a best lineup. */
  lineup: { min: number; max: number; positions: Record<string, { min: number; max: number }> };
  /**
   * Victory-point scoring, when the league uses it (standingsSort leads with
   * VICTORY_POINTS): points for a head-to-head win/loss/tie, plus `buckets` —
   * the week's scorers split into equal groups by score, highest first, each
   * worth its points ("1 0": the top half earns 1). Null when not in use.
   */
  victoryPoints: {
    win: number; loss: number; tie: number; buckets: number[]; startWeek: number; endWeek: number;
  } | null;
}

interface RawLeague {
  league: {
    id?: string;
    name?: string;
    startWeek?: string;
    endWeek?: string;
    lastRegularSeasonWeek?: string;
    salaryCapAmount?: string;
    usesSalaries?: string;
    franchises?: { franchise?: RawFranchise | RawFranchise[] };
    conferences?: { conference?: RawConf | RawConf[] };
    divisions?: { division?: RawDiv | RawDiv[] };
    starters?: { count?: string; position?: RawPos | RawPos[] };
    standingsSort?: string;
    victoryPointsWin?: string;
    victoryPointsLoss?: string;
    victoryPointsTie?: string;
    victoryPointsBuckets?: string;
    victoryPointsStartWeek?: string;
    victoryPointsEndWeek?: string;
  };
}
interface RawFranchise { id?: string; name?: string; abbrev?: string; division?: string; conference?: string; icon?: string; logo?: string }

/** Owners paste any URL; keep web images only, and load them over https. */
function imageUrl(...candidates: Array<string | undefined>): string | undefined {
  const url = candidates.map((c) => c?.trim()).find((c) => c && /^https?:\/\//i.test(c));
  return url?.replace(/^http:/i, 'https:');
}
interface RawConf { id?: string; name?: string }
interface RawDiv { id?: string; name?: string; conference?: string }
interface RawPos { name?: string; limit?: string }

/** MFL writes limits as "2-5" (min-max) or a bare number. */
function parseLimit(limit: string | undefined): { min: number; max: number } {
  const [lo, hi] = (limit ?? '').split('-');
  const min = num(lo);
  return { min, max: hi === undefined || hi === '' ? min : num(hi, min) };
}

export async function getLeague(season: string = SEASON): Promise<League> {
  const body = await mflGet<RawLeague>('league', { ttl: TTL.LEAGUE, season });
  const lg = body.league ?? {};

  const conferences = asArray(lg.conferences?.conference);
  const divisions = asArray(lg.divisions?.division);
  const confName = new Map(conferences.map((c) => [c.id ?? '', c.name ?? '']));
  const divConf = new Map(divisions.map((d) => [d.id ?? '', d.conference ?? '']));

  const franchises: Franchise[] = asArray(lg.franchises?.franchise).map((f) => {
    const divisionId = f.division ?? '';
    return {
      id: f.id ?? '',
      name: (f.name ?? '').trim(),
      divisionId,
      // Franchises carry a division but not a conference; the conference comes
      // from the division tree.
      conferenceId: f.conference ?? divConf.get(divisionId) ?? '',
      isMine: f.id === FRANCHISE_ID,
      icon: imageUrl(f.icon, f.logo),
      abbrev: (f.abbrev ?? '').trim(),
    };
  });

  // Group in conference, then division order — how the standings screen reads.
  const groups = divisions
    .slice()
    .sort((a, b) => {
      const ca = (divConf.get(a.id ?? '') ?? '').localeCompare(divConf.get(b.id ?? '') ?? '');
      return ca !== 0 ? ca : (a.id ?? '').localeCompare(b.id ?? '');
    })
    .map((d) => {
      const cid = d.conference ?? '';
      const cname = confName.get(cid) ?? `Conference ${num(cid) + 1}`;
      return {
        id: d.id ?? '',
        label: `${cname} · ${(d.name ?? '').trim()}`.toUpperCase(),
        franchiseIds: franchises.filter((f) => f.divisionId === d.id).map((f) => f.id),
      };
    })
    .filter((g) => g.franchiseIds.length > 0);

  const positions: Record<string, { min: number; max: number }> = {};
  for (const p of asArray(lg.starters?.position)) {
    if (p.name) positions[p.name] = parseLimit(p.limit);
  }
  const lineup = { ...parseLimit(lg.starters?.count), positions };

  return {
    id: lg.id ?? '',
    name: (lg.name ?? '').trim(),
    startWeek: num(lg.startWeek, 1),
    endWeek: num(lg.endWeek, 17),
    lastRegularSeasonWeek: num(lg.lastRegularSeasonWeek, 14),
    victoryPoints: /VICTORY_POINTS/.test(lg.standingsSort ?? '')
      ? {
          win: num(lg.victoryPointsWin, 1),
          loss: num(lg.victoryPointsLoss, 0),
          tie: num(lg.victoryPointsTie, 0),
          buckets: (lg.victoryPointsBuckets ?? '').trim().split(/\s+/).filter(Boolean).map(Number),
          startWeek: num(lg.victoryPointsStartWeek, 1),
          endWeek: num(lg.victoryPointsEndWeek, num(lg.lastRegularSeasonWeek, 14)),
        }
      : null,
    salaryCap: num(lg.salaryCapAmount),
    usesSalaries: lg.usesSalaries === '1',
    franchises,
    groups,
    lineup: { min: lineup.min, max: lineup.max, positions },
  };
}

export function franchiseName(league: League, id: string): string {
  return league.franchises.find((f) => f.id === id)?.name ?? id;
}
