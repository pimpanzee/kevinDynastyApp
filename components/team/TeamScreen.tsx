'use client';

import { useEffect, useState, type ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import SubTabs from '@/components/SubTabs';
import AllTimeLine from '@/components/league/AllTimeLine';
import Link from 'next/link';
import { useMyTeam } from '@/lib/myTeam';
import { capUsed, overCapBy } from '@/lib/cap';
import { canSignIn, getMine, isError, useAccount } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import CapTab from './CapTab';
import PicksTab from './PicksTab';
import RosterTab from './RosterTab';
import { money, pts1 } from './format';

export type TeamTab = 'roster' | 'cap' | 'picks';

/**
 * A team's page: name, the one-line summary (record · VP · AVG PF · PP), the
 * ROSTER / CAP / PICKS strip and the chosen tab. My Team shows the viewer's
 * own team with each tab on its own route; a League team page passes
 * `teamId` and a custom `header`, and switches tabs in place.
 */
export default function TeamScreen({ data, tab: routeTab, teamId, header }: { data: TeamsData; tab?: TeamTab; teamId?: string; header?: ReactNode }) {
  const mine = useMyTeam(data.myFranchiseId);
  const account = useAccount();
  const [localTab, setLocalTab] = useState<TeamTab>('roster');
  const id = teamId ?? mine;
  const team = data.teams.find((t) => t.id === id) ?? data.teams[0];
  const myTeam = data.teams.find((t) => t.id === mine) ?? null;
  const tab = teamId ? localTab : routeTab ?? 'roster';
  const canMove = tab === 'roster' && !teamId && !!account && account.franchiseId === id;

  // Over the cap, MFL refuses any lineup, so SET LINEUP is off. The build's
  // numbers show first; MFL's live roster replaces them so a fix counts at once.
  const [tip, setTip] = useState(false);
  const [liveOver, setLiveOver] = useState<number | null>(null);
  useEffect(() => {
    if (!canMove) return;
    let gone = false;
    getMine().then((r) => {
      if (gone || isError(r)) return;
      setLiveOver(overCapBy(capUsed(r.roster, r.capAdjust ?? team.adj), data.cap));
    });
    return () => { gone = true; };
  }, [canMove, team.adj, data.cap]);
  const overCap = liveOver ?? overCapBy(team.used, data.cap);
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
        <AllTimeLine team={team} mine={myTeam ? { id: myTeam.id, name: myTeam.name, icon: myTeam.icon } : null} />
      </div>
      <SubTabs
        label={`${team.name} sections`}
        tabs={tabs}
        active={tab}
        onSelect={teamId ? (k) => setLocalTab(k as TeamTab) : undefined}
      />
      {canMove && (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, margin: '10px 16px 0' }}>
          {overCap > 0
            ? (
              <span style={{ position: 'relative', display: 'flex' }}>
                <button type="button" aria-disabled="true" onClick={() => setTip((t) => !t)} style={{ ...moveLink, flex: 1, border: 0, opacity: 0.45, cursor: 'not-allowed' }}>SET LINEUP</button>
                {tip && (
                  <span role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 5, whiteSpace: 'nowrap', padding: '8px 10px', borderRadius: 4, background: 'var(--ink)', color: 'var(--bg-100)', font: '600 12.5px/1.2 var(--font-body)', boxShadow: '0 4px 12px rgba(0,0,0,.25)' }}>
                    <span aria-hidden style={{ position: 'absolute', top: -5, left: 18, width: 10, height: 10, background: 'var(--ink)', transform: 'rotate(45deg)' }} />
                    {money(overCap)} over the ${data.cap.toLocaleString('en-US')} cap.
                  </span>
                )}
              </span>
            )
            : <Link href="/team/lineup/" style={moveLink}>SET LINEUP</Link>}
          <Link href="/team/moves/" style={moveLink}>MANAGE ROSTER</Link>
          <Link href="/team/trades/" style={{ ...moveLink, gridColumn: '1 / -1', height: 36, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>TRADE OFFERS</Link>
        </div>
      )}
      {tab === 'roster' && !teamId && account === null && canSignIn && (
        <Link href="/login/?next=/team/" style={{ ...moveLink, flex: 'none', margin: '10px 16px 0', height: 36, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>SIGN IN TO MAKE MOVES</Link>
      )}
      {tab === 'roster' && <RosterTab data={data} team={team} />}
      {tab === 'cap' && <CapTab data={data} team={team} />}
      {tab === 'picks' && <PicksTab team={team} />}
      <BottomNav />
    </PhoneFrame>
  );
}

const moveLink = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 2,
  background: 'var(--volt)', color: 'var(--on-volt)', font: '700 13px/1 var(--font-display)', letterSpacing: '.12em',
} as const;
