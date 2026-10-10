'use client';

import type { CSSProperties } from 'react';
import BottomNav from '@/components/BottomNav';
import FadedTeamLogo from '@/components/FadedTeamLogo';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import { SectionTitle, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import TeamAvatar from '@/components/TeamAvatar';
import { useMyTeam } from '@/lib/myTeam';
import type { PickBoardView } from '@/lib/types';

/**
 * The future-pick board: for each draft year, one row per team's original
 * picks, showing who holds each round now. Picks still with their original
 * team read "own"; traded ones show the holder's icon. Yours are highlighted, and a
 * summary up top lists every pick you hold.
 */

const TEAM_W = 132;
const ROW_H = 40;
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

const headCell: CSSProperties = {
  font: '800 9px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)',
  padding: '8px 6px 7px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-neutral-300)',
};

export default function PicksScreen({ view }: { view: PickBoardView }) {
  const myTeam = useMyTeam(view.myFranchiseId);
  const team = (id: string) => view.franchises.find((f) => f.id === id);

  const mine = view.years.map((y) => ({
    year: y.year,
    picks: y.rows.flatMap((r) =>
      r.owners.flatMap((o, i) => (o === myTeam ? [{ round: i + 1, from: r.original }] : [])),
    ).sort((a, b) => a.round - b.round),
  }));

  return (
    <PhoneFrame>
      <StatusBar label="PICKS" />
      <HeaderBar back="/more/" right={<HeaderLabel>DRAFT PICKS</HeaderLabel>} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '2px solid var(--color-text)' }}>
          <SectionTitle>YOUR PICKS</SectionTitle>
          {mine.map((y) => (
            <div key={y.year} style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'baseline' }}>
              <span style={{ width: 34, flex: 'none', font: '800 11px var(--font-heading)' }}>{y.year}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {y.picks.length === 0
                  ? <span style={{ color: 'var(--color-neutral-600)' }}>None</span>
                  : y.picks.map((p, i) => (
                    <span key={`${p.round}-${p.from}`}>
                      {i > 0 && ', '}
                      <b>{ord(p.round)}</b>
                      {p.from !== myTeam && <span style={{ color: 'var(--color-neutral-700)' }}> (via {team(p.from)?.name ?? p.from})</span>}
                    </span>
                  ))}
              </span>
            </div>
          ))}
        </div>

        {view.years.map((y) => (
          <div key={y.year}>
            <StickySectionHeader padding="14px 14px 8px">
              <SectionTitle tracking=".1em">{y.year} DRAFT</SectionTitle>
            </StickySectionHeader>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, width: TEAM_W, textAlign: 'left', paddingLeft: 14 }}>ORIGINAL</th>
                  {Array.from({ length: y.rounds }, (_, i) => <th key={i} style={headCell}>{ord(i + 1).toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {y.rows.map((r) => {
                  const orig = team(r.original);
                  const isMine = r.original === myTeam;
                  return (
                    <tr key={r.original}>
                      <th scope="row" style={{ padding: 0, borderBottom: '1px solid var(--color-divider)', textAlign: 'left', fontWeight: 'normal' }}>
                        <div style={{ position: 'relative', height: ROW_H, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                          <FadedTeamLogo name={orig?.name ?? r.original} icon={orig?.icon} />
                          {isMine && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--color-accent)' }} />}
                          <span
                            style={{
                              position: 'relative', margin: '0 6px 0 34px', font: `${isMine ? 800 : 700} 11.5px/1.2 var(--font-body)`,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              textShadow: '0 0 6px var(--color-bg), 0 0 2px var(--color-bg)',
                            }}
                          >
                            {orig?.name ?? r.original}
                          </span>
                        </div>
                      </th>
                      {r.owners.map((o, i) => {
                        const own = o === r.original;
                        const yours = o === myTeam;
                        const holder = o ? team(o) : null;
                        return (
                          <td
                            key={i}
                            title={o ? (own ? 'Still with original team' : `Held by ${holder?.name ?? o}`) : 'Not listed'}
                            style={{
                              borderBottom: '1px solid var(--color-divider)', textAlign: 'center', padding: '0 3px', height: ROW_H,
                              background: yours ? 'color-mix(in srgb, var(--color-accent) 7%, var(--color-bg))' : undefined,
                            }}
                          >
                            {!o ? (
                              <span style={{ color: 'var(--color-neutral-500)' }}>—</span>
                            ) : own ? (
                              <span style={{ fontSize: 10, color: yours ? 'var(--color-accent-700)' : 'var(--color-neutral-500)', fontWeight: yours ? 800 : 500 }}>own</span>
                            ) : (
                              // A traded pick shows its holder's icon, like the race bar; the name is in the title.
                              <span
                                aria-label={`Held by ${holder?.name ?? o}`}
                                style={{
                                  display: 'inline-flex', borderRadius: '50%',
                                  boxShadow: yours ? '0 0 0 2px var(--color-accent)' : undefined,
                                }}
                              >
                                <TeamAvatar name={holder?.name ?? o} icon={holder?.icon ?? null} size={24} />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}
