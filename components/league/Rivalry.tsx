'use client';

import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import TeamAvatar from '@/components/TeamAvatar';
import { headToHead, record, type HeadToHead, type Meeting } from '@/lib/rivalry';
import { useHistory } from '@/lib/useHistory';

const DISPLAY = (size: number, weight = 700) => `${weight} ${size}px/1 var(--font-display)`;
const pts = (n: number) => n.toFixed(1);
const when = (m: Meeting) => `${m.season} WK ${m.week}${m.playoff ? ` · ${m.kind.toUpperCase()}` : ''}`;
const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export interface RivalryTeam {
  id: string;
  name: string;
  icon?: string | null;
}

/** Only games before this one count, so a matchup's own result isn't part of its history. */
type Cut = { season: number; week: number };

/** "Tuna Fish leads 9–2", "Series tied 4–4". */
function seriesLine(h: HeadToHead, us: RivalryTeam, them: RivalryTeam) {
  if (h.wins === h.losses) return `Series tied ${record(h)}`;
  return h.wins > h.losses ? `${us.name} leads ${h.wins}–${h.losses}` : `${them.name} leads ${h.losses}–${h.wins}`;
}

/**
 * A slim bar under the matchup's score: the series in one line. Tapping it
 * opens the full rivalry card. Hidden until the relay's history has loaded.
 */
