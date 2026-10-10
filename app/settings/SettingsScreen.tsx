'use client';

import { useEffect, useState, type ReactNode } from 'react';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import MenuLink, { menuRowStyle as rowStyle } from '@/components/MenuLink';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import TeamAvatar from '@/components/TeamAvatar';
import { readTeam, saveTeam, useMyTeam } from '@/lib/myTeam';
import { useTheme, type Theme } from '@/lib/theme';

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

/** A franchise option's icon, or its initials. */
export function TeamBadge({ team, size = 30 }: { team: FranchiseOption; size?: number }) {
  return <TeamAvatar name={team.name} icon={team.icon} size={size} />;
}

export default function SettingsScreen({ franchises, defaultTeam }: { franchises: FranchiseOption[]; defaultTeam: string }) {
  const team = useMyTeam(defaultTeam);
  const [saved, setSaved] = useState(false);
  // The list stays open until a team has been chosen, then folds down to that
  // team with a way to reopen it. Unknown until the page reads storage.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    setExpanded(!readTeam());
  }, []);

  const pick = (id: string) => {
    const f = franchises.find((x) => x.id === id);
    saveTeam(id, f ? { name: f.name, icon: f.icon } : undefined);
    setSaved(true);
    setExpanded(false);
  };
  const current = franchises.find((f) => f.id === team);

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
        {!expanded && current ? (
          <div style={{ borderTop: '1px solid var(--color-divider)' }}>
            <button onClick={() => setExpanded(true)} aria-expanded={false} style={rowStyle}>
              <TeamBadge team={current} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {current.name}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>Your team</span>
              </span>
              <span style={{ flex: 'none', font: '800 10.5px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-accent)' }}>CHANGE ▾</span>
            </button>
          </div>
        ) : (
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
        )}
        <p style={{ margin: '8px 14px 0', fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-neutral-600)' }}>
          Saved on this device. The installed Home Screen app keeps its own settings, so pick your team there too.
        </p>

        <SectionLabel>APPEARANCE</SectionLabel>
        <Appearance />

        <SectionLabel>GUIDES</SectionLabel>
        <div style={{ borderTop: '1px solid var(--color-divider)' }}>
          <MenuLink href="/settings/install/" title="Install the app" sub="Add The Liam to your Home Screen" />
          <MenuLink href="/widget/" title="Home Screen widget" sub="Live score and key plays on your Home or Lock Screen" />
        </div>
      </div>
    </PhoneFrame>
  );
}

/** System / Light / Dark, as the design system's segmented control. */
function Appearance() {
  const [theme, setTheme] = useTheme();
  const options: Array<[Theme, string]> = [['system', 'SYSTEM'], ['light', 'LIGHT'], ['dark', 'DARK']];
  return (
    <div style={{ padding: '0 14px' }}>
      <div className="seg" role="radiogroup" aria-label="Appearance" style={{ display: 'flex', borderRadius: 0 }}>
        {options.map(([value, label]) => (
          <label
            key={value}
            className="seg-opt"
            style={{ flex: 1, justifyContent: 'center', padding: '8px 4px', font: '800 10.5px var(--font-heading)', letterSpacing: '.06em' }}
          >
            <input type="radio" name="appearance" checked={theme === value} onChange={() => setTheme(value)} />
            {label}
          </label>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-neutral-600)' }}>
        System follows your phone&apos;s light or dark setting.
      </p>
    </div>
  );
}
