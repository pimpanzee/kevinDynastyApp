'use client';

import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import SubTabs from '@/components/SubTabs';

const TABS = [
  { key: 'recap', label: 'RECAP', href: '/league/recap/' },
  { key: 'activity', label: 'ACTIVITY', href: '/league/' },
  { key: 'standings', label: 'STANDINGS', href: '/league/standings/' },
  { key: 'ratings', label: 'RATINGS', href: '/league/ratings/' },
];

/** The League section: header, RECAP · ACTIVITY · STANDINGS · RATINGS, the tab bar. */
export default function LeagueFrame({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar />
      <SubTabs label="League sections" tabs={TABS} />
      {children}
      <BottomNav />
    </PhoneFrame>
  );
}
