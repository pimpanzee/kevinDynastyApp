'use client';

import { headToHead, record, type Meeting } from '@/lib/rivalry';
import { useHistory } from '@/lib/useHistory';

const DISPLAY = (size: number, weight = 700) => `${weight} ${size}px/1 var(--font-display)`;
const pts = (n: number) => n.toFixed(1);
const when = (m: Meeting) => `${m.season} WK ${m.week}${m.playoff ? ` · ${m.kind.toUpperCase()}` : ''}`;

/**
 * The two teams' history before this game: the all-time series, who's on a
 * run, playoff meetings, the last meeting, the biggest blowout and the
 * closest game. Hidden until the relay's history has loaded.
 */
export default function Rivalry({ season, week, home, away }: {
  season: number;
  week: number;
  home: { id: string; name: string };
  away: { id: string; name: string };
}) {
  const history = useHistory();
  if (!history || !season) return null;
  const h = headToHead(history, home.id, away.id, { season, week });
  const n = h.meetings.length;
  const name = (who: 'us' | 'them') => (who === 'us' ? home.name : away.name);

  const rows: Array<[string, string]> = [];
  if (h.streak.who && h.streak.n > 1) rows.push(['STREAK', `${name(h.streak.who)} won the last ${h.streak.n}`]);
  if (h.playoff.wins + h.playoff.losses + h.playoff.ties) rows.push(['PLAYOFFS', `${record(h.playoff)} ${home.name}`]);
  if (h.last) {
    const lw = h.last.us > h.last.them ? home.name : h.last.us < h.last.them ? away.name : 'Tie';
    rows.push(['LAST TIME', `${when(h.last)} · ${lw} ${pts(Math.max(h.last.us, h.last.them))}–${pts(Math.min(h.last.us, h.last.them))}`]);
  }
  if (h.blowout && n > 1) rows.push(['BLOWOUT', `${when(h.blowout)} · ${name(h.blowout.who)} by ${pts(h.blowout.margin)}`]);
  if (h.closest && n > 1 && h.closest.margin < 10) rows.push(['CLOSEST', `${when(h.closest)} · ${pts(h.closest.margin)} pts`]);
  if (n > 1) rows.push(['AVG SCORE', `${pts(h.avgUs)} – ${pts(h.avgThem)}`]);

  return (
    <section aria-label="Rivalry" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
        <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
        <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>RIVALRY</span>
        <span style={{ marginLeft: 'auto', font: DISPLAY(12), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
          {n ? `${n} MEETING${n === 1 ? '' : 'S'} SINCE ${h.meetings[0].season}` : 'FIRST MEETING'}
        </span>
      </div>
      {n > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <Side name={home.name} wins={h.wins} lead={h.wins > h.losses} />
            <span style={{ font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-3)' }}>{h.ties ? `${h.ties} TIE${h.ties === 1 ? '' : 'S'}` : 'ALL-TIME'}</span>
            <Side name={away.name} wins={h.losses} lead={h.losses > h.wins} right />
          </div>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 16px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 'none', width: 78, font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--ink-3)' }}>{label}</span>
              <span style={{ minWidth: 0, font: '500 13px/1.35 var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Side({ name, wins, lead, right }: { name: string; wins: number; lead: boolean; right?: boolean }) {
  return (
    <div style={{ minWidth: 0, textAlign: right ? 'right' : 'left' }}>
      <div style={{ font: '800 34px/1 var(--font-display)', color: lead ? 'var(--ink)' : 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{wins}</div>
      <div style={{ marginTop: 4, font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
    </div>
  );
}
