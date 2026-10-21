'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import TeamChip from '@/components/league/TeamChip';
import { DISPLAY } from '@/components/team/format';
import type { StandingsOdds, StandingsTeamView, StandingsView } from '@/lib/types';

/**
 * Standings › Playoff odds: each conference's teams ordered by their chance of
 * making the playoffs, with division, bye and title odds beside it. The
 * numbers come from simulating the rest of the season (lib/mfl/playoffOdds).
 * Above each conference's odds, the projected bracket: the most likely bye,
 * division winner and wild card from those same simulations.
 */

const COLS = '160px 30px 44px 44px 64px 48px';
const head = { textAlign: 'right', paddingRight: 8 } as const;

/** A share as a whole percentage, without claiming certainty a simulation can't give. */
export function pctLabel(p: number | undefined, settled: boolean): string {
  if (p === undefined) return '—';
  if (p >= 1) return settled ? '100' : '>99';
  if (p <= 0) return settled ? '0' : '<1';
  if (p >= 0.995) return '>99';
  if (p < 0.005) return '<1';
  return String(Math.round(p * 100));
}

export default function PlayoffOdds({ view, odds, confs, mine, usesVp, toggle }: {
  view: StandingsView;
  odds: StandingsOdds;
  confs: Array<{ name: string; divs: Array<{ name: string; teams: StandingsTeamView[] }> }>;
  mine: string;
  usesVp: boolean;
  toggle: ReactNode;
}) {
  const settled = !odds.weeks;
  const fmt = (p: number | undefined) => pctLabel(p, settled);
  const weeksLeft = odds.weeks ? odds.weeks[1] - odds.weeks[0] + 1 : 0;
  const myOdds = odds.teams[mine];
  const myName = view.groups.flatMap((g) => g.teams).find((t) => t.franchiseId === mine)?.name;

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-100)' }}>
      <div style={{ width: 'max-content', minWidth: '100%' }}>
        {toggle}
        {myOdds && myName && (
          <div style={{ width: 390, maxWidth: '100vw', position: 'sticky', left: 0, padding: '12px 16px', boxSizing: 'border-box', borderBottom: '1px solid var(--edge)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ font: DISPLAY(30, 800), color: 'var(--volt)', fontVariantNumeric: 'tabular-nums' }}>{fmt(myOdds.playoffs)}%</span>
            <span style={{ font: '500 13px/1.35 var(--font-body)', color: 'var(--ink-2)' }}>
              chance {myName} makes the playoffs · {fmt(myOdds.bye)}% bye · {fmt(myOdds.title)}% title
            </span>
          </div>
        )}
        {confs.map((c) => {
          const teams = c.divs.flatMap((d) => d.teams).sort((a, b) => {
            const oa = odds.teams[a.franchiseId];
            const ob = odds.teams[b.franchiseId];
            return (ob?.playoffs ?? 0) - (oa?.playoffs ?? 0) || (ob?.title ?? 0) - (oa?.title ?? 0) || (ob?.avgFinal ?? 0) - (oa?.avgFinal ?? 0);
          });
          return (
            <div key={c.name}>
              <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', background: 'var(--bg-000)' }}>
                <span style={{ position: 'sticky', left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
                  <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>{c.name}</span>
                </span>
              </div>
              <Bracket divs={c.divs} odds={odds} mine={mine} fmt={fmt} />
              <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 26, background: 'var(--bg-200)', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 16, background: 'var(--bg-200)', boxShadow: '1px 0 0 var(--line)' }}>TEAM</span>
                <span style={head}>{usesVp ? 'VP' : 'W'}</span>
                <span style={head}>DIV</span>
                <span style={head}>BYE</span>
                <span style={{ ...head, color: 'var(--ink)' }}>PLAYOFF</span>
                <span style={{ ...head, paddingRight: 16 }}>TITLE</span>
              </div>
              {teams.map((t) => {
                const o = odds.teams[t.franchiseId];
                const me = t.franchiseId === mine;
                const po = o?.playoffs ?? 0;
                const cell = (p: number | undefined, extra?: React.CSSProperties) => (
                  <span style={{ ...head, font: '500 13px/1 var(--font-body)', color: (p ?? 0) >= 0.5 ? 'var(--ink-2)' : 'var(--ink-3)', ...extra }}>{fmt(p)}</span>
                );
                return (
                  <Link key={t.franchiseId} href={`/league/team/${t.franchiseId}/`} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 44, borderBottom: '1px solid var(--line)', background: me ? 'var(--bg-200)' : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 16px', boxSizing: 'border-box', minWidth: 0, background: me ? 'var(--bg-200)' : 'var(--bg-100)', boxShadow: `${me ? 'inset 3px 0 0 var(--volt), ' : ''}1px 0 0 var(--line)` }}>
                      <TeamChip name={t.name} icon={t.icon} />
                      <span style={{ minWidth: 0, font: `${me ? 700 : 600} 13.5px/1.25 var(--font-body)`, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    </span>
                    <span style={{ ...head, font: '500 13px/1 var(--font-body)', color: 'var(--ink-2)' }}>{usesVp ? t.vp ?? '—' : t.record.split('-')[0]}</span>
                    {cell(o?.division)}
                    {cell(o?.bye)}
                    <span style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                      <span aria-hidden style={{ position: 'absolute', left: 6, right: 4, bottom: 9, height: 3, borderRadius: 2, background: 'var(--line)' }}>
                        <span style={{ display: 'block', width: `${Math.round(po * 100)}%`, height: '100%', borderRadius: 2, background: po >= 0.5 ? 'var(--volt)' : 'var(--ink-3)' }} />
                      </span>
                      <span style={{ font: DISPLAY(16), color: po >= 0.5 ? 'var(--ink)' : 'var(--ink-3)', marginTop: -6 }}>{fmt(o?.playoffs)}</span>
                    </span>
                    {cell(o?.title, { paddingRight: 16 })}
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div style={{ width: 390, maxWidth: '100vw', position: 'sticky', left: 0, padding: '10px 16px 16px', boxSizing: 'border-box', font: '500 11.5px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
          {settled
            ? `The regular season is over, so the field is set. Title odds come from playing the bracket ${odds.sims.toLocaleString('en-US')} times.`
            : `From playing the last ${weeksLeft} regular-season ${weeksLeft === 1 ? 'week' : 'weeks'} (Weeks ${odds.weeks![0]}–${odds.weeks![1]}) and the playoffs ${odds.sims.toLocaleString('en-US')} times.`}
          {' '}Each team&apos;s weekly score is drawn from what it has scored this season, blended with its projected best lineup that week, so byes and injuries count. Division winners and one wild card per conference make it; the better division winner in each conference gets the bye. Ties go by the rule book: {usesVp ? 'victory points, then record, then ' : 'record, then '}head-to-head, division record, conference record and points for division winners; conference record, points and head-to-head for the wild card. Percentages are shares of simulations, so ‘&gt;99’ isn&apos;t a clinch.
        </div>
      </div>
    </div>
  );
}

/**
 * The projected bracket: each conference's most likely outcome from the
 * simulations. The bye goes to the team that got it most often; the other
 * division's most frequent winner hosts; the wild card is whoever got in as
 * one most often; first out is the best playoff chance left over.
 */
function Bracket({ divs, odds, mine, fmt }: {
  divs: Array<{ teams: StandingsTeamView[] }>;
  odds: StandingsOdds;
  mine: string;
  fmt: (p: number | undefined) => string;
}) {
  const o = (t: StandingsTeamView) => odds.teams[t.franchiseId];
  const most = (list: StandingsTeamView[], by: (t: StandingsTeamView) => number) =>
    list.slice().sort((a, b) => by(b) - by(a) || (o(b)?.playoffs ?? 0) - (o(a)?.playoffs ?? 0))[0];
  const all = divs.flatMap((d) => d.teams);
  const top = most(all, (t) => o(t)?.bye ?? 0);
  if (!top) return null;
  const topDiv = divs.find((d) => d.teams.includes(top));
  const others = divs.filter((d) => d !== topDiv).flatMap((d) => d.teams);
  // Winning the division without the bye.
  const hostShare = (t: StandingsTeamView) => (o(t)?.division ?? 0) - (o(t)?.bye ?? 0);
  const host = most(others, hostShare);
  const wc = host && most(all.filter((t) => t !== top && t !== host), (t) => o(t)?.wildcard ?? 0);
  if (!host || !wc) return null;
  const out = most(all.filter((t) => t !== top && t !== host && t !== wc), (t) => o(t)?.playoffs ?? 0);

  const line = (t: StandingsTeamView, seed: string, tag: string, share: number) => {
    const me = t.franchiseId === mine;
    return (
      <Link href={`/league/team/${t.franchiseId}/`} style={{ display: 'grid', gridTemplateColumns: '18px 26px minmax(0, 1fr) auto 40px', alignItems: 'center', gap: 8, height: 38, padding: '0 16px 0 12px', boxShadow: me ? 'inset 3px 0 0 var(--volt)' : undefined, background: me ? 'var(--bg-200)' : undefined }}>
        <span style={{ font: DISPLAY(14, 800), textAlign: 'right', color: seed === '1' ? 'var(--volt)' : 'var(--ink-2)' }}>{seed}</span>
        <TeamChip name={t.name} icon={t.icon} size={24} />
        <span style={{ minWidth: 0, font: `${me ? 700 : 600} 13.5px/1.2 var(--font-body)`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
        <span style={{ font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tag} {fmt(share)}%</span>
        <span style={{ textAlign: 'right', font: DISPLAY(14), color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(o(t)?.playoffs)}%</span>
      </Link>
    );
  };

  return (
    <div style={{ width: 390, maxWidth: '100vw', position: 'sticky', left: 0, boxSizing: 'border-box', padding: '8px 0 10px', borderBottom: '1px solid var(--edge)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 4px', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
        <span>PROJECTED BRACKET</span><span>PLAYOFF</span>
      </div>
      {line(top, '1', 'BYE', o(top)?.bye ?? 0)}
      <div style={{ position: 'relative', margin: '4px 0' }}>
        <span aria-hidden style={{ position: 'absolute', left: 4, top: 12, bottom: 12, width: 4, borderLeft: '1.5px solid var(--ink-3)', borderTop: '1.5px solid var(--ink-3)', borderBottom: '1.5px solid var(--ink-3)' }} />
        {line(host, '2', 'DIV WIN', hostShare(host))}
        {line(wc, '3', 'WILD CARD', o(wc)?.wildcard ?? 0)}
      </div>
      <div style={{ padding: '2px 16px 0 42px', font: '500 11.5px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>
        2 hosts 3 in Week 15; the winner plays {top.name} in Week 16.{out ? ` First out: ${out.name} (${fmt(o(out)?.playoffs)}%).` : ''} The small numbers are how often each team landed in that spot.
      </div>
    </div>
  );
}
