import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet } from './client';

/**
 * The player database. Every other endpoint refers to players by id only, so
 * this is the join table for names, positions and NFL teams. ~2,600 records
 * and ~180KB, refreshed daily (MFL_API_CONTEXT.md §5).
 */

export interface Player {
  id: string;
  /** Display name, reordered from MFL's "Last, First" storage. */
  name: string;
  position: string;
  team: string;
}

interface RawPlayers {
  players?: { player?: RawPlayer | RawPlayer[] };
}
interface RawPlayer { id?: string; name?: string; position?: string; team?: string }

/** MFL stores names as "Smith-Njigba, Jaxon"; the designs show "J. Smith-Njigba". */
function displayName(stored: string): string {
  const [last, first] = stored.split(',').map((s) => s.trim());
  if (!first) return stored.trim();
  return `${first.charAt(0)}. ${last}`;
}

/** Team defences come back as "Bills, Buffalo" with a TM* position. */
function isTeamUnit(position: string): boolean {
  return position.startsWith('TM') || position === 'Def' || position === 'DEF';
}

export async function getPlayers(season: string = SEASON): Promise<Map<string, Player>> {
  const body = await mflGet<RawPlayers>('players', {
    ttl: TTL.PLAYERS,
    season,
    cacheKey: `players:${season}`,
  });

  const map = new Map<string, Player>();
  for (const p of asArray(body.players?.player)) {
    if (!p.id) continue;
    const stored = p.name ?? '';
    const position = p.position ?? '';
    map.set(p.id, {
      id: p.id,
      name: isTeamUnit(position) ? stored.split(',')[0].trim() : displayName(stored),
      position,
      team: p.team ?? '',
    });
  }
  return map;
}

const UNKNOWN: Player = { id: '', name: 'Unknown player', position: '', team: '' };

export function lookup(players: Map<string, Player>, id: string): Player {
  return players.get(id) ?? { ...UNKNOWN, id };
}
