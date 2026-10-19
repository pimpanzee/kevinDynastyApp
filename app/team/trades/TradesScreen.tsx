'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import TeamLink from '@/components/league/TeamLink';
import SectionHead from '@/components/team/SectionHead';
import { DISPLAY } from '@/components/team/format';
import TradeSides from '@/components/trade/TradeSides';
import { useMyTeam } from '@/lib/myTeam';
import { getTrades, isError, useCanMove, write, type PendingTrade, SIGNED_OUT } from '@/lib/relay';
import { assetIndex, pickName, type TradeAsset } from '@/lib/trade';
import type { TeamsData } from '@/lib/types';

const back = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>;

/**
 * Trade offers waiting on an answer. Ones you sent can be withdrawn; ones
 * sent to you can be accepted, rejected, or countered with a new offer.
 * Accepting asks for a second tap, since MFL processes it straight away.
 */
export default function TradesScreen({ data }: { data: TeamsData }) {
  const mine = useMyTeam(data.myFranchiseId);
  const canMove = useCanMove();
  const [trades, setTrades] = useState<PendingTrade[] | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'accept' | 'reject' | 'revoke' } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const index = useMemo(() => assetIndex(data), [data]);
  const name = (id: string) => data.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;

  const load = useCallback(async () => {
    const r = await getTrades();
    if (isError(r)) {
      setError(r.signedOut ? SIGNED_OUT : r.error);
      return;
    }
    setError('');
    setTrades(r.trades);
  }, []);

  useEffect(() => {
    if (canMove) void load();
  }, [canMove, load]);

  const asset = (key: string): TradeAsset => index.get(key) ?? {
    key, kind: key.startsWith('FP_') || key.startsWith('DP_') ? 'pick' : 'player',
    name: pickName(key) ?? `Player ${key}`, pos: key.startsWith('FP_') || key.startsWith('DP_') ? 'PICK' : '', meta: '', salary: 0, capHit: 0, active: false,
  };

  const respond = async (t: PendingTrade, action: 'accept' | 'reject' | 'revoke') => {
    setBusy(t.id);
    setNotice(null);
    const r = await write('tradeResponse', { TRADE_ID: t.id, RESPONSE: action });
    setBusy(null);
    setConfirm(null);
    if (isError(r)) {
      setNotice({ tone: 'bad', text: r.signedOut ? SIGNED_OUT : r.unknown ? 'MFL didn’t answer in time, so that may or may not have gone through. The list below is re-read from MFL.' : r.error });
    } else {
      const other = name(t.from === mine ? t.to : t.from);
      setNotice({ tone: 'good', text: action === 'accept' ? `Trade with ${other} accepted.` : action === 'reject' ? `Offer from ${other} rejected.` : `Offer to ${other} withdrawn.` });
    }
    void load();
  };

  const sent = trades?.filter((t) => t.from === mine) ?? [];
  const received = trades?.filter((t) => t.to === mine) ?? [];

  const card = (t: PendingTrade) => {
    const isSent = t.from === mine;
    const other = isSent ? t.to : t.from;
    // Always from your side: what you give, what you get.
    const out = (isSent ? t.give : t.get).map(asset);
    const inn = (isSent ? t.get : t.give).map(asset);
    const asking = confirm?.id === t.id ? confirm.action : null;
    return (
      <div key={t.id} style={{ margin: '0 16px 12px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ minWidth: 0, font: DISPLAY(14), letterSpacing: '.04em', ...clip }}>
            {isSent ? 'TO ' : 'FROM '}<TeamLink id={other} mine={mine} underline>{name(other).toUpperCase()}</TeamLink>
          </span>
          <span style={{ marginLeft: 'auto', flex: 'none', font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)' }}>{expires(t.expires)}</span>
        </div>
        <TradeSides out={out} inn={inn} />
        {t.comments && <div style={{ margin: '0 12px 10px 16px', font: '500 12.5px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>&ldquo;{t.comments}&rdquo;</div>}
        <div style={{ display: 'grid', gridTemplateColumns: asking || isSent ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 8, padding: '10px 12px 12px', borderTop: '1px solid var(--line)' }}>
          {asking ? (
            <>
              <button type="button" disabled={busy === t.id} onClick={() => respond(t, asking)} style={{ ...btn, ...(asking === 'accept' ? solid : danger) }}>{busy === t.id ? 'SENDING…' : asking === 'accept' ? 'CONFIRM ACCEPT' : asking === 'reject' ? 'CONFIRM REJECT' : 'CONFIRM WITHDRAW'}</button>
              <button type="button" disabled={busy === t.id} onClick={() => setConfirm(null)} style={btn}>CANCEL</button>
            </>
          ) : isSent ? (
            <>
              <button type="button" onClick={() => setConfirm({ id: t.id, action: 'revoke' })} style={{ ...btn, ...danger }}>WITHDRAW</button>
              <Link href={`/league/team/${other}/trade/`} style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>NEW OFFER</Link>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirm({ id: t.id, action: 'accept' })} style={{ ...btn, ...solid }}>ACCEPT</button>
              <button type="button" onClick={() => setConfirm({ id: t.id, action: 'reject' })} style={{ ...btn, ...danger }}>REJECT</button>
              <Link href={`/league/team/${other}/trade/`} style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>COUNTER</Link>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <PhoneFrame>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
        <Link href="/team/" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', marginLeft: -8, color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em' }}>{back}MY TEAM</Link>
        <span style={{ marginLeft: 'auto', font: DISPLAY(18, 800), letterSpacing: '.06em' }}>TRADE OFFERS</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {!canMove ? (
          <p style={{ margin: 16, font: '500 14px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>Trade offers are read from MFL through your login. Set up moves in <Link href="/settings/" style={{ color: 'var(--volt)' }}>Settings</Link> to see them here.</p>
        ) : error ? (
          <div role="alert" style={{ margin: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--live)' }}>{error} <button type="button" onClick={() => void load()} style={{ ...btn, height: 32, marginTop: 8, display: 'block' }}>TRY AGAIN</button></div>
        ) : trades === undefined ? (
          <p style={{ margin: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>Reading your offers from MFL…</p>
        ) : trades === null ? (
          <p style={{ margin: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>MFL&apos;s list of offers came back in a shape the app doesn&apos;t understand, so they can&apos;t be shown here. They&apos;re still on MFL&apos;s Trades page.</p>
        ) : (
          <>
            {notice && <div role="status" style={{ margin: '16px 16px 0', padding: '10px 12px', borderRadius: 2, background: 'var(--bg-200)', boxShadow: `inset 3px 0 0 ${notice.tone === 'good' ? 'var(--volt)' : 'var(--live)'}`, font: '600 13px/1.35 var(--font-body)' }}>{notice.text}</div>}
            <SectionHead label="SENT TO YOU" right={`${received.length}`} />
            <div style={{ height: 12 }} />
            {received.length ? received.map(card) : <Empty text="No offers waiting on you." />}
            <SectionHead gap label="YOU SENT" right={`${sent.length}`} />
            <div style={{ height: 12 }} />
            {sent.length ? sent.map(card) : <Empty text="Nothing waiting on another team. Propose a trade from any team's page." />}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ margin: '0 16px 12px', padding: '14px 12px', border: '1px dashed var(--line)', borderRadius: 4, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>{text}</div>;
}

function expires(ms: number | null): string {
  if (!ms) return '';
  const left = ms - Date.now();
  if (left <= 0) return 'Expired';
  const h = Math.round(left / 3600000);
  return h < 24 ? `Expires in ${Math.max(1, h)}h` : `Expires in ${Math.round(h / 24)}d`;
}

const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const btn: CSSProperties = { height: 40, borderRadius: 2, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' };
const solid: CSSProperties = { border: 0, background: 'var(--volt)', color: 'var(--on-volt)' };
const danger: CSSProperties = { border: '1px solid var(--fall)', color: 'var(--fall)' };
