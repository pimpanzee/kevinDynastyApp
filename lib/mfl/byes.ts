import { SEASON } from '@/lib/config';
import { TTL } from './cache';
import { asArray, mflGet, num } from './client';

/** Each NFL team's bye week (MFL team codes). */
export async function getByeWeeks(season: string = SEASON): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const body = await mflGet<{ nflByeWeeks?: { team?: Array<{ id?: string; bye_week?: string }> | { id?: string; bye_week?: string } } }>(
    'nflByeWeeks',
    { league: false, season, ttl: TTL.SCHEDULE, cacheKey: `byes:${season}` },
  );
  for (const t of asArray(body.nflByeWeeks?.team)) {
    if (t.id && num(t.bye_week) > 0) out.set(t.id, num(t.bye_week));
  }
  return out;
}
