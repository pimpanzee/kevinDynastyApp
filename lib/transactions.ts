import { FRANCHISE_ID, GAME_DURATION_MS, SEASON } from '@/lib/config';
import { resolveNow } from '@/lib/mfl/clock';
import { TTL } from '@/lib/mfl/cache';
import { asArray, mflGet, num } from '@/lib/mfl/client';
import { getInjuries } from '@/lib/mfl/injuries';
import { getLeague, type Franchise } from '@/lib/mfl/league';
import { getPlayers, lookup, type Player } from '@/lib/mfl/players';
import { getNflSchedule, type NflWeek } from '@/lib/mfl/schedule';
import { getPlayerCardIds } from '@/lib/playerCard';
import type { TransactionsData, TxAsset, TxMove, TxPlayer } from '@/lib/types';

/**
 * The league's in-season transaction log, built once per site build.
 *
 * MFL's `transactions` export holds the whole league year — the startup
 * auction, commissioner roster loads and so on. Only moves from the season's
 * first kickoff onward are kept, normalised into one shape per move.
 */

interface RawTx {
  type?: string;
  franchise?: string;
  franchise2?: string;
  timestamp?: string;
  transaction?: string;
  franchise1_gave_up?: string;
  franchise2_gave_up?: string;
  activated?: string;
  deactivated?: string;
  promoted?: string;
  demoted?: string;
  by_commish?: string;
}

const ET = 'America/New_York';

/** "WED OCT 7" in Eastern time, the app's clock. */
function day(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: ET })
    .format(ms)
    .replace(',', '')
    .toUpperCase();
}

/** "WED OCT 7 · 7:00 PM" in Eastern time. */
function when(ms: number): string {
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ET }).format(ms);
  return `${day(ms)} · ${time.toUpperCase()}`;
}

/** "14071,16188," → ["14071", "16188"]. */
const ids = (list: string | undefined): string[] => (list ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** 1 → "1st", 12 → "12th". */
const ordinal = (n: number): string =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** "Nosmo King's", "Monks of Vegas'". */
const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/**
 * The week a move counts toward: the first whose games aren't all over, so a
 * Tuesday waiver run lands in the week it was for. Past the last week, the last.
 */
function weekOf(schedule: NflWeek[], ms: number): number {
  for (const w of schedule) {
    const end = Math.max(...w.games.map((g) => g.kickoff)) + GAME_DURATION_MS;
    if (ms < end) return w.week;
  }
  return schedule[schedule.length - 1]?.week ?? 1;
}

export async function getTransactionsData(): Promise<TransactionsData> {
  const now = resolveNow().getTime();
  const [body, league, players, injuries, schedule, cardIds] = await Promise.all([
    mflGet<{ transactions?: { transaction?: RawTx | RawTx[] } }>('transactions', {
      ttl: TTL.ROSTERS,
      cacheKey: `transactions:${SEASON}`,
    }),
    getLeague(),
    getPlayers(),
    getInjuries(),
    getNflSchedule(),
    getPlayerCardIds(),
  ]);

  const franchises = new Map<string, Franchise>(league.franchises.map((f) => [f.id, f]));
  const cards = new Set(cardIds);
  const kickoff = Math.min(...(schedule[0]?.games.map((g) => g.kickoff) ?? [0]));

  const player = (id: string): TxPlayer => {
    const p: Player = lookup(players, id);
    return {
      type: 'player', id, name: p.fullName, pos: p.position, nflTeam: p.team,
      injury: injuries.get(id), card: cards.has(id),
    };
  };

  /** A traded asset: a player id, a future pick (FP_0005_2027_1) or a current-year one (DP_0_5). */
  const asset = (token: string): TxAsset => {
    const fp = /^FP_(\w+?)_(\d{4})_(\d+)$/.exec(token);
    if (fp) {
      const [, owner, year, round] = fp;
      const from = franchises.get(owner)?.name ?? `Team ${owner}`;
      return { type: 'pick', label: `${year} ${ordinal(Number(round))} · ${possessive(from)}` };
    }
    const dp = /^DP_(\d+)_(\d+)$/.exec(token);
    if (dp) {
      const round = Number(dp[1]) + 1;
      const pick = Number(dp[2]) + 1;
      return { type: 'pick', label: `${SEASON} ${ordinal(round)} · PICK ${round}.${String(pick).padStart(2, '0')}` };
    }
    return player(token);
  };

  const moves: TxMove[] = [];
  asArray(body.transactions?.transaction).forEach((t, i) => {
    const ts = num(t.timestamp);
    const ms = ts * 1000;
    if (!ts || ms < kickoff || ms > now) return;
    const base = {
      id: `${ts}-${i}`,
      timestamp: ts,
      franchiseId: t.franchise ?? '',
      byCommish: t.by_commish === '1' || undefined,
      week: weekOf(schedule, ms),
      day: day(ms),
      when: when(ms),
    };

    switch (t.type) {
      case 'BBID_WAIVER': {
        // "addedIds,|bid|droppedIds,"
        const [added, bid, dropped] = (t.transaction ?? '').split('|');
        moves.push({ ...base, kind: 'waivers', adds: ids(added).map(player), drops: ids(dropped).map(player), bid: num(bid) });
        break;
      }
      case 'FREE_AGENT': {
        // "addedIds,|droppedIds," — an add/drop stays one move.
        const [added, dropped] = (t.transaction ?? '').split('|');
        const adds = ids(added).map(player);
        const drops = ids(dropped).map(player);
        if (adds.length || drops.length) moves.push({ ...base, kind: adds.length ? 'add' : 'drop', adds, drops });
        break;
      }
      case 'TRADE':
        moves.push({
          ...base, kind: 'trade', adds: [], drops: [],
          trade: {
            sides: [
              { franchiseId: t.franchise ?? '', gave: ids(t.franchise1_gave_up).map(asset) },
              { franchiseId: t.franchise2 ?? '', gave: ids(t.franchise2_gave_up).map(asset) },
            ],
          },
        });
        break;
      case 'IR':
        moves.push({ ...base, kind: 'ir', adds: ids(t.activated).map(player), drops: ids(t.deactivated).map(player) });
        break;
      case 'TAXI':
        moves.push({ ...base, kind: 'taxi', adds: ids(t.promoted).map(player), drops: ids(t.demoted).map(player) });
        break;
      // Everything else — auctions, roster loads, player locks, and the
      // BBID_AUTO_PROCESS_WAIVERS marker (claims carry the run's timestamp) — is left out.
    }
  });

  // Newest first; a waiver run's claims stay together, biggest bid first.
  moves.sort(
    (a, b) =>
      b.timestamp - a.timestamp ||
      Number(b.kind === 'waivers') - Number(a.kind === 'waivers') ||
      (b.bid ?? 0) - (a.bid ?? 0),
  );

  return {
    currentWeek: weekOf(schedule, now),
    franchises: league.franchises.map((f) => ({
      id: f.id, name: f.name, abbrev: f.abbrev || f.name.slice(0, 4).trim().toUpperCase(), icon: f.icon ?? null,
    })),
    myFranchiseId: FRANCHISE_ID,
    moves,
    builtAt: new Date().toISOString(),
  };
}
