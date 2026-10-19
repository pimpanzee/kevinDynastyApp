'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import { posColor } from '@/components/pos';
import { DISPLAY, money } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import { isError, useCanMove, write } from '@/lib/relay';
import TradeSides from '@/components/trade/TradeSides';
import { tradeAssets, type TradeAsset } from '@/lib/trade';
import type { TeamsData, TeamView } from '@/lib/types';

type View = 'build' | 'review' | 'sent';
const EXPIRY = [{ label: '1 DAY', days: 1 }, { label: '3 DAYS', days: 3 }, { label: '1 WEEK', days: 7 }];
const back = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>;

/**
 * Propose a trade: pick what you give from your roster and what you get from
 * theirs, see both teams' salary and roster after, add a note and an
 * expiry, and send it on MFL as you.
 */
export default function TradeScreen({ data, teamId }: { data: TeamsData; teamId: string }) {
  const mine = useMyTeam(data.myFranchiseId);
  const canMove = useCanMove();
  const me = data.teams.find((t) => t.id === mine) ?? data.teams[0]!;
  const them = data.teams.find((t) => t.id === teamId)!;
  const [view, setView] = useState<View>('build');
  const [side, setSide] = useState<'give' | 'get'>('give');
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'bad' | 'warn'; text: string } | null>(null);

  const mineAssets = useMemo(() => tradeAssets(me), [me]);
  const theirAssets = useMemo(() => tradeAssets(them), [them]);
  const out = mineAssets.filter((a) => give.includes(a.key));
  const inn = theirAssets.filter((a) => get.includes(a.key));
  const both = out.length > 0 && inn.length > 0;
  const capOut = out.reduce((t, a) => t + a.capHit, 0);
  const capIn = inn.reduce((t, a) => t + a.capHit, 0);
  const mySalary = me.used + capIn - capOut;
  const theirSalary = them.used + capOut - capIn;
  const actOut = out.filter((a) => a.active).length;
  const actIn = inn.filter((a) => a.active).length;
  const myRoster = me.counts.roster - actOut + actIn;
  const theirRoster = them.counts.roster - actIn + actOut;
  const { rosterMin, rosterMax } = data.limits;

  if (me.id === them.id) {
    return (
      <PhoneFrame>
        <Top title="PROPOSE TRADE" left={<Link href="/team/" style={backLink}>{back}MY TEAM</Link>} />
        <p style={{ margin: 16, font: '500 14px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>This is your own team. Open another team&apos;s page to propose a trade.</p>
      </PhoneFrame>
    );
  }

  const toggle = (key: string) => {
    const [list, set] = side === 'give' ? [give, setGive] : [get, setGet];
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const send = async () => {
    if (busy || !both) return;
    setBusy(true);
    setNotice(null);
    const params: Record<string, string> = {
      OFFEREDTO: them.id,
      WILL_GIVE_UP: give.join(','),
      WILL_RECEIVE: get.join(','),
      EXPIRES: String(Math.floor(Date.now() / 1000) + days * 86400),
    };
    // MFL takes up to 250 characters, with no angle brackets or control characters.
    const comments = note.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 250);
    if (comments) params.COMMENTS = comments;
    const r = await write('tradeProposal', params);
    setBusy(false);
    if (!isError(r)) return setView('sent');
    if (r.unknown) return setNotice({ tone: 'warn', text: 'MFL didn’t answer in time, so the offer may or may not have gone out. Check Trade offers before sending it again.' });
    setNotice({ tone: 'bad', text: r.signedOut ? 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.' : r.error });
  };

  const teamBack = <Link href={`/league/team/${them.id}/`} aria-label={`Back to ${them.name}`} style={backLink}>{back}<span style={clip}>{them.name.toUpperCase()}</span></Link>;

  /* ── Sent ── */
  if (view === 'sent') {
    return (
      <PhoneFrame>
        <Top title="OFFER SENT" left={teamBack} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 16px 0', padding: '12px 14px', background: 'var(--bg-200)', boxShadow: 'inset 3px 0 0 var(--volt)', borderRadius: 2 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none', color: 'var(--volt)' }}><path d="M20 6 9 17l-5-5" /></svg>
            <span style={{ font: '600 13.5px/1.35 var(--font-body)' }}>Offer sent to {them.name}. It expires in {EXPIRY.find((e) => e.days === days)?.label.toLowerCase()}.</span>
          </div>
          <TradeSides out={out} inn={inn} style={{ margin: '16px 16px 0', border: '1px solid var(--line)', borderRadius: 4 }} />
          <div style={{ display: 'grid', gap: 8, margin: 16 }}>
            <Link href="/team/trades/" style={{ ...primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>SEE TRADE OFFERS</Link>
            <Link href={`/league/team/${them.id}/`} style={{ ...secondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>BACK TO {them.name.toUpperCase()}</Link>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  /* ── Review ── */
  if (view === 'review') {
    const after = [
      { name: 'You', salary: mySalary, was: me.used, roster: myRoster, wasRoster: me.counts.roster },
      { name: them.name, salary: theirSalary, was: them.used, roster: theirRoster, wasRoster: them.counts.roster },
    ];
    return (
      <PhoneFrame>
        <Top title="REVIEW TRADE" left={<button type="button" onClick={() => setView('build')} style={{ ...backLink, border: 0, background: 'none', cursor: 'pointer' }}>{back}EDIT</button>} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <TradeSides out={out} inn={inn} style={{ background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }} />
          <div style={{ margin: '12px 16px 0', border: '1px solid var(--line)', borderRadius: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 64px', alignItems: 'center', height: 28, padding: '0 12px', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
              <span>AFTER THE TRADE</span><span style={{ textAlign: 'right' }}>SALARY</span><span style={{ textAlign: 'right' }}>ROSTER</span>
            </div>
            {after.map((t, i) => {
              const d = t.salary - t.was;
              const dr = t.roster - t.wasRoster;
              const overCap = t.salary > data.cap;
              const badRoster = t.roster > rosterMax || t.roster < rosterMin;
              return (
                <div key={t.name} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 64px', alignItems: 'center', height: 46, padding: '0 12px', borderTop: i ? '1px solid var(--line)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ font: '600 13.5px/1.2 var(--font-body)', ...clip }}>{t.name}</span>
                  <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <b style={{ font: DISPLAY(15), color: overCap ? 'var(--live)' : 'var(--ink)' }}>{money(t.salary)}</b>
                    <span style={{ font: '500 10.5px/1 var(--font-body)', color: overCap ? 'var(--live)' : 'var(--ink-3)' }}>({signedMoney(d)}){overCap ? ' over cap' : ''}</span>
                  </span>
                  <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <b style={{ font: DISPLAY(15), color: badRoster ? 'var(--live)' : 'var(--ink)' }}>{t.roster}</b>
                    <span style={{ font: '500 10.5px/1 var(--font-body)', color: badRoster ? 'var(--live)' : 'var(--ink-3)' }}>({dr > 0 ? '+' : dr < 0 ? '−' : '+'}{Math.abs(dr)}){t.roster > rosterMax ? ` over ${rosterMax}` : t.roster < rosterMin ? ` under ${rosterMin}` : ''}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ margin: '6px 16px 0', font: '500 11.5px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>Salary counts against the {money(data.cap)} cap; taxi players don&apos;t count. Contract years move with the players. Roster limit is {rosterMin}–{rosterMax}, not counting IR and taxi; players on IR or taxi are assumed to keep their spot.</div>
          <div style={{ padding: '16px 16px 0' }}>
            <label htmlFor="trade-note" style={{ display: 'block', font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-2)' }}>NOTE TO {them.name.toUpperCase()} <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>· OPTIONAL</span></label>
            <textarea id="trade-note" rows={2} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shows with the offer on MFL" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 8, padding: '10px 12px', resize: 'none', font: '500 16px/1.35 var(--font-body)', color: 'var(--ink)', background: 'var(--bg-100)', border: '1px solid var(--line)', borderRadius: 2 }} />
          </div>
          <div style={{ padding: '14px 16px 16px' }}>
            <div id="exp-label" style={{ font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-2)' }}>OFFER EXPIRES</div>
            <div role="group" aria-labelledby="exp-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 8 }}>
              {EXPIRY.map((e) => {
                const on = e.days === days;
                return <button key={e.days} type="button" aria-pressed={on} onClick={() => setDays(e.days)} style={{ height: 40, borderRadius: 2, border: `1px solid ${on ? 'var(--volt)' : 'var(--line)'}`, background: on ? 'var(--volt)' : 'transparent', color: on ? 'var(--on-volt)' : 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' }}>{e.label}</button>;
              })}
            </div>
          </div>
        </div>
        <div style={{ flex: 'none', padding: '10px 16px 12px', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
          {notice && <div role="alert" style={{ marginBottom: 10, font: '500 12.5px/1.4 var(--font-body)', color: notice.tone === 'bad' ? 'var(--live)' : 'var(--fall)' }}>{notice.text}</div>}
          {canMove ? (
            <>
              <button type="button" onClick={send} disabled={busy} style={{ ...primary, width: '100%', opacity: busy ? 0.6 : 1 }}>{busy ? 'SENDING…' : `SEND TO ${them.name.toUpperCase()}`}</button>
              <div style={{ marginTop: 8, textAlign: 'center', font: '500 11.5px/1.35 var(--font-body)', color: 'var(--ink-3)' }}>Sent on MFL as you. They can accept, reject or counter.</div>
            </>
          ) : (
            <div style={{ font: '500 12.5px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>To send offers from the app, set up moves in <Link href="/settings/" style={{ color: 'var(--volt)' }}>Settings</Link>. The salary and roster check above works without it.</div>
          )}
        </div>
      </PhoneFrame>
    );
  }

  /* ── Build ── */
  const list = side === 'give' ? mineAssets : theirAssets;
  const ids = side === 'give' ? give : get;
  const names = (xs: TradeAsset[]) => xs.map((a) => (a.kind === 'pick' ? a.name.replace('Round ', 'R') : a.name)).join(', ');
  const firstPick = list.findIndex((a) => a.kind === 'pick');
  return (
    <PhoneFrame>
      <Top title="PROPOSE TRADE" left={teamBack} />
      <div role="tablist" aria-label="Trade sides" style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
        {(['give', 'get'] as const).map((k) => {
          const on = side === k;
          const n = (k === 'give' ? give : get).length;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setSide(k)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, border: 0, background: on ? 'var(--bg-200)' : 'transparent', boxShadow: on ? 'inset 0 -3px 0 var(--volt)' : 'none', color: on ? 'var(--ink)' : 'var(--ink-3)', font: DISPLAY(12), letterSpacing: '.12em', cursor: 'pointer' }}>
              {k === 'give' ? 'YOU GIVE' : 'YOU GET'}
              <span style={{ minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: n ? (k === 'give' ? 'var(--fall)' : 'var(--rise)') : 'var(--bg-300)', color: n ? 'var(--on-volt)' : 'var(--ink-3)', font: DISPLAY(11, 800) }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '1fr 76px', alignItems: 'center', height: 28, padding: '0 16px', background: 'var(--bg-000)', borderBottom: '1px solid var(--edge)', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
        <span>{side === 'give' ? 'YOUR ROSTER' : `${them.name.toUpperCase()} ROSTER`}</span><span style={{ textAlign: 'right' }}>SALARY</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {list.map((a, i) => {
          const on = ids.includes(a.key);
          return (
            <div key={a.key}>
              {i === firstPick && <div style={{ padding: '12px 16px 6px', font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>DRAFT PICKS</div>}
              <button type="button" aria-pressed={on} onClick={() => toggle(a.key)} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 76px', alignItems: 'center', width: '100%', height: 52, padding: '0 16px', boxSizing: 'border-box', border: 0, borderBottom: '1px solid var(--line)', background: on ? 'var(--bg-200)' : 'transparent', boxShadow: on ? `inset 3px 0 0 ${side === 'give' ? 'var(--fall)' : 'var(--rise)'}` : 'none', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                <span aria-hidden style={{ width: 18, height: 18, boxSizing: 'border-box', borderRadius: 2, border: on ? 0 : '1.5px solid var(--edge)', background: on ? 'var(--volt)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-volt)' }}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ font: '600 14px/1.2 var(--font-body)', ...clip }}>{a.name}</span>
                    <InjuryTag tag={a.injury} />
                    {a.slot && a.slot !== 'ACTIVE' && <span style={{ flex: 'none', font: DISPLAY(9.5), letterSpacing: '.06em', color: 'var(--ink-2)', border: '1px solid var(--ink-2)', borderRadius: 2, padding: '2px 3px' }}>{a.slot}</span>}
                  </span>
                  <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', ...clip }}><b style={{ fontWeight: 700, color: posColor(a.pos) }}>{a.pos}</b> · {a.meta}</span>
                </span>
                <span style={{ textAlign: 'right', font: '500 13px/1 var(--font-body)', color: 'var(--ink-2)' }}>{a.kind === 'pick' ? '—' : money(a.salary)}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 'none', padding: '10px 16px 12px', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)', display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '4px 8px', font: '500 12px/1.3 var(--font-body)' }}>
          <span style={{ font: '700 10px/1.6 var(--font-display)', letterSpacing: '.1em', color: 'var(--fall)' }}>YOU GIVE</span>
          <span style={{ ...clip, color: out.length ? 'var(--ink)' : 'var(--ink-3)' }}>{out.length ? names(out) : 'Nothing yet'}</span>
          <span style={{ font: '700 10px/1.6 var(--font-display)', letterSpacing: '.1em', color: 'var(--rise)' }}>YOU GET</span>
          <span style={{ ...clip, color: inn.length ? 'var(--ink)' : 'var(--ink-3)' }}>{inn.length ? names(inn) : 'Nothing yet'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: '600 12px/1 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          <span>SALARY <b style={{ fontWeight: 700, color: mySalary > data.cap ? 'var(--live)' : 'var(--ink)' }}>{money(mySalary)}</b> ({signedMoney(mySalary - me.used)})</span>
          <span>ROSTER <b style={{ fontWeight: 700, color: myRoster > rosterMax || myRoster < rosterMin ? 'var(--live)' : 'var(--ink)' }}>{myRoster}</b> ({myRoster - me.counts.roster < 0 ? '−' : '+'}{Math.abs(myRoster - me.counts.roster)})</span>
        </div>
        <button type="button" disabled={!both} onClick={() => both && setView('review')} style={{ ...primary, background: both ? 'var(--volt)' : 'var(--bg-300)', color: both ? 'var(--on-volt)' : 'var(--ink-3)', cursor: both ? 'pointer' : 'default' }}>{both ? 'REVIEW TRADE' : 'PICK FROM BOTH SIDES'}</button>
      </div>
    </PhoneFrame>
  );
}

function Top({ title, left }: { title: string; left: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      <span style={{ marginLeft: 'auto', flex: 'none', font: DISPLAY(18, 800), letterSpacing: '.06em' }}>{title}</span>
    </div>
  );
}

/** "+$281.59", "−$12.00" or "+$0.00". */
function signedMoney(d: number) {
  return `${d < -0.005 ? '−' : '+'}${money(Math.abs(d))}`;
}

const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const backLink: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', marginLeft: -8, color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em', minWidth: 0 };
const primary: CSSProperties = { height: 48, border: 0, borderRadius: 2, background: 'var(--volt)', color: 'var(--on-volt)', font: DISPLAY(15, 800), letterSpacing: '.1em', cursor: 'pointer' };
const secondary: CSSProperties = { height: 44, borderRadius: 2, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.1em' };
