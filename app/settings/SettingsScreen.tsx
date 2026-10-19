'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import TeamAvatar from '@/components/TeamAvatar';
import SectionHead from '@/components/team/SectionHead';
import { DISPLAY } from '@/components/team/format';
import { saveTeam, useMyTeam } from '@/lib/myTeam';
import { current } from '@/lib/push';
import { canSignIn, getMe, isError, logout, useAccount, useCanMove } from '@/lib/relay';
import { useTheme, type Theme } from '@/lib/theme';
import Alerts from './Alerts';

export interface FranchiseOption {
  id: string;
  name: string;
  icon: string | null;
  /** "7-3 · Division 1!" */
  sub: string;
}

/** Section header for the settings guides (install, widget). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <SectionHead label={children} />;
}

const chevron = (
  <span style={{ flex: 'none', display: 'flex', color: 'var(--ink-3)' }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
  </span>
);

/** "2 min ago" from the build id (the build's time in base 36, see next.config.ts). */
function updatedAgo(): string {
  const t = parseInt(process.env.NEXT_PUBLIC_BUILD_ID ?? '', 36);
  if (!Number.isFinite(t) || t < 1e12) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * Settings, opened from the team chip in every header: your team (picking
 * one switches the whole app), appearance, the install and widget guides,
 * and where the data comes from. The back arrow returns to where you were.
 */
export default function SettingsScreen({ franchises, defaultTeam }: { franchises: FranchiseOption[]; defaultTeam: string }) {
  const router = useRouter();
  const team = useMyTeam(defaultTeam);
  const [open, setOpen] = useState(false);
  const [ago, setAgo] = useState('');
  const canMove = useCanMove();
  useEffect(() => setAgo(updatedAgo()), []);
  const current = franchises.find((f) => f.id === team) ?? franchises[0];

  const back = () => (window.history.length > 1 ? router.back() : router.push('/matchups/'));
  const pick = (id: string) => {
    const f = franchises.find((x) => x.id === id);
    saveTeam(id, f ? { name: f.name, icon: f.icon } : undefined);
    setOpen(false);
  };

  return (
    <PhoneFrame>
      <HeaderBar back={back} title="SETTINGS" noSettings />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        <SectionHead label="YOUR TEAM" />
        {current && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', textAlign: 'left', background: 'var(--bg-100)', border: 0, borderBottom: '1px solid var(--line)', color: 'var(--ink)', cursor: 'pointer' }}>
            <TeamAvatar name={current.name} icon={current.icon} size={36} mine />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', font: DISPLAY(18), lineHeight: 1.1, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.name}</span>
              <span style={{ display: 'block', marginTop: 3, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>{current.sub}</span>
            </span>
            <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, font: DISPLAY(12), letterSpacing: '.1em', color: 'var(--ink-2)' }}>
              CHANGE
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </button>
        )}
        {open && (
          <div role="listbox" aria-label="Pick your team" style={{ borderBottom: '1px solid var(--line)' }}>
            {franchises.map((f) => {
              const sel = f.id === team;
              return (
                <button key={f.id} type="button" role="option" aria-selected={sel} onClick={() => pick(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 44, padding: '0 16px', textAlign: 'left', border: 0, borderTop: '1px solid var(--line)', background: sel ? 'var(--bg-200)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 var(--volt)' : undefined, color: 'var(--ink)', cursor: 'pointer' }}>
                  <TeamAvatar name={f.name} icon={f.icon} size={24} />
                  <span style={{ flex: 1, font: `${sel ? 700 : 600} 13.5px/1 var(--font-body)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span style={{ font: DISPLAY(14, 800), color: 'var(--volt)' }}>{sel ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        )}
        <p style={{ margin: '8px 16px 0', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
          Your team leads Matchups, fills My Team, and is the yellow-green everywhere. Saved on this device.
        </p>

        <div style={{ marginTop: 12 }}><SectionHead label="APPEARANCE" /></div>
        <Appearance />

        <div style={{ marginTop: 12 }}><SectionHead label="MFL ACCOUNT" /></div>
        <Account franchises={franchises} />

        {canMove && (
          <>
            <div style={{ marginTop: 12 }}><SectionHead label="ALERTS" /></div>
            <Alerts />
          </>
        )}

        <div style={{ marginTop: 12 }}><SectionHead label="GET THE APP" /></div>
        <Row href="/settings/install/" title="Install the app" sub="Add The Liam to your Home Screen"
          icon={<><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M12 7v7M9 11l3 3 3-3" /></>} />
        <Row href="/widget/" title="Home Screen widget" sub="Live score and key plays on your Home or Lock Screen"
          icon={<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="18" height="8" rx="1.5" /></>} />

        <div style={{ padding: '16px 16px 0', font: '500 11.5px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>
          League, rosters and contracts from MyFantasyLeague · stats, scores and news from Sleeper.
          {ago && <><br />Updated {ago}.</>}
        </div>
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}

function Row({ href, title, sub, icon }: { href: string; title: string; sub: string; icon: ReactNode }) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '8px 16px', boxSizing: 'border-box', borderBottom: '1px solid var(--line)' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none', color: 'var(--ink-2)' }}>{icon}</svg>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: '600 14px/1.25 var(--font-body)' }}>{title}</span>
        <span style={{ display: 'block', marginTop: 2, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>{sub}</span>
      </span>
      {chevron}
    </Link>
  );
}

/**
 * The MFL account signed in on this device. Signed out: a way to the login
 * screen. Signed in: the team, a login check, and signing out (this device,
 * or every device, which also makes the relay forget the MFL login).
 */
function Account({ franchises }: { franchises: FranchiseOption[] }) {
  const account = useAccount();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const small = { height: 36, padding: '0 12px', borderRadius: 2, border: '1px solid var(--edge)', background: 'transparent', color: 'var(--ink)', font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' } as const;
  const text = { margin: '8px 0 0', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' } as const;

  if (account === undefined) return null;
  if (!canSignIn) return <p style={{ ...text, padding: '0 16px' }}>Moves aren’t available on this copy of the app.</p>;
  if (!account) {
    return (
      <div style={{ padding: '12px 16px 0' }}>
        <Link href="/login/" style={{ ...small, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, background: 'var(--volt)', borderColor: 'var(--volt)', color: 'var(--on-volt)' }}>SIGN IN WITH MFL</Link>
        <p style={text}>{status || 'Sign in with your MyFantasyLeague account to set your lineup, place claims, trade and get alerts for your team.'}</p>
      </div>
    );
  }

  const team = franchises.find((f) => f.id === account.franchiseId);
  const check = async () => {
    setStatus('Checking…');
    const r = await getMe();
    if (isError(r)) return setStatus(r.error);
    if (r.signedIn) return setStatus(`MFL has you signed in as ${r.franchiseName ?? team?.name ?? `team ${r.franchiseId}`} (${r.season}).`);
    if (r.signedIn === null) return setStatus('MFL didn’t answer; try again shortly.');
    return setStatus('MFL no longer accepts your login. Sign out, then sign in again.');
  };
  const signOut = async (everywhere: boolean) => {
    if (everywhere && !window.confirm('Sign out on every device and have the app forget your MFL login?')) return;
    setBusy(true);
    const sub = await current().catch(() => null);
    const r = await logout({ everywhere, endpoint: sub?.endpoint });
    if (isError(r)) {
      setBusy(false);
      return setStatus(r.error);
    }
    // Alerts belong to the account, so they stop on this device too.
    await sub?.unsubscribe().catch(() => undefined);
    setBusy(false);
    setStatus(everywhere ? 'Signed out everywhere. The app no longer has your MFL login.' : 'Signed out on this device.');
  };

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 2 }}>
        <TeamAvatar name={team?.name ?? account.franchiseName ?? '?'} icon={team?.icon ?? null} size={32} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', font: '600 14px/1.25 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team?.name ?? account.franchiseName}</span>
          <span style={{ display: 'block', marginTop: 2, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>Signed in with MFL on this device</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="button" disabled={busy} onClick={check} style={small}>CHECK LOGIN</button>
        <button type="button" disabled={busy} onClick={() => signOut(false)} style={small}>SIGN OUT</button>
      </div>
      <p style={text}>{status || 'Moves you make here go to MFL as this team.'}</p>
      <button type="button" disabled={busy} onClick={() => signOut(true)} style={{ marginTop: 6, padding: 0, border: 0, background: 'none', color: 'var(--ink-3)', font: '600 12px/1.45 var(--font-body)', textDecoration: 'underline', cursor: 'pointer' }}>
        Sign out everywhere and forget my MFL login
      </button>
    </div>
  );
}

/** SYSTEM · LIGHT · DARK, the selected one in volt. */
function Appearance() {
  const [theme, setTheme] = useTheme();
  const options: Array<[Theme, string]> = [['system', 'SYSTEM'], ['light', 'LIGHT'], ['dark', 'DARK']];
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div role="radiogroup" aria-label="Appearance" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {options.map(([value, label]) => {
          const on = theme === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setTheme(value)} style={{ height: 36, borderRadius: 2, border: `1px solid ${on ? 'var(--volt)' : 'var(--line)'}`, background: on ? 'var(--volt)' : 'transparent', color: on ? 'var(--on-volt)' : 'var(--ink-3)', font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' }}>{label}</button>
          );
        })}
      </div>
      <p style={{ margin: '8px 0 0', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>System follows your phone&apos;s light or dark setting.</p>
    </div>
  );
}
