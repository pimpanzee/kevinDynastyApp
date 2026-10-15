'use client';

import { useState, type ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import SubTabs from '@/components/SubTabs';
import Link from 'next/link';
import { useMyTeam } from '@/lib/myTeam';
import { useCanMove } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import CapTab from './CapTab';
import PicksTab from './PicksTab';
import RosterTab from './RosterTab';
import { pts1 } from './format';

export type TeamTab = 'roster' | 'cap' | 'picks';

/**
 * A team's page: name, the one-line summary (record · VP · AVG PF · PP), the
 * ROSTER / CAP / PICKS strip and the chosen tab. My Team shows the viewer's
 * own team with each tab on its own route; a League team page passes
 * `teamId` and a custom `header`, and switches tabs in place.
 */
export default function TeamScreen({ data, tab: routeTab, teamId, header }: { data: TeamsData; tab?: TeamTab; teamId?: string; header?: ReactNode }) {
  const mine = useMyTeam(data.myFranchiseId);
  const canMove = useCanMove();
  const [localTab, setLocalTab] = useState<TeamTab>('roster');
  const id = teamId ?? mine;
  const team = data.teams.find((t) => t.id === id) ?? data.teams[0];
  const tab = teamId ? localTab : routeTab ?? 'roster';
  const bits: Array<[string, string]> = [[team.record, '']];
  if (team.vp !== null) bits.push([String(team.vp), 'VP']);
  bits.push([pts1(team.avgPf), 'AVG PF'], [pts1(team.pp), 'PP']);

  const tabs = [
    { key: 'roster', label: 'ROSTER', href: '/team/' },
    { key: 'cap', label: 'CAP', href: '/team/cap/' },
    { key: 'picks', label: 'PICKS', href: '/team/picks/' },
  ];

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      {header ?? <HeaderBar />}
      <div style={{ flex: 'none', padding: '14px 16px', background: 'var(--bg-100)' }}>
        <div style={{ font: '800 32px/.95 var(--font-display)', letterSpacing: '.01em', textTransform: 'uppercase' }}>{team.name}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {bits.map(([v, l]) => (
            <span key={l || 'rec'}><b style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</b>{l && ` ${l}`}</span>
          ))}
        </div>
      </div>
      <SubTabs
        label={`${team.name} sections`}
        tabs={tabs}
        active={tab}
        onSelect={teamId ? (k) => setLocalTab(k as TeamTab) : undefined}
      />
      {tab === 'roster' && !teamId && canMove && (
        <Link href="/team/lineup/" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, margin: '10px 16px 0', borderRadius: 2, background: 'var(--volt)', color: 'var(--on-volt)', font: '700 13px/1 var(--font-display)', letterSpacing: '.12em' }}>
          SET LINEUP · IR · TAXI
        </Link>
      )}
      {tab === 'roster' && <RosterTab data={data} team={team} />}
      {tab === 'cap' && <CapTab data={data} team={team} />}
      {tab === 'picks' && <PicksTab team={team} />}
      <BottomNav />
    </PhoneFrame>
  );
}
