import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import MenuLink from '@/components/MenuLink';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';

/**
 * The More tab: a menu of the pages that don't get a tab of their own. A new
 * page is one entry in PAGES; put it under /more/ and the tab stays lit on it.
 */

const svg = (children: ReactNode) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const PAGES: Array<{ href: string; title: string; sub: string; icon: ReactNode }> = [
  {
    href: '/more/transactions/',
    title: 'Transactions',
    sub: 'Waivers, adds and drops, trades, IR and taxi moves',
    icon: svg(<><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></>),
  },
  {
    href: '/settings/',
    title: 'Settings',
    sub: 'Pick your team',
    icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" /></>),
  },
  {
    href: '/settings/install/',
    title: 'Install the app',
    sub: 'Add The Liam to your Home Screen',
    icon: svg(<><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M12 7v7M9 11l3 3 3-3" /></>),
  },
  {
    href: '/widget/',
    title: 'Home Screen widget',
    sub: 'Live score and key plays on your Home or Lock Screen',
    icon: svg(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="18" height="8" rx="1.5" /></>),
  },
];

export default function MorePage() {
  return (
    <PhoneFrame>
      <StatusBar label="MORE" />
      <HeaderBar right={<HeaderLabel>MORE</HeaderLabel>} />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {PAGES.map((p) => (
          <MenuLink key={p.href} {...p} />
        ))}
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}