export function RivalryBar({ cut, home, away, mine }: { cut: Cut; home: RivalryTeam; away: RivalryTeam; mine?: boolean }) {
  const history = useHistory();
  const [open, setOpen] = useState(false);
  if (!history || !cut.season) return null;
  const h = headToHead(history, home.id, away.id, cut);
  const n = h.meetings.length;
  const name = (who: 'us' | 'them') => (who === 'us' ? home.name : away.name);
  const extra = n && h.streak.who && h.streak.n > 1 ? ` · ${name(h.streak.who)} won the last ${h.streak.n}` : '';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the rivalry"
        style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 40, padding: '0 12px 0 16px', border: 0, borderBottom: '1px solid var(--line)', background: 'var(--bg-100)', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ flex: 'none', font: DISPLAY(11), letterSpacing: '.12em', color: 'var(--volt)' }}>RIVALRY</span>
        <span style={{ flex: 1, minWidth: 0, font: '500 12.5px/1 var(--font-body)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', ...clip }}>
          {n ? `${seriesLine(h, home, away)}${extra}` : 'First ever meeting'}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none', color: 'var(--ink-3)' }}><path d="m9 18 6-6-6-6" /></svg>
      </button>
      {open && <RivalryCard us={home} them={away} cut={cut} mine={mine} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The full rivalry, as a card that rises from the bottom: the series, every
 * meeting as a strip of results, the highlights, and the game-by-game list.
 * `us` is on the left; `mine` lights `us` in volt.
 */
export function RivalryCard({ us, them, cut, mine, onClose }: { us: RivalryTeam; them: RivalryTeam; cut?: Cut; mine?: boolean; onClose: () => void }) {
  const history = useHistory();
  const h = history ? headToHead(history, us.id, them.id, cut) : null;
  const n = h?.meetings.length ?? 0;
  const name = (who: 'us' | 'them') => (who === 'us' ? us.name : them.name);
  const label = { font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)', margin: '0 0 8px' } as const;

  const header = (
    <div style={{ padding: '8px 0 0 20px' }}>
      <div style={{ font: DISPLAY(11), letterSpacing: '.12em', color: 'var(--volt)' }}>RIVALRY</div>
      <div style={{ font: DISPLAY(20, 800), marginTop: 4, ...clip }}>{us.name} vs {them.name}</div>
    </div>
  );

  const highlights: Array<[string, string]> = [];
  if (h && n) {
    if (h.streak.who) highlights.push(['STREAK', h.streak.n > 1 ? `${name(h.streak.who)}, ${h.streak.n} straight` : `${name(h.streak.who)} won the last one`]);
    const p = h.playoff;
    if (p.wins + p.losses + p.ties) highlights.push(['PLAYOFFS', p.wins === p.losses ? `Tied ${record(p)}` : `${p.wins > p.losses ? us.name : them.name} ${Math.max(p.wins, p.losses)}–${Math.min(p.wins, p.losses)}`]);
    if (h.blowout) highlights.push(['BLOWOUT', `${name(h.blowout.who)} by ${pts(h.blowout.margin)} · ${when(h.blowout)}`]);
    if (h.closest && n > 1) highlights.push(['CLOSEST', `${pts(h.closest.margin)} pts · ${when(h.closest)}`]);
    highlights.push(['AVG SCORE', `${pts(h.avgUs)} – ${pts(h.avgThem)}`]);
  }

  return (
    <BottomSheet label={`${us.name} vs ${them.name} rivalry`} onClose={onClose} header={header} fixed height="80%">
      {!h ? (
        <p style={{ padding: '16px 20px', margin: 0, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>Loading the league’s history…</p>
      ) : (
        <div style={{ padding: '10px 20px 24px' }}>
          {/* The series */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 10, padding: '14px 14px', borderRadius: 8, background: 'var(--bg-200)' }}>
            <Side team={us} wins={h.wins} lead={h.wins > h.losses} volt={mine} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)' }}>{n ? 'ALL-TIME' : 'FIRST'}</div>
              <div style={{ font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)', marginTop: 4 }}>{n ? `SINCE ${h.meetings[0].season}` : 'MEETING'}</div>
              {h.ties > 0 && <div style={{ font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)', marginTop: 4 }}>{h.ties} TIE{h.ties === 1 ? '' : 'S'}</div>}
            </div>
            <Side team={them} wins={h.losses} lead={h.losses > h.wins} right />
          </div>

          {n > 0 && (
            <>
              {/* Every meeting, oldest to newest, from the left team's side */}
              <h3 style={{ ...label, marginTop: 18 }}>EVERY MEETING · {us.name.toUpperCase()}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {h.meetings.map((m) => {
                  const r = m.us > m.them ? 'W' : m.us < m.them ? 'L' : 'T';
                  return (
                    <span
                      key={`${m.season}-${m.week}`}
                      title={`${when(m)}: ${pts(m.us)}–${pts(m.them)}`}
                      style={{
                        width: 24, height: 24, borderRadius: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: DISPLAY(11),
                        background: r === 'W' ? 'var(--rise)' : r === 'L' ? 'var(--fall)' : 'var(--bg-300)', color: r === 'T' ? 'var(--ink)' : '#0b0f15',
                        boxShadow: m.playoff ? 'inset 0 0 0 2px var(--ink)' : undefined,
                      }}
                    >
                      {r}
                    </span>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>Outlined: a playoff game.</div>

              <h3 style={{ ...label, marginTop: 18 }}>HIGHLIGHTS</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 8, alignItems: 'baseline' }}>
                {highlights.map(([k, v]) => (
                  <span key={k} style={{ display: 'contents' }}>
                    <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{k}</span>
                    <span style={{ font: '500 13px/1.35 var(--font-body)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </span>
                ))}
              </div>

              <h3 style={{ ...label, marginTop: 18 }}>GAME BY GAME</h3>
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {h.meetings.slice().reverse().map((m) => {
                  const won = m.us > m.them, lost = m.us < m.them;
                  return (
                    <div key={`${m.season}-${m.week}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 18px', gap: 10, alignItems: 'center', height: 36, borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ font: DISPLAY(11), letterSpacing: '.08em', color: m.playoff ? 'var(--ink)' : 'var(--ink-3)', ...clip }}>{when(m)}</span>
                      <span style={{ font: '600 13px/1 var(--font-body)' }}>
                        <span style={{ color: won ? 'var(--ink)' : 'var(--ink-3)' }}>{pts(m.us)}</span>
                        <span style={{ color: 'var(--ink-3)' }}> – </span>
                        <span style={{ color: lost ? 'var(--ink)' : 'var(--ink-3)' }}>{pts(m.them)}</span>
                      </span>
                      <span style={{ font: DISPLAY(12), textAlign: 'right', color: won ? 'var(--rise)' : lost ? 'var(--fall)' : 'var(--ink-3)' }}>{won ? 'W' : lost ? 'L' : 'T'}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function Side({ team, wins, lead, right, volt }: { team: RivalryTeam; wins: number; lead: boolean; right?: boolean; volt?: boolean }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
      <TeamAvatar name={team.name} icon={team.icon ?? null} size={28} mine={volt} />
      <div style={{ marginTop: 8, font: '800 40px/1 var(--font-display)', fontVariantNumeric: 'tabular-nums', color: volt ? 'var(--volt)' : lead ? 'var(--ink)' : 'var(--ink-2)' }}>{wins}</div>
      <div style={{ marginTop: 4, maxWidth: '100%', font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', ...clip }}>{team.name}</div>
    </div>
  );
}
