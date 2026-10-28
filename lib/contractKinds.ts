import { SEASON } from '@/lib/config';
import { TTL } from '@/lib/mfl/cache';
import { asArray, mflGet } from '@/lib/mfl/client';
import type { RosterSlot } from '@/lib/mfl/rosters';
import { isRookieContract } from '@/lib/rookieScale';

/**
 * Where each rostered contract came from, which decides how contract value
 * treats it (league rules, Article 4–5):
 * - auction: won in a free-agent auction (or the 2021 inaugural one). The
 *   only real market prices. `bid` is the winning bid, the contract's base
 *   value before the 10%-a-year raises.
 * - rookie: a rookie-draft deal (MFL's contractStatus holds the round).
 * - waiver: picked up in season as a free agent. One year, never extended.
 *   (A waiver claim of a cut player inherits his old contract instead; one
 *   with years left is read as that contract.)
 * - other: none of the above (tags, RFA, old deals MFL has no record of).
 */
export type ContractKind = 'auction' | 'rookie' | 'waiver' | 'other';
export interface ContractOrigin { kind: ContractKind; bid?: number; round?: number }

interface RawAuction { player?: string; winningBid?: string; lastBidTime?: string }
interface RawTx { type?: string; timestamp?: string; transaction?: string }

const FIRST_SEASON = 2021;

/** Each player's most recent auction win: bid, season and time. */
async function lastAuctionWins(): Promise<Map<string, { bid: number; season: number; at: number }>> {
  const out = new Map<string, { bid: number; season: number; at: number }>();
  for (let y = FIRST_SEASON; y <= Number(SEASON); y++) {
    const body = await mflGet<{ auctionResults?: { auctionUnit?: { auction?: RawAuction | RawAuction[] } | Array<{ auction?: RawAuction | RawAuction[] }> } }>(
      'auctionResults',
      { season: String(y), ttl: y < Number(SEASON) ? TTL.FINAL_RESULTS : TTL.LEAGUE, cacheKey: `auctionResults:${y}` },
    ).catch(() => ({}) as { auctionResults?: undefined });
    for (const unit of asArray(body.auctionResults?.auctionUnit)) {
      for (const a of asArray(unit.auction)) {
        const bid = Number(a.winningBid);
        const at = Number(a.lastBidTime) * 1000;
        if (!a.player || !(bid > 0)) continue;
        const prev = out.get(a.player);
        if (!prev || at > prev.at) out.set(a.player, { bid, season: y, at });
      }
    }
  }
  return out;
}

/** In-season free-agent adds this season (waivers or first-come), latest time per player. */
async function seasonAdds(): Promise<Map<string, number>> {
  const body = await mflGet<{ transactions?: { transaction?: RawTx | RawTx[] } }>('transactions', {
    ttl: TTL.ROSTERS,
    cacheKey: `transactions:${SEASON}`,
  });
  const out = new Map<string, number>();
  for (const t of asArray(body.transactions?.transaction)) {
    if (t.type !== 'BBID_WAIVER' && t.type !== 'FREE_AGENT') continue;
    // "added,|bid|dropped," for waivers; "added,|dropped," for free agents.
    const added = (t.transaction ?? '').split('|')[0].split(',').filter(Boolean);
    const at = Number(t.timestamp) * 1000;
    for (const id of added) if (at > (out.get(id) ?? 0)) out.set(id, at);
  }
  return out;
}

export async function getContractOrigins(rosters: Map<string, RosterSlot[]>): Promise<Map<string, ContractOrigin>> {
  const [wins, adds] = await Promise.all([lastAuctionWins(), seasonAdds()]);
  const out = new Map<string, ContractOrigin>();
  for (const slots of rosters.values()) {
    for (const s of slots) {
      const status = s.contractStatus.trim();
      if (isRookieContract(status)) {
        out.set(s.playerId, { kind: 'rookie', round: Number(status.match(/\d/)?.[0] ?? 0) || undefined });
        continue;
      }
      const win = wins.get(s.playerId);
      const added = adds.get(s.playerId);
      if (added && (!win || added > win.at) && s.contractYear <= 1) {
        out.set(s.playerId, { kind: 'waiver' });
        continue;
      }
      if (win) {
        // Only trust the bid when today's salary is that bid with its raises
        // (a re-sign, tag or RFA since would change it).
        const expected = win.bid * 1.1 ** (Number(SEASON) - win.season);
        const matches = Math.abs(s.salary - expected) <= Math.max(1, expected * 0.02);
        out.set(s.playerId, matches ? { kind: 'auction', bid: win.bid } : { kind: 'other' });
        continue;
      }
      out.set(s.playerId, { kind: 'other' });
    }
  }
  return out;
}
