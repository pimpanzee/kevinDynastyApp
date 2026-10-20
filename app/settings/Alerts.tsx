'use client';

import { useEffect, useState } from 'react';
import { DISPLAY } from '@/components/team/format';
import { ALERTS, current, disable, enable, readPrefs, test, unsupported, update, type AlertKey, type Prefs } from '@/lib/push';
import { isError } from '@/lib/relay';

/**
 * Push alerts for this device: one switch to turn them on (asks the phone's
 * permission), then a toggle per alert and a test push.
 */
export default function Alerts() {
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    setWhy(unsupported());
    setPrefs(readPrefs());
    current().then(setSub).catch(() => setSub(null));
  }, []);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    try {
      setStatus((await fn()) ?? '');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Something went wrong');
    }
    setBusy(false);
  };

  const turnOn = () => run(async () => {
    const r = await enable(prefs ?? readPrefs());
    if (isError(r)) return r.error;
    setSub(await current());
    return 'Alerts are on for this device.';
  });
  const turnOff = () => run(async () => {
    if (sub) await disable(sub);
    setSub(null);
    return 'Alerts are off for this device.';
  });
  const toggle = (k: AlertKey) => run(async () => {
    if (!prefs || !sub) return;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    const r = await update(sub, next);
    if (isError(r)) {
      setPrefs(prefs);
      return r.error;
    }
  });
  const sendTest = () => run(async () => {
    if (!sub) return;
    const r = await test(sub);
    return isError(r) ? r.error : 'Test sent. It should arrive in a few seconds.';
  });

  const small = { height: 36, padding: '0 12px', borderRadius: 2, border: '1px solid var(--edge)', background: 'transparent', color: 'var(--ink)', font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' } as const;
  const on = sub !== null;
  return (
    <div style={{ padding: '12px 16px 0' }}>
      {why ? (
        <p style={{ margin: 0, font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>{why}</p>
      ) : on ? (
        <>
          <div role="group" aria-label="Which alerts" style={{ border: '1px solid var(--line)', borderRadius: 2 }}>
            {ALERTS.map((a) => {
              const checked = prefs?.[a.key] ?? true;
              return (
                <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '6px 12px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', font: '600 14px/1.25 var(--font-body)' }}>{a.label}</span>
                    <span style={{ display: 'block', marginTop: 2, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>{a.sub}</span>
                  </span>
                  <input type="checkbox" role="switch" checked={checked} disabled={busy} onChange={() => toggle(a.key)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                  <span aria-hidden style={{ flex: 'none', position: 'relative', width: 40, height: 22, borderRadius: 11, background: checked ? 'var(--volt)' : 'var(--bg-300)', transition: 'background .15s' }}>
                    <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: checked ? 'var(--on-volt)' : 'var(--ink-2)', transition: 'left .15s' }} />
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={sendTest} style={small}>SEND A TEST</button>
            <button type="button" disabled={busy} onClick={turnOff} style={small}>TURN OFF</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={turnOn} style={{ ...small, width: '100%', height: 44, background: 'var(--volt)', borderColor: 'var(--volt)', color: 'var(--on-volt)' }}>
          {busy ? 'TURNING ON…' : 'TURN ON ALERTS'}
        </button>
      )}
      {!why && (
        <p style={{ margin: '8px 0 0', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
          {status || (on ? 'Alerts for your team come to this device only.' : 'Lineup checks before kickoff, injuries and inactives, waiver results, stat corrections and a Tuesday recap, pushed to this device.')}
        </p>
      )}
    </div>
  );
}
