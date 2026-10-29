import type { TeamPlayer, TeamsData, TeamView } from '@/lib/types';

/**
 * One thing that can move in a trade, as the trade screens show it. `key` is
 * what MFL's tradeProposal takes: a player id, or a pick's FP_ id.
 */
export interface TradeAsset {
  key: string;
  kind: 'player' | 'pick';
  name: string;
  pos: string;
  /** "PHI · 2 YRS" or "Own pick · 1.04". */
  meta: string;
  /** Salary shown in the list; 0 for picks. */
  salary: number;
  /** Salary that counts against the cap (taxi players don't). */
  capHit: number;
  /** Counts toward the 20–22 active roster limit. */
  active: boolean;
  slot?: TeamPlayer['slot'];
  injury?: string;
  years?: number;
}

const yrs = (n: number) => `${n} ${n === 1 ? 'YR' : 'YRS'}`;

export function tradeAssets(team: TeamView): TradeAsset[] {
  const players: TradeAsset[] = team.roster.map((p) => ({
    key: p.id, kind: 'player', name: p.name, pos: p.pos, meta: `${p.team || 'FA'} · ${yrs(p.years)}`,
    salary: p.salary, capHit: p.slot === 'TAXI' ? 0 : p.salary, active: p.slot === 'ACTIVE',
    slot: p.slot, injury: p.injury, years: p.years,
  }));
  const picks: TradeAsset[] = team.picks.flatMap((y) => y.picks
    .filter((k) => k.held && k.asset)
    .map((k) => ({
      key: k.asset!, kind: 'pick' as const, name: `${y.year} Round ${k.round}`, pos: 'PICK',
      meta: [k.title, k.slot].filter(Boolean).join(' · '), salary: 0, capHit: 0, active: false,
    })));
  return [...players, ...picks];
}

/** Every team's assets by key, to name the players and picks in an offer. */
export function assetIndex(data: TeamsData): Map<string, TradeAsset & { team: string }> {
  const out = new Map<string, TradeAsset & { team: string }>();
  for (const t of data.teams) for (const a of tradeAssets(t)) out.set(a.key, { ...a, team: t.id });
  return out;
}

/** A pick id MFL sends that isn't in the build's data (FP_0005_2027_2 → "2027 Round 2"). */
export function pickName(key: string): string | null {
  const fp = /^FP_\d{4}_(\d{4})_(\d{1,2})$/.exec(key);
  if (fp) return `${fp[1]} Round ${fp[2]}`;
  const dp = /^DP_(\d{2})_(\d{2})$/.exec(key);
  if (dp) return `Pick ${Number(dp[1]) + 1}.${String(Number(dp[2]) + 1).padStart(2, '0')}`;
  return null;
}

/**
 * League rule: the team sending a player may keep 30% of his salary, on an
 * expiring contract (1 year left), once. MFL trades can't carry it, so the
 * app counts it in the cap check and writes it into the offer's note; the
 * commish records it as an MFL salary adjustment.
 */
export const RETAIN_SHARE = 0.3;

export const canRetain = (a: TradeAsset) => a.kind === 'player' && a.years === 1 && a.capHit > 0;

/** The part of a retained player's cap hit that stays with the team sending him, to the cent. */
export const retainedAmount = (a: TradeAsset) => Math.round(a.capHit * RETAIN_SHARE * 100) / 100;

/**
 * Salary after the trade for the team that sends `out` and gets `inn`. A
 * retained player's 30% stays with the team sending him.
 */
export function salaryAfter(used: number, out: TradeAsset[], inn: TradeAsset[], retained: ReadonlySet<string>): number {
  const kept = (a: TradeAsset) => (retained.has(a.key) ? retainedAmount(a) : 0);
  const r = used
    - out.reduce((t, a) => t + a.capHit - kept(a), 0)
    + inn.reduce((t, a) => t + a.capHit - kept(a), 0);
  return Math.round(r * 100) / 100;
}

/** The line added to the offer's note on MFL, e.g. "30% retained: Shit-Hawks keeps $12.00 of Ja'Marr Chase." */
export function retentionNote(parts: { team: string; asset: TradeAsset }[], fmt: (n: number) => string): string {
  if (!parts.length) return '';
  return `30% retained: ${parts.map((p) => `${p.team} keeps ${fmt(retainedAmount(p.asset))} of ${p.asset.name}`).join('; ')}.`;
}
