'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { saveTeam, useMyTeam } from '@/lib/myTeam';

export interface FranchiseOption {
  id: string;
  name: string;
  icon: string | null;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '16px 14px 8px', font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>
      {children}
    </div>
  );
}

/** A team's icon in a circle, or its initials when it has none. */
export function TeamBadge({ team, size = 30 }: { team: FranchiseOption; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = team.name.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-neutral-300)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 10px var(--font-heading)', color: 'var(--color-neutral-800)',
    }}>
      {team.icon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote owner images in a static export
        <img src={team.icon} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initials}
    </span>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 14px', width: '100%',
  cursor: 'pointer', background: 'none', borderWidth: '0 0 1px', borderStyle: 'solid', borderColor: 'var(--color-divider)',
  textAlign: 'left' as const, color: 'var(--color-text)', font: 'inherit',
};

export default function SettingsScreen({ franchises, defaultTeam }: { franchises: FranchiseOption[]; defaultTeam: string }) {
  const team = useMyTeam(defaultTeam);
  const [saved, setSaved] = useState(false);

  const pick = (id: string) => {
    saveTeam(id);
    setSaved(true);
  };

  return (
    <PhoneFrame>
      <StatusBar label="SETTINGS" />
      <HeaderBar back="/matchups/" right={<HeaderLabel>SETTINGS</HeaderLabel>} />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        <SectionLabel>YOUR TEAM</SectionLabel>
        <p style={{ margin: '0 14px 10px', fontSize: 11.5, lineHeight: 1.45, color: 'var(--color-neutral-700)' }}>
          Your matchup leads the Matchups screen, Rosters opens on your team, and the race bar tracks you.
          {saved && <strong style={{ color: 'var(--color-text)' }}> Saved.</strong>}
        </p>
        <div role="radiogroup" aria-label="Your team" style={{ borderTop: '1px solid var(--color-divider)' }}>
          {franchises.map((f) => {
            const selected = f.id === team;
            return (
              <button key={f.id} role="radio" aria-checked={selected} onClick={() => pick(f.id)} style={rowStyle}>
                <TeamBadge team={f} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: selected ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </span>
                <span aria-hidden style={{ width: 18, font: '800 14px var(--font-heading)', color: 'var(--color-accent)' }}>{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
        <p style={{ margin: '8px 14px 0', fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-neutral-600)' }}>
          Saved on this device. The installed Home Screen app keeps its own settings, so pick your team there too.
        </p>

        <SectionLabel>GUIDES</SectionLabel>
        <div style={{ borderTop: '1px solid var(--color-divider)' }}>
          <GuideLink href="/settings/install/" title="Install the app" sub="Add GRIDLOCK to your Home Screen" />
          <GuideLink href="/widget/" title="Home Screen widget" sub="Live score and key plays on your Home or Lock Screen" />
        </div>
      </div>
    </PhoneFrame>
  );
}

function GuideLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} style={rowStyle}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>{sub}</span>
      </span>
      <span aria-hidden style={{ font: '800 14px var(--font-heading)', color: 'var(--color-neutral-600)' }}>›</span>
    </Link>
  );
}
