import { SEASON } from '@/lib/config';
import { asArray, mflGet } from './client';

/**
 * NFL injury designations, as one- or two-letter tags: Q, D, O and IR. This is
 * the NFL's report, not the league's own injured-reserve slot. Every flavour
 * of NFL reserve list (IR-R, IR-PUP, IR-NFI) reads as IR; other statuses
 * (suspended, holdout, retired) aren't shown.
 */

export type InjuryTag = 'Q' | 'D' | 'O' | 'IR';

interface RawInjuries {
  injuries?: { injury?: RawInjury | RawInjury[] };
}
interface RawInjury { id?: string; status?: string }

/** Injury reports move through the week; a build every few hours keeps up. */
const INJURY_TTL = 60 * 60 * 1000;

function tagFor(status: string): InjuryTag | null {
  const s = status.trim().toUpperCase();
  if (s === 'QUESTIONABLE') return 'Q';
  if (s === 'DOUBTFUL') return 'D';
  if (s === 'OUT') return 'O';
  if (s === 'IR' || s.startsWith('IR-')) return 'IR';
  return null;
}

/** Player id → tag for `week`'s report (the current one when omitted). Empty if MFL has none. */
export async function getInjuries(week?: number, season: string = SEASON): Promise<Map<string, InjuryTag>> {
  const out = new Map<string, InjuryTag>();
  try {
    const body = await mflGet<RawInjuries>('injuries', {
      params: { W: week },
      ttl: INJURY_TTL,
      league: false,
      season,
      cacheKey: `injuries:${season}:${week ?? 'current'}`,
    });
    for (const i of asArray(body.injuries?.injury)) {
      const tag = i.id && i.status ? tagFor(i.status) : null;
      if (tag) out.set(i.id as string, tag);
    }
  } catch {
    // An injury report is a nicety; the screens stand without it.
  }
  return out;
}
