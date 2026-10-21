'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LeagueFrame from '@/components/league/LeagueFrame';
import TeamChip from '@/components/league/TeamChip';
import { DISPLAY } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import { compareTeams, recordPct } from '@/lib/standingsSort';
import type { StandingsTeamView, StandingsView } from '@/lib/types';
import PlayoffOdds, { pctLabel } from './PlayoffOdds';

/**
 * League › Standings: conference, then division, teams ordered by VP, then
 * division record, conference record and PF (as MFL ranks them). Scrolls
 * sideways with the team column pinned. Under each conference,
 * the wild-card race in one line (two division winners + one wild card per
 * conference make the playoffs). Rows open the team page. A toggle at the top
 * swaps the table for simulated playoff odds; the table keeps a PO% column.
 */

const COLS_VP = '172px 30px 40px 40px 40px 64px 64px 52px 52px 40px 44px';
const COLS = '172px 40px 40px 40px 64px 64px 52px 52px 40px 44px';
const VIEW_KEY = 'standings-view';
const num = (s: string) => Number(s.replace(/,/g, '')) || 0;
const fmt1 = (s: string) => num(s).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wins = (t: StandingsTeamView) => Number(t.record.split('-')[0]) || 0;
const recordOnly = (r: string) => r.replace(/-0$/, '');

export default function StandingsScreen({ view }: { view: StandingsView }) {
  const mine = useMyTeam(view.myFranchiseId);
  const [tab, setTab] = useState<'table' | 'odds'>('table');
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'odds' && view.odds) setTab('odds'); } catch { /* private mode */ }
  }, [view.odds]);
  const pick = (t: 'table' | 'odds') => {
    setTab(t);
    try { localStorage.setItem(VIEW_KEY, t); } catch { /* private mode */ }
  };
  const usesVp = view.groups.some((g) => g.teams.some((t) => t.vp !== null));
  const score = (t: StandingsTeamView) => (usesVp ? t.vp ?? 0 : wins(t));
  const key = (t: StandingsTeamView) => ({ vp: usesVp ? t.vp ?? 0 : null, record: t.record, div: t.div, conf: t.conf, pf: num(t.pf) });
  const order = (a: StandingsTeamView, b: StandingsTeamView) => compareTeams(key(a), key(b));
  /** What separates two teams level on VP (or wins), in the league's order. */
  const tiebreak = (a: StandingsTeamView, b: StandingsTeamView) =>
    !usesVp && recordPct(a.record) !== recordPct(b.record) ? 'record'
      : recordPct(a.div) !== recordPct(b.div) ? 'division record'
      : recordPct(a.conf) !== recordPct(b.conf) ? 'conference record' : 'points';

  // Conference → divisions, from "CONFERENCE 1 · DIVISION 1!".
  const confs: Array<{ name: string; divs: Array<{ name: string; teams: StandingsTeamView[] }> }> = [];
  for (const g of view.groups) {
    const [conf, div] = g.label.includes(' · ') ? g.label.split(' · ') : ['LEAGUE', g.label];
    let c = confs.find((x) => x.name === conf);
    if (!c) confs.push((c = { name: conf, divs: [] }));
    c.divs.push({ name: div, teams: g.teams.slice().sort(order) });
  }

  const heads = [...(usesVp ? ['VP'] : []), 'W-L', 'PO%', 'STRK', 'PF', 'PA', 'AVG PF', 'AVG PA', 'DIV', 'CONF'];
  const cols = usesVp ? COLS_VP : COLS;
  const unit = usesVp ? 'VP' : 'W';

  const toggle = view.odds && <ViewToggle tab={tab} onPick={pick} />;
  if (tab === 'odds' && view.odds) {
    return (
      <LeagueFrame>
        <PlayoffOdds view={view} odds={view.odds} confs={confs} mine={mine} usesVp={usesVp} toggle={toggle} />
      </LeagueFrame>
    );
  }

  return (
    <LeagueFrame>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-100)' }}>
        <div style={{ width: 'max-content', minWidth: '100%' }}>
          {toggle}
          {confs.map((c) => {
            const [wc, next] = c.divs.flatMap((d) => d.teams.slice(1)).sort(order);
            const gap = wc && next ? score(wc) - score(next) : 0;
            const wcLine = !wc ? '' : !next ? `WILD CARD · ${wc.name}`
              : gap > 0 ? `WILD CARD · ${wc.name} leads ${next.name} by ${gap} ${unit}`
              : `WILD CARD · ${wc.name} holds it over ${next.name} on ${tiebreak(wc, next)} (both ${score(wc)} ${unit})`;
            return (
              <div key={c.name}>
                <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', background: 'var(--bg-000)' }}>
                  <span style={{ position: 'sticky', left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
                    <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>{c.name}</span>
                  </span>
                </div>
                {c.divs.map((d) => (
                  <div key={d.name}>
                    <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: 26, background: 'var(--bg-200)', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                      <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 16, background: 'var(--bg-200)', boxShadow: '1px 0 0 var(--line)', color: 'var(--ink-2)', overflow: 'hidden' }}>{d.name}</span>
                      {heads.map((h, i) => <span key={h} style={{ textAlign: 'right', paddingRight: 8, color: i === 0 && usesVp ? 'var(--ink)' : undefined }}>{h}</span>)}
                    </div>
                    {d.teams.map((t) => <Row key={t.franchiseId} t={t} mine={t.franchiseId === mine} cols={cols} usesVp={usesVp} po={view.odds?.teams[t.franchiseId]?.playoffs} settled={!view.odds?.weeks} />)}
                  </div>
                ))}
                <div style={{ width: 358, maxWidth: '100vw', position: 'sticky', left: 0, padding: '8px 16px 12px', boxSizing: 'border-box', font: '500 12px/1.35 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{wcLine}</div>
              </div>
            );
          })}
        </div>
      </div>
    </LeagueFrame>
  );
}

