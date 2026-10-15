import { FRANCHISE_ID, SEASON } from '@/lib/config';
import { computeContractValues } from '@/lib/contractValue';
import { getByeWeeks } from '@/lib/mfl/byes';
import { TTL } from '@/lib/mfl/cache';
import { asArray, mflGet } from '@/lib/mfl/client';
import { getInjuries } from '@/lib/mfl/injuries';
import { getLeague } from '@/lib/mfl/league';
import { getPlayers, lookup } from '@/lib/mfl/players';
import { getRosters, getSalaryAdjustments } from '@/lib/mfl/rosters';
import { computeStandings, sortDivision } from '@/lib/mfl/standings';
import { rookieSalary, slotLabel } from '@/lib/rookieScale';
import { getSeasonTotals } from '@/lib/seasonTotals';
import type { TeamPick, TeamPlayer, TeamsData, TeamView } from '@/lib/types';

/**
 * Everything My Team (Roster, Cap, Picks) and the League team pages show,
 * for every franchise — the viewer picks their team in the browser, so all
 * twelve are built. Money is in raw dollars; the screens format it.
 */

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
/** League minimum for a legal active roster (MFL only stores the maximum). */
const ROSTER_MIN = 20;
/** Committed-by-year looks this many seasons ahead. */
const YEARS_AHEAD = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface RawPicks {
  futureDraftPicks?: {
    franchise?: Array<{ id?: string; futureDraftPick?: RawPick | RawPick[] }> | { id?: string; futureDraftPick?: RawPick | RawPick[] };
  };
}
interface RawPick { year?: string; round?: string; originalPickFor?: string }

