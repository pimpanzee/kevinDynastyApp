'use client';

import { useEffect, useState, type ReactNode } from 'react';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { SectionLabel } from '../SettingsScreen';

const ShareIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-2px' }}>
    <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol style={{ margin: 0, padding: '0 14px 0 34px', fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-800)' }}>
      {children}
    </ol>
  );
}

function Step({ children }: { children: ReactNode }) {
  return <li style={{ marginBottom: 8 }}>{children}</li>;
}

export default function InstallGuide() {
  // Unknown on the server; filled in once the page is in the browser.
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true);
    const ua = navigator.userAgent;
    setPlatform(/iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other');
  }, []);

  const iphone = (
    <>
      <SectionLabel>IPHONE (SAFARI)</SectionLabel>
      <Steps>
        <Step>Open <strong>pimpanzee.github.io/kevinDynastyApp</strong> in <strong>Safari</strong>. Other browsers and in-app browsers (texts, Instagram) can&apos;t install it.</Step>
        <Step>Tap the Share button {ShareIcon} (bottom of the screen, or top right on iPad).</Step>
        <Step>Scroll down and tap <strong>Add to Home Screen</strong>.</Step>
        <Step>Keep the name The Liam and tap <strong>Add</strong>.</Step>
        <Step>Open it from the new icon. It runs full screen, without Safari&apos;s bars.</Step>
      </Steps>
    </>
  );
  const android = (
    <>
      <SectionLabel>ANDROID (CHROME)</SectionLabel>
      <Steps>
        <Step>Open <strong>pimpanzee.github.io/kevinDynastyApp</strong> in <strong>Chrome</strong>.</Step>
        <Step>Tap the <strong>⋮</strong> menu (top right).</Step>
        <Step>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then <strong>Install</strong>.</Step>
        <Step>Open it from the new icon.</Step>
      </Steps>
    </>
  );

  return (
    <PhoneFrame>
      <StatusBar label="INSTALL" />
      <HeaderBar back="/settings/" right={<HeaderLabel>INSTALL</HeaderLabel>} />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        {installed && (
          <div style={{ margin: '14px 14px 0', padding: '10px 12px', background: 'var(--color-neutral-200)', borderLeft: '3px solid var(--color-accent)', fontSize: 12.5, lineHeight: 1.45 }}>
            <strong>You&apos;re using the installed app.</strong> Nothing more to do.
          </div>
        )}
        <p style={{ margin: '14px 14px 0', fontSize: 13, lineHeight: 1.45 }}>
          Add The Liam to your Home Screen and it opens like an app: full screen, one tap away, with live scores on game day.
        </p>

        {platform === 'android' ? <>{android}{iphone}</> : <>{iphone}{android}</>}

        <SectionLabel>GOOD TO KNOW</SectionLabel>
        <ul style={{ margin: 0, padding: '0 14px 0 34px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-800)' }}>
          <li style={{ marginBottom: 8 }}><strong>It updates itself.</strong> New features and scores load whenever you open it; no need to re-add it.</li>
          <li style={{ marginBottom: 8 }}><strong>Seeing Safari&apos;s bars?</strong> That icon is an old bookmark. Delete it and add The Liam again with the steps above.</li>
          <li style={{ marginBottom: 8 }}><strong>Pick your team inside the app.</strong> The installed app keeps its own settings, separate from Safari: Settings ⚙ → Your team.</li>
        </ul>
      </div>
    </PhoneFrame>
  );
}
