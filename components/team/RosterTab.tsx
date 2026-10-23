'use client';

import InjuryTag from '@/components/InjuryTag';
import { usePlayerCard } from '@/components/PlayerCard';
import { posColor } from '@/components/pos';
import { valueLabel } from '@/lib/contractValue';
import type { TeamPlayer, TeamsData, TeamView } from '@/lib/types';
import type { ReactNode } from 'react';
import SectionHead from './SectionHead';
import { DISPLAY, money, pts1 } from './format';

const COLS = '160px 64px 56px 64px 72px 64px 60px 72px';
const TONE = { rise: 'var(--rise)', fall: 'var(--fall)', fair: 'var(--ink-3)', none: 'var(--ink-3)' };
const num = { font: '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', paddingRight: 10 } as const;
const head = { font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)', textAlign: 'right', paddingRight: 10 } as const;

/**
 * ROOM / ROSTER / IR / TAXI strip, then the list split the way MFL does it:
 * active roster, injured reserve, the cap total (active + IR + adjustments),
 * then the taxi squad below the total because taxi salaries don't count.
 * Each section runs QB → RB → WR → TE and scrolls sideways with the player
 * column pinned; section bands and the cap total stay pinned full width.
 */
export default function RosterTab({ data, team }: { data: TeamsData; team: TeamView }) {
  const card = usePlayerCard();
  const { limits } = data;
  const rosterBad = team.counts.roster > limits.rosterMax || team.counts.roster < limits.rosterMin;
  const irBad = limits.ir > 0 && team.counts.ir > limits.ir;
  const taxiBad = limits.taxi > 0 && team.counts.taxi > limits.taxi;
  const stats: Array<[string, string, boolean]> = [
    [money(team.room), 'ROOM', team.room < 0],
    [String(team.counts.roster), 'ROSTER', rosterBad],
    [String(team.counts.ir), 'IR', irBad],
    [String(team.counts.taxi), 'TAXI', taxiBad],
  ];

  const active = team.roster.filter((p) => p.slot === 'ACTIVE');
  const ir = team.roster.filter((p) => p.slot === 'IR');
  const taxi = team.roster.filter((p) => p.slot === 'TAXI');
  const salaries = Math.round((team.used - team.adj) * 100) / 100;
  const taxiSalary = Math.round(taxi.reduce((t, p) => t + p.salary, 0) * 100) / 100;
  const row = (p: TeamPlayer) => <Row key={p.id} p={p} onOpen={() => card?.open(p.id)} />;

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
      {/* Inline-size container so pinned bands can be exactly one screen wide (100cqw). */}
      <div style={{ flex: 1, overflow: 'auto', containerType: 'inline-size' }}>
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
          <Band label="ACTIVE ROSTER" count={active.length} bad={rosterBad} gap={false} />
          {active.map(row)}
          {ir.length > 0 && <Band label="INJURED RESERVE" count={ir.length} bad={irBad} />}
          {ir.map(row)}
          <Pinned>
            <div style={{ padding: '8px 16px 10px', background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
              {team.adj !== 0 && <Line label="ACTIVE + IR SALARIES" value={money(salaries)} />}
              {team.adj !== 0 && <Line label="CAP ADJUSTMENTS" value={`${team.adj > 0 ? '+' : ''}${money(team.adj)}`} />}
              <Line label="COUNTS TOWARD CAP" value={money(team.used)} strong />
              <Line label="SALARY CAP" value={money(data.cap)} />
              <Line label="CAP ROOM" value={money(team.room)} strong tone={team.room < 0 ? 'var(--live)' : 'var(--rise)'} />
            </div>
          </Pinned>
          {taxi.length > 0 && <Band label="TAXI SQUAD" count={taxi.length} bad={taxiBad} note={`${money(taxiSalary)} OFF CAP`} />}
          {taxi.map(row)}
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
          <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos}</b> · {p.team}{p.bye ? ` (${p.bye})` : ''}
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

/** Stays put while the table scrolls sideways: one screen wide, pinned left. */
function Pinned({ children }: { children: ReactNode }) {
  return <div style={{ position: 'sticky', left: 0, zIndex: 1, width: '100cqw', background: 'var(--bg-000)' }}>{children}</div>;
}

function Band({ label, count, bad, note, gap = true }: { label: string; count: number; bad: boolean; note?: string; gap?: boolean }) {
  const players = `${count} ${count === 1 ? 'PLAYER' : 'PLAYERS'}`;
  return (
    <Pinned>
      <SectionHead
        gap={gap}
        label={label}
        right={<>{note && <span style={{ marginRight: 10 }}>{note}</span>}<span style={{ color: bad ? 'var(--live)' : 'var(--ink)' }}>{players}</span></>}
      />
    </Pinned>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', height: 22 }}>
      <span style={{ font: DISPLAY(11), letterSpacing: '.1em', color: strong ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', font: strong ? DISPLAY(16) : '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: tone ?? (strong ? 'var(--ink)' : 'var(--ink-2)') }}>{value}</span>
    </div>
  );
}
