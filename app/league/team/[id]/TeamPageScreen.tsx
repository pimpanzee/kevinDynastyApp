'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import TeamScreen from '@/components/team/TeamScreen';
import { DISPLAY } from '@/components/team/format';
import type { TeamsData } from '@/lib/types';

/**
 * Another team: the My Team screens (header line, ROSTER / CAP / PICKS),
 * with ← BACK and PROPOSE TRADE in the top bar. Team names all over the app
 * open this page, so BACK returns wherever you came from (League standings
 * when opened directly).
 */
export default function TeamPageScreen({ data, teamId }: { data: TeamsData; teamId: string }) {
  const router = useRouter();
  const goBack = (e: MouseEvent) => {
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
      <Link href="/league/standings/" onClick={goBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', marginLeft: -8, color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
        BACK
      </Link>
      <Link
        href={`/league/team/${teamId}/trade/`}
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', height: 36, padding: '0 14px', background: 'var(--volt)', color: 'var(--on-volt)', borderRadius: 2, font: DISPLAY(13, 800), letterSpacing: '.1em' }}
      >
        PROPOSE TRADE
      </Link>
    </div>
  );
  return <TeamScreen data={data} teamId={teamId} header={header} />;
}
