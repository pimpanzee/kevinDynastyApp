'use client';

import Link from 'next/link';
import TeamScreen from '@/components/team/TeamScreen';
import { DISPLAY } from '@/components/team/format';
import type { TeamsData } from '@/lib/types';

const MFL = `https://www44.myfantasyleague.com/${process.env.NEXT_PUBLIC_SEASON ?? '2025'}`;
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID ?? '63396';

/**
 * Another team: the My Team screens (header line, ROSTER / CAP / PICKS),
 * with ← LEAGUE and PROPOSE TRADE (MFL's trade screen) in the top bar.
 */
export default function TeamPageScreen({ data, teamId }: { data: TeamsData; teamId: string }) {
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
      <Link href="/league/standings/" aria-label="Back to League" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', marginLeft: -8, color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
        LEAGUE
      </Link>
      <a
        href={`${MFL}/options?L=${LEAGUE_ID}&O=05&FRANCHISE=${teamId}`}
        target="_blank"
        rel="noreferrer"
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', height: 36, padding: '0 14px', background: 'var(--volt)', color: 'var(--on-volt)', borderRadius: 2, font: DISPLAY(13, 800), letterSpacing: '.1em' }}
      >
        PROPOSE TRADE
      </a>
    </div>
  );
  return <TeamScreen data={data} teamId={teamId} header={header} />;
}