/** STANDINGS · PLAYOFF ODDS, a small two-way switch above the table. */
export function ViewToggle({ tab, onPick }: { tab: 'table' | 'odds'; onPick: (t: 'table' | 'odds') => void }) {
  const opt = (key: 'table' | 'odds', label: string) => {
    const on = tab === key;
    return (
      <button type="button" aria-pressed={on} onClick={() => onPick(key)} style={{ flex: 1, height: 28, border: 0, padding: 0, cursor: 'pointer', font: DISPLAY(11), letterSpacing: '.1em', color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--bg-300)' : 'transparent', boxShadow: on ? 'inset 0 -2px 0 var(--volt)' : undefined }}>{label}</button>
    );
  };
  return (
    <div style={{ width: 390, maxWidth: '100vw', position: 'sticky', left: 0, padding: '10px 16px', boxSizing: 'border-box', background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
      <div role="group" aria-label="Standings view" style={{ display: 'flex', border: '1px solid var(--edge)', borderRadius: 6, overflow: 'hidden' }}>
        {opt('table', 'TABLE')}{opt('odds', 'PLAYOFF ODDS')}
      </div>
    </div>
  );
}

function Row({ t, mine, cols, usesVp, po, settled }: { t: StandingsTeamView; mine: boolean; cols: string; usesVp: boolean; po?: number; settled: boolean }) {
  const body = '500 13px/1 var(--font-body)';
  const cells: Array<{ v: string | number; font?: string; ink?: string }> = [
    ...(usesVp ? [{ v: t.vp ?? '—', font: DISPLAY(16), ink: 'var(--ink)' }] : []),
    { v: recordOnly(t.record), ink: 'var(--ink)' },
    { v: pctLabel(po, settled), font: '600 13px/1 var(--font-body)', ink: po === undefined ? 'var(--ink-3)' : po >= 0.5 ? 'var(--ink)' : 'var(--ink-3)' },
    { v: t.streak, ink: t.streak.startsWith('W') ? 'var(--rise)' : t.streak.startsWith('L') ? 'var(--fall)' : 'var(--ink-3)' },
    { v: fmt1(t.pf) }, { v: fmt1(t.pa) }, { v: fmt1(t.avgPf) }, { v: fmt1(t.avgPa) },
    { v: recordOnly(t.div) }, { v: recordOnly(t.conf) },
  ];
  return (
    <Link href={`/league/team/${t.franchiseId}/`} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: 40, borderBottom: '1px solid var(--line)', background: mine ? 'var(--bg-200)' : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 16px', boxSizing: 'border-box', minWidth: 0, background: mine ? 'var(--bg-200)' : 'var(--bg-100)', boxShadow: `${mine ? 'inset 3px 0 0 var(--volt), ' : ''}1px 0 0 var(--line)` }}>
        <TeamChip name={t.name} icon={t.icon} />
        <span style={{ minWidth: 0, font: `${mine ? 700 : 600} 13.5px/1.25 var(--font-body)`, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
      </span>
      {cells.map((c, i) => <span key={i} style={{ textAlign: 'right', paddingRight: 8, font: c.font ?? body, color: c.ink ?? 'var(--ink-2)' }}>{c.v}</span>)}
    </Link>
  );
}
