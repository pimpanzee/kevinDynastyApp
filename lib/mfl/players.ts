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
  /** "Josh Allen" — for search and the Players screen. */
  fullName: string;
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

/** "Smith-Njigba, Jaxon" → "Jaxon Smith-Njigba". */
function fullName(stored: string): string {
  const [last, first] = stored.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : stored.trim();
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
      fullName: fullName(stored),
      position,
      team: p.team ?? '',
    });
  }
  return map;
}

const UNKNOWN: Player = { id: '', name: 'Unknown player', fullName: 'Unknown player', position: '', team: '' };

export function lookup(players: Map<string, Player>, id: string): Player {
  return players.get(id) ?? { ...UNKNOWN, id };
}

export interface PlayerDetails {
  jersey?: number;
  /** Inches. */
  height?: number;
  /** Pounds. */
  weight?: number;
  /** Epoch seconds. */
  birthdate?: number;
  draftYear?: number;
}

/** Bio fields from the detailed player export, by MFL id. Shares the cached export the Sleeper join reads. */
export async function getPlayerDetails(season: string = SEASON): Promise<Map<string, PlayerDetails>> {
  const body = await mflGet<{ players?: { player?: RawDetails | RawDetails[] } }>('players', {
    params: { DETAILS: 1 },
    ttl: TTL.PLAYERS,
    season,
    cacheKey: `players-details:${season}`,
  });
  const n = (v?: string) => (v && Number(v) > 0 ? Number(v) : undefined);
  const out = new Map<string, PlayerDetails>();
  for (const p of asArray(body.players?.player)) {
    if (!p.id) continue;
    out.set(p.id, { jersey: n(p.jersey), height: n(p.height), weight: n(p.weight), birthdate: n(p.birthdate), draftYear: n(p.draft_year) });
  }
  return out;
}
interface RawDetails { id?: string; jersey?: string; height?: string; weight?: string; birthdate?: string; draft_year?: string }
