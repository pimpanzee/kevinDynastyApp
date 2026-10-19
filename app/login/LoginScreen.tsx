'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import TeamAvatar from '@/components/TeamAvatar';
import { DISPLAY } from '@/components/team/format';
import { saveTeam } from '@/lib/myTeam';
import { canSignIn, isError, login, useAccount } from '@/lib/relay';

interface Franchise {
  id: string;
  name: string;
  icon: string | null;
}

/** Where to go after signing in: ?next=/path/ on this site, else My Team. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next') ?? '';
  return /^\/[a-z0-9/_-]*$/i.test(next) && !next.startsWith('//') ? next : '/team/';
}

const label = { display: 'block', margin: '14px 0 6px', font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-3)' } as const;
const input = {
  width: '100%', height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 2, border: '1px solid var(--edge)',
  background: 'var(--bg-100)', color: 'var(--ink)', font: '500 16px/1 var(--font-body)',
} as const;
const button = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 44, borderRadius: 2, border: '1px solid var(--volt)',
  background: 'var(--volt)', color: 'var(--on-volt)', font: DISPLAY(14), letterSpacing: '.12em', cursor: 'pointer',
} as const;
const note = { margin: '12px 0 0', font: '500 12px/1.5 var(--font-body)', color: 'var(--ink-3)' } as const;

/**
 * The login screen: an owner's MFL username and password, sent once to the
 * relay, which signs in to MFL, keeps only MFL's login (encrypted) and gives
 * this device a session. Your team switches to the one you signed in as.
 */
export default function LoginScreen({ franchises }: { franchises: Franchise[] }) {
  const router = useRouter();
  const account = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [next, setNext] = useState('/team/');
  useEffect(() => setNext(nextPath()), []);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/settings/'));
  const team = account ? franchises.find((f) => f.id === account.franchiseId) : undefined;

  const submit = async () => {
    if (!username.trim() || !password) return setError('Enter your MFL username and password.');
    setBusy(true);
    setError('');
    const r = await login(username.trim(), password);
    setPassword('');
    setBusy(false);
    if (isError(r)) return setError(r.error);
    const f = franchises.find((x) => x.id === r.franchiseId);
    saveTeam(r.franchiseId, { name: f?.name ?? r.franchiseName ?? `Team ${r.franchiseId}`, icon: f?.icon ?? null });
    setDone(true);
    router.replace(next);
  };

  return (
    <PhoneFrame>
      <HeaderBar back={back} title="SIGN IN" noSettings />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 24px' }}>
        <h1 style={{ margin: 0, font: DISPLAY(28, 800), lineHeight: 1, letterSpacing: '.03em', textTransform: 'uppercase' }}>Sign in with MFL</h1>
        <p style={{ margin: '10px 0 0', font: '500 14px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>
          Use your MyFantasyLeague account to set your lineup, place waiver claims and trade from the app. Moves only ever go to your own team.
        </p>

        {!canSignIn ? (
          <p style={{ ...note, fontSize: 13 }}>Sign-in isn’t available on this copy of the app.</p>
        ) : account && !done ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-100)' }}>
              <TeamAvatar name={team?.name ?? account.franchiseName ?? '?'} icon={team?.icon ?? null} size={36} mine />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: DISPLAY(18), letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team?.name ?? account.franchiseName}</span>
                <span style={{ display: 'block', marginTop: 3, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>Signed in on this device</span>
              </span>
            </div>
            <Link href={next} style={{ ...button, marginTop: 14 }}>CONTINUE</Link>
            <p style={note}>To switch accounts, sign out in Settings first.</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }} style={{ marginTop: 8 }}>
            <label style={label} htmlFor="mfl-user">MFL USERNAME</label>
            <input id="mfl-user" style={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy} />
            <label style={label} htmlFor="mfl-pass">PASSWORD</label>
            <input id="mfl-pass" style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} />
            {error && (
              <p role="alert" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 2, background: 'var(--color-bad-tint)', font: '600 13px/1.4 var(--font-body)', color: 'var(--ink)' }}>{error}</p>
            )}
            <button type="submit" disabled={busy || done} style={{ ...button, marginTop: 18, opacity: busy ? 0.7 : 1 }}>
              {done ? 'SIGNED IN' : busy ? 'SIGNING IN…' : 'SIGN IN'}
            </button>
            <p style={note}>
              Your password goes to MFL once to sign you in and is never saved. The app keeps MFL’s login for your team, encrypted, until you sign out in Settings.
            </p>
            <p style={note}>
              Forgot it? <a href="https://www.myfantasyleague.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--volt)', fontWeight: 600 }}>Reset it on MFL</a>.
            </p>
          </form>
        )}
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}
