'use client';

import InjuryTag from '@/components/InjuryTag';
import { usePlayerCard } from '@/components/PlayerCard';
import { posColor } from '@/components/pos';
import { valueLabel } from '@/lib/contractValue';
import type { TeamPlayer, TeamsData, TeamView } from '@/lib/types';
import { DISPLAY, money, pts1 } from './format';

const COLS = '160px 64px 56px 64px 72px 64px 60px 72px';
const TONE = { rise: 'var(--rise)', fall: 'var(--fall)', fair: 'var(--ink-3)', none: 'var(--ink-3)' };
const num = { font: '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', paddingRight: 10 } as const;
const head = { font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)', textAlign: 'right', paddingRight: 10 } as const;

/**
 * ROOM / ROSTER / IR / TAXI strip, then one list ordered QB → RB → WR → TE
 * (the coloured position under each name does the grouping), scrolling
 * sideways with the player column pinned.
 */
export default function RosterTab({ data, team }: { data: TeamsData; team: TeamView }) {
  const card = usePlayerCard();
  const { limits } = data;
  const stats: Array<[string, string, boolean]> = [
    [money(team.room), 'ROOM', team.room < 0],
    [String(team.counts.roster), 'ROSTER', team.counts.roster > limits.rosterMax || team.counts.roster < limits.rosterMin],
    [String(team.counts.ir), 'IR', limits.ir > 0 && team.counts.ir > limits.ir],
    [String(team.counts.taxi), 'TAXI', limits.taxi > 0 && team.counts.taxi > limits.taxi],
  ];

  return (
    <>
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', height: 36, borderBottom: '1px solid var(--line)' }}>
        {stats.map(([value, label, bad]) => (
          // Red alone marks a broken limit; no OVER / UNDER text.
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, paddingTop: 11, boxSizing: 'border-box', background: bad ? 'var(--live-tint)' : undefined, boxShadow: bad ? 'inset 0 -2px 0 var(--live)' : undefined }}>
            <span style={{ font: DISPLAY(16), fontVariantNumeric: 'tabular-nums', color: bad ? 'var(--live)' : 'var(--ink)' }}>{value}</span>
            <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: bad ? 'var(--live)' : 'var(--ink-3)' }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ width: 'max-content', minWidth: '100%' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 28, background: 'var(--bg-000)', borderBottom: '1px solid var(--edge)' }}>
            <span style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-000)', boxShadow: '1px 0 0 var(--line)', display: 'flex', alignItems: 'center', height: '100%', paddingLeft: 16, font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>PLAYER</span>
            <span style={head}>POS RNK</span>
            <span style={head}>PPG</span>
            <span style={head}>YTD PTS</span>
            <span style={head}>SALARY</span>
            <span style={head}>VALUE</span>
            <span style={head}>YRS</span>
            <span style={{ ...head, textAlign: 'left', padding: '0 16px 0 6px' }}>STATUS</span>
          </div>
          {team.roster.map((p) => <Row key={p.id} p={p} onOpen={() => card?.open(p.id)} />)}
        </div>
      </div>
    </>
  );
}

function Row({ p, onOpen }: { p: TeamPlayer; onOpen: () => void }) {
  const v = valueLabel(p.gp > 0 ? p.value : null);
  return (
    <button type="button" onClick={onOpen} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 46, width: '100%', padding: 0, border: 0, borderBottom: '1px solid var(--line)', background: 'none', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-000)', boxShadow: '1px 0 0 var(--line)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, height: '100%', padding: '0 10px 0 16px', boxSizing: 'border-box', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <InjuryTag tag={p.injury} />
        </span>
        <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos}</b> · {p.team}{p.bye ? ` (${p.bye})` : ''}{p.slot === 'TAXI' ? ' · TAXI' : p.slot === 'IR' ? ' · IR' : ''}
        </span>
      </span>
      <span style={{ ...num, color: 'var(--ink-2)' }}>{p.rank ? `${p.pos}${p.rank}` : '—'}</span>
      <span style={num}>{p.ppg !== null ? p.ppg.toFixed(1) : '—'}</span>
      <span style={{ ...num, fontWeight: 600 }}>{pts1(p.pts)}</span>
      <span style={num}>{money(p.salary)}</span>
      <span style={{ ...num, fontWeight: 600, color: TONE[v.tone] }}>{v.text}</span>
      <span style={{ ...num, color: p.years === 1 ? 'var(--fall)' : 'var(--ink)' }}>{p.years} {p.years === 1 ? 'YR' : 'YRS'}</span>
      <span style={{ padding: '0 16px 0 6px', font: DISPLAY(11), letterSpacing: '.08em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.status}</span>
    </button>
  );
}