async function load(): Promise<TeamsData> {
  const [league, players, rosters, adjustments, injuries, byes, { done, totals }, picksBody] = await Promise.all([
    getLeague(), getPlayers(), getRosters(SEASON), getSalaryAdjustments(), getInjuries(), getByeWeeks(), getSeasonTotals(),
    mflGet<RawPicks>('futureDraftPicks', { ttl: TTL.ROSTERS, cacheKey: `futureDraftPicks:${SEASON}` }),
  ]);
  const standings = await computeStandings(done, league);
  const season = Number(SEASON);
  const minSalary = 5;

  // Contract value, league-wide.
  const all = [...rosters.entries()].flatMap(([, slots]) => slots.map((s) => {
    const p = lookup(players, s.playerId);
    const t = totals.get(s.playerId);
    return {
      slot: s, p, t,
      input: {
        id: s.playerId, pos: p.position, salary: s.salary, years: s.contractYear, contractStatus: s.contractStatus,
        taxi: s.status === 'TAXI_SQUAD', ppg: t && t.gp > 0 ? t.pts / t.gp : null,
      },
    };
  })).filter((x) => POSITIONS.includes(x.p.position));
  const values = computeContractValues(all.map((x) => x.input), minSalary);

  // Projected draft order from the current standings: worst record picks first.
  const order = sortDivision([...standings.values()]).map((r) => r.franchiseId);
  const n = league.franchises.length;
  const slotFor = (franchiseId: string) => {
    const i = order.indexOf(franchiseId);
    return i < 0 ? Math.ceil(n / 2) : n - i;
  };
  const nameOf = (id: string) => league.franchises.find((f) => f.id === id)?.name ?? id;

  // year → list of { owner, original, round }
  const pickList: Array<{ year: number; round: number; owner: string; original: string }> = [];
  for (const f of asArray(picksBody.futureDraftPicks?.franchise)) {
    for (const p of asArray(f.futureDraftPick)) {
      if (!f.id || !p.year || !p.round || !p.originalPickFor) continue;
      pickList.push({ year: Number(p.year), round: Number(p.round), owner: f.id, original: p.originalPickFor });
    }
  }
  const pickYears = [...new Set(pickList.map((p) => p.year))].sort();

  const teams: TeamView[] = league.franchises.map((f) => {
    const slots = rosters.get(f.id) ?? [];
    const row = standings.get(f.id);
    const mine = all.filter((x) => slots.includes(x.slot));

    const roster: TeamPlayer[] = mine.map(({ slot, p, t }): TeamPlayer => {
      const v = values.get(slot.playerId);
      return {
        id: slot.playerId, name: p.fullName, pos: p.position, team: p.team, bye: byes.get(p.team) ?? null,
        injury: injuries.get(slot.playerId), rank: v?.rank ?? null, gp: t?.gp ?? 0, pts: t?.pts ?? 0,
        ppg: t && t.gp > 0 ? round2(t.pts / t.gp) : null, salary: slot.salary, years: Math.max(1, slot.contractYear),
        status: slot.contractStatus.trim(), slot: slot.status === 'TAXI_SQUAD' ? 'TAXI' : slot.status === 'INJURED_RESERVE' ? 'IR' : 'ACTIVE',
        market: v?.market ?? null, value: v?.value ?? null, contractValue: v?.contractValue ?? null,
      };
    }).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || (a.rank ?? 999) - (b.rank ?? 999) || b.salary - a.salary);

    const counting = roster.filter((p) => p.slot !== 'TAXI');
    const adj = adjustments.get(f.id) ?? 0;
    const used = round2(counting.reduce((t, p) => t + p.salary, 0) + adj);
    const split = [
      ...POSITIONS.map((pos) => ({ label: pos, amount: round2(counting.filter((p) => p.slot === 'ACTIVE' && p.pos === pos).reduce((t, p) => t + p.salary, 0)) })),
      { label: 'IR', amount: round2(counting.filter((p) => p.slot === 'IR').reduce((t, p) => t + p.salary, 0)) },
    ];

    // Picks: held (own or acquired) and own picks traded away.
    const picks = pickYears.map((year) => {
      const held = pickList.filter((p) => p.year === year && p.owner === f.id);
      const gone = pickList.filter((p) => p.year === year && p.original === f.id && p.owner !== f.id);
      const list: TeamPick[] = [
        ...held.map((p) => {
          const slot = slotFor(p.original);
          return {
            round: p.round, held: true, title: p.original === f.id ? 'Own pick' : `via ${nameOf(p.original)}`,
            slot: slotLabel(p.round, slot), salary: rookieSalary(p.round, slot),
          };
        }),
        ...gone.map((p) => ({ round: p.round, held: false, title: `Traded to ${nameOf(p.owner)}`, slot: '', salary: 0 })),
      ].sort((a, b) => a.round - b.round || Number(b.held) - Number(a.held));
      return { year, picks: list, count: held.length, total: round2(list.reduce((t, p) => t + p.salary, 0)) };
    });
    const pickTotal = (year: number) => picks.find((y) => y.year === year)?.total ?? 0;

    // Committed by year: contracts still running (+10% a year) plus last draft's rookies in their
    // second year (+10%); the year's own draft picks at their rookie salaries.
    const committed = Array.from({ length: YEARS_AHEAD }, (_, i) => {
      const k = i + 1;
      const year = season + k;
      const contracts = counting.filter((p) => p.years > k).reduce((t, p) => t + p.salary * 1.1 ** k, 0)
        + (k >= 2 ? pickTotal(year - 1) * 1.1 : 0);
      return { year, contracts: round2(contracts), picks: pickTotal(year) };
    });

    const valued = counting.filter((p) => p.contractValue !== null && p.value !== null && Math.abs(p.value) >= 25 && p.gp > 0)
      .sort((a, b) => (b.contractValue ?? 0) - (a.contractValue ?? 0));

    return {
      id: f.id, name: f.name, icon: f.icon ?? null,
      record: row ? row.record.replace(/-0$/, '') : '0-0',
      vp: league.victoryPoints && row ? row.vp : null,
      avgPf: row?.avgPf ?? 0,
      pp: row?.pp ?? 0,
      counts: {
        roster: slots.filter((s) => s.status === 'ROSTER').length,
        ir: slots.filter((s) => s.status === 'INJURED_RESERVE').length,
        taxi: slots.filter((s) => s.status === 'TAXI_SQUAD').length,
      },
      adj: round2(adj), used, room: round2(league.salaryCap - used), split,
      roster,
      best: valued.filter((p) => (p.contractValue ?? 0) > 0).slice(0, 3).map((p) => p.id),
      worst: valued.filter((p) => (p.contractValue ?? 0) < 0).reverse().slice(0, 3).map((p) => p.id),
      committed,
      expiring: counting.filter((p) => p.years <= 1).sort((a, b) => b.salary - a.salary).map((p) => p.id),
      picks,
    };
  });

  return {
    season, cap: league.salaryCap,
    limits: { rosterMin: ROSTER_MIN, rosterMax: league.limits.roster, ir: league.limits.ir, taxi: league.limits.taxi },
    myFranchiseId: FRANCHISE_ID,
    teams,
  };
}

let cache: Promise<TeamsData> | null = null;
export const getTeamsData = () => (cache ??= load());
