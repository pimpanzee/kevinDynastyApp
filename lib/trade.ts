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

export interface Verdict { text: string; short: string; tone: string }

/** Within 5% of each other reads as even. */
export function verdict(give: number, get: number): Verdict {
  if (!give || !get) return { text: 'Pick from both sides', short: '—', tone: 'var(--ink-3)' };
  const pct = Math.round(((get - give) / Math.max(give, get)) * 100);
  if (Math.abs(pct) < 5) return { text: 'Even trade, within 5%', short: 'EVEN', tone: 'var(--ink)' };
  if (pct > 0) return { text: `You come out ${pct}% ahead`, short: `+${pct}% YOU`, tone: 'var(--rise)' };
  return { text: `You give ${-pct}% more than you get`, short: `${pct}% YOU`, tone: 'var(--fall)' };
}
