'use client';

import { useState } from 'react';
import { allTime, headToHead, record } from '@/lib/rivalry';
import { useHistory } from '@/lib/useHistory';
import { RivalryCard, type RivalryTeam } from './Rivalry';

const yy = (y: number) => `’${String(y).slice(2)}`;

/**
 * A team's line under its name: all-time regular season record, titles,
 * division titles, playoff trips, and, on another team's page, the series against yours
 * (tap it for the rivalry card). Hidden until the relay's history has loaded.
 */
export default function AllTimeLine({ team, mine }: { team: RivalryTeam; mine: RivalryTeam | null }) {
  const history = useHistory();
  const [open, setOpen] = useState(false);
  if (!history) return null;
  const a = allTime(history, team.id);
  if (!a.seasons) return null;
  const bits: Array<[string, string]> = [[record(a), 'ALL-TIME']];
  if (a.titles.length) bits.push([`${a.titles.length} 🏆`, a.titles.map(yy).join(' ')]);
  // Division titles: a pennant (the closest emoji is the triangular flag).
  if (a.divisionTitles.length) bits.push([`${a.divisionTitles.length} 🚩`, a.divisionTitles.map(yy).join(' ')]);
  bits.push([String(a.playoffSeasons.length), a.playoffSeasons.length === 1 ? 'PLAYOFF TRIP' : 'PLAYOFF TRIPS']);
  const vs = mine && mine.id !== team.id ? headToHead(history, mine.id, team.id) : null;
  const text = { font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' } as const;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 4, ...text }}>
      {bits.map(([v, l]) => (
        <span key={l}><b style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</b> {l}</span>
      ))}
      {vs && vs.meetings.length > 0 && mine && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Your rivalry with ${team.name}`}
            style={{ ...text, display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 6px 0 8px', margin: '-3px 0', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-200)', cursor: 'pointer' }}
          >
            <b style={{ fontWeight: 600, color: 'var(--ink)' }}>{record(vs)}</b> VS YOU
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
          </button>
          {open && <RivalryCard us={mine} them={team} mine onClose={() => setOpen(false)} />}
        </>
      )}
    </div>
  );
}
