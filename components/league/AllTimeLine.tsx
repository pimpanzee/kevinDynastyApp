'use client';

import { allTime, headToHead, record } from '@/lib/rivalry';
import { useHistory } from '@/lib/useHistory';

const yy = (y: number) => `’${String(y).slice(2)}`;

/**
 * A team's line under its name: all-time regular season record, titles,
 * playoff trips, and, on another team's page, the series against yours.
 * Hidden until the relay's history has loaded.
 */
export default function AllTimeLine({ id, mine }: { id: string; mine: string }) {
  const history = useHistory();
  if (!history) return null;
  const a = allTime(history, id);
  if (!a.seasons) return null;
  const bits: Array<[string, string]> = [[record(a), 'ALL-TIME']];
  if (a.titles.length) bits.push([`${a.titles.length} 🏆`, a.titles.map(yy).join(' ')]);
  bits.push([String(a.playoffSeasons.length), a.playoffSeasons.length === 1 ? 'PLAYOFF TRIP' : 'PLAYOFF TRIPS']);
  if (mine && mine !== id) {
    const h = headToHead(history, id, mine);
    if (h.meetings.length) bits.push([record(h), 'VS YOU']);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
      {bits.map(([v, l]) => (
        <span key={l}><b style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</b> {l}</span>
      ))}
    </div>
  );
}
