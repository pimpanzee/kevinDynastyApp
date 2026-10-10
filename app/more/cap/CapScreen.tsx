'use client';

import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import BottomNav from '@/components/BottomNav';
import FadedTeamLogo from '@/components/FadedTeamLogo';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import { PlayerLink } from '@/components/PlayerCard';
import StatusBar from '@/components/StatusBar';
import { useMyTeam } from '@/lib/myTeam';
import type { CapTeam, CapView } from '@/lib/types';

/**
 * The league's cap sheet: every franchise's room under the cap, what it has
 * already committed to the next two seasons, its expiring contracts and its
 * roster, taxi and IR spots, side by side. Tap a column to sort, a team to
 * see its expiring contracts.
 */

type Key = 'room' | 'salary' | 'next' | 'after' | 'expiring' | 'roster' | 'taxi' | 'ir';

const TEAM_W = 132;
const ROW_H = 46;
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const headCell: CSSProperties = {
  font: '800 9px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)',
  padding: '8px 6px 7px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-neutral-300)',
  cursor: 'pointer', background: 'var(--color-bg)',
};

export default function CapScreen({ view }: { view: CapView }) {
  const myTeam = useMyTeam(view.myFranchiseId);
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'room', desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { limits, cap, season } = view;

  const cols: Array<{ key: Key; label: string; width: number; value: (t: CapTeam) => number; show: (t: CapTeam) => string; tone?: (t: CapTeam) => string | undefined }> = [
    { key: 'room', label: 'CAP ROOM', width: 78, value: (t) => t.room, show: (t) => money(t.room), tone: (t) => (t.room < 0 ? 'var(--color-accent-700)' : 'var(--color-text)') },
    { key: 'salary', label: 'SALARY', width: 78, value: (t) => t.salary + t.adj, show: (t) => money(t.salary + t.adj) },
    { key: 'next', label: `${season + 1}`, width: 78, value: (t) => t.next, show: (t) => money(t.next) },
    { key: 'after', label: `${season + 2}`, width: 78, value: (t) => t.after, show: (t) => money(t.after) },
    { key: 'expiring', label: 'EXPIRING', width: 92, value: (t) => t.expiringTotal, show: (t) => `${t.expiring.length} · ${money(t.expiringTotal)}` },
    { key: 'roster', label: 'ROSTER', width: 52, value: (t) => t.counts.roster, show: (t) => `${t.counts.roster}/${limits.roster}`, tone: (t) => (limits.roster && t.counts.roster > limits.roster ? 'var(--color-accent-700)' : undefined) },
    { key: 'taxi', label: 'TAXI', width: 40, value: (t) => t.counts.taxi, show: (t) => `${t.counts.taxi}/${limits.taxi}` },
    { key: 'ir', label: 'IR', width: 36, value: (t) => t.counts.ir, show: (t) => `${t.counts.ir}/${limits.ir}` },
  ];

  const teams = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key)!;
    return [...view.teams].sort((a, b) => (sort.desc ? -1 : 1) * (col.value(a) - col.value(b)) || a.name.localeCompare(b.name));
    // cols are rebuilt each render from stable inputs; the sort only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.teams, sort]);

  const frozen = (bg: string): CSSProperties => ({
    position: 'sticky', left: 0, zIndex: 1, background: bg, width: TEAM_W, minWidth: TEAM_W, maxWidth: TEAM_W,
    boxShadow: scrolled ? '6px 0 8px -6px rgba(0,0,0,.28)' : 'inset -1px 0 0 var(--color-divider)',
  });
  const onSort = (key: Key) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <PhoneFrame>
      <StatusBar label="CAP" />
      <HeaderBar back="/more/" right={<HeaderLabel>CAP SHEET</HeaderLabel>} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '10px 14px 8px', fontSize: 10.5, color: 'var(--color-neutral-600)', lineHeight: 1.45 }}>
          {money(cap)} cap. IR counts against it; the taxi squad doesn&apos;t. {season + 1} and {season + 2} are salary already
          committed at today&apos;s contracts.
        </div>
        <div onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)} style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...headCell, ...frozen('var(--color-bg)'), textAlign: 'left', paddingLeft: 14, cursor: 'default' }}>TEAM</th>
                {cols.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                      style={{ ...headCell, minWidth: c.width, color: active ? 'var(--color-accent-700)' : headCell.color }}
                    >
                      {c.label}{active ? (sort.desc ? ' ▼' : ' ▲') : ''}
                    </th>
                  );
                })}
                <th aria-hidden style={{ ...headCell, width: '100%', padding: 0, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const mine = t.id === myTeam;
                const bg = mine ? 'color-mix(in srgb, var(--color-accent) 7%, var(--color-bg))' : 'var(--color-bg)';
                const cell: CSSProperties = { borderBottom: '1px solid var(--color-divider)', background: bg };
                const isOpen = open === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : t.id)}
                      aria-expanded={isOpen}
                      style={{ cursor: 'pointer' }}
                    >
                      <th scope="row" style={{ ...cell, ...frozen(bg), padding: 0, textAlign: 'left', fontWeight: 'normal' }}>
                        <div style={{ position: 'relative', height: ROW_H, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                          <FadedTeamLogo name={t.name} icon={t.icon} />
                          {mine && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--color-accent)' }} />}
                          <span
                            style={{
                              position: 'relative', margin: '0 8px 0 38px', font: `${mine ? 800 : 700} 12px/1.2 var(--font-body)`,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              textShadow: '0 0 6px var(--color-bg), 0 0 2px var(--color-bg)', textWrap: 'balance',
                            }}
                          >
                            {t.name}
                          </span>
                        </div>
                      </th>
                      {cols.map((c) => (
                        <td
                          key={c.key}
                          style={{
                            ...cell, padding: '0 6px', height: ROW_H, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                            font: c.key === 'room' ? '800 13px var(--font-heading)' : '500 12px var(--font-body)',
                            color: c.tone?.(t) ?? 'var(--color-neutral-800)',
                          }}
                        >
                          {c.show(t)}
                        </td>
                      ))}
                      <td aria-hidden style={cell} />
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={cols.length + 2} style={{ padding: 0, borderBottom: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)' }}>
                          <div style={{ position: 'sticky', left: 0, width: 'min(390px, 100vw)', padding: '8px 14px 10px', boxSizing: 'border-box' }}>
                            <div style={{ font: '800 9px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)', marginBottom: 4 }}>
                              EXPIRING AFTER {season}{t.adj ? ` · CAP ADJUSTMENT ${t.adj > 0 ? '+' : ''}${money(t.adj)}` : ''}
                            </div>
                            {t.expiring.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>No contracts expire this season.</div>
                            ) : (
                              t.expiring.map((p) => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                                  <span>
                                    <PlayerLink playerId={p.id}>{p.name}</PlayerLink>
                                    <span style={{ font: '800 9px var(--font-heading)', color: 'var(--color-neutral-600)', marginLeft: 6 }}>{p.pos}</span>
                                  </span>
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(p.salary)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}
