'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import InjuryTag from '@/components/InjuryTag';
import { posColor } from '@/components/pos';
import { DISPLAY, money } from '@/components/team/format';
import { deadCap } from '@/lib/cap';
import { getMine, getWaivers, isError, write, type Mine, type PendingBid, type RelayError, type Waivers } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';

/**
 * Blind bid waivers on the Players screen. Every pickup is a claim: BID on a
 * free agent opens a sheet with the amount, an optional drop and what the
 * claim does to your cap; MY CLAIMS lists your pending bids in priority
 * order. Your roster and claims are read live from MFL through the write
 * relay and re-read after every write. Plain drops live on Manage roster.
 */

/** League blind bid rules (MFL league export: bbidMinimum 5, bbidIncrement 1). */
const MIN_BID = 5;
const STEP = 1;

export interface WaiverRules {
  cap: number;
  limits: TeamsData['limits'];
  /** Each team's cap adjustments, by franchise id. */
  adj: Record<string, number>;
}

export interface PlayerInfo {
  name: string;
  pos: string;
  team: string;
  injury?: string | null;
}

type Notice = { tone: 'ok' | 'bad'; text: string };

const EXPIRED = 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.';

export function useWaivers({ cap, limits, adj }: WaiverRules, enabled: boolean, name: (id: string) => string) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [waivers, setWaivers] = useState<Waivers | null>(null);
  const [loadError, setLoadError] = useState<RelayError | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, w] = await Promise.all([getMine(), getWaivers()]);
    if (isError(m)) return setLoadError(m);
    if (isError(w)) return setLoadError(w);
    setLoadError(null);
    setMine(m);
    setWaivers(w);
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  // Cap room from the live roster: every salary but the taxi squad's, plus the team's adjustments.
  const counting = mine?.roster.filter((p) => p.status !== 'TAXI_SQUAD') ?? [];
  const used = counting.reduce((t, p) => t + p.salary, 0) + (mine ? adj[mine.franchiseId] ?? 0 : 0);
  const room = Math.round((cap - used) * 100) / 100;
  const active = mine?.roster.filter((p) => p.status === 'ROSTER').length ?? 0;
  const pending = waivers?.pending ?? null;

  const report = async (r: { ok: true } | RelayError, success: string) => {
    setNotice(isError(r)
      ? { tone: 'bad', text: r.signedOut ? EXPIRED : r.unknown ? `${r.error} Your claims and roster were re-read, so check them before trying again.` : r.error }
      : { tone: 'ok', text: success });
    await load();
    return !isError(r);
  };

  const placeBid = async (player: string, bid: number, drop: string | null) => {
    setBusy(true);
    // Without REPLACE, MFL adds this claim after your existing ones.
    const r = await write('blindBidWaiverRequest', { PICKS: `${player}_${bid}_${drop ?? '0000'}` });
    const ok = await report(r, `Claim placed: ${name(player)} for $${bid}${drop ? `, dropping ${name(drop)}` : ''}.`);
    setBusy(false);
    return ok;
  };

  /** Rewrites the whole claim list (REPLACE). Only offered when MFL's list was read. */
  const replaceClaims = async (next: PendingBid[], success: string) => {
    setBusy(true);
    const picks = next.map((b) => `${b.player}_${b.bid}_${b.drop ?? '0000'}`).join(',');
    const ok = await report(await write('blindBidWaiverRequest', { PICKS: picks, REPLACE: '1' }), success);
    setBusy(false);
    return ok;
  };

  return {
    mine, loadError, notice, setNotice, busy, room, active, pending,
    rosterMax: limits.rosterMax,
    /** Who MFL says is a free agent right now; null until read. */
    freeAgents: waivers ? new Set(waivers.freeAgents) : null,
    placeBid, replaceClaims,
  };
}

export type WaiversState = ReturnType<typeof useWaivers>;

/** MY CLAIMS: cap room, roster count and your pending bids, highest priority first. */
export function ClaimsPanel({ w, info, onEdit }: { w: WaiversState; info: (id: string) => PlayerInfo; onEdit: (index: number) => void }) {
  const { mine, pending, loadError, busy, room, active, rosterMax } = w;
  const total = (pending ?? []).reduce((t, b) => t + b.bid, 0);
  return (
    <>
      {mine && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', height: 36, borderBottom: '1px solid var(--line)' }}>
          <Stat value={money(room)} label="ROOM" bad={room < 0} />
          <Stat value={`${active}/${rosterMax}`} label="ROSTER" bad={active > rosterMax} />
          <Stat value={`$${total}`} label="BIDS" />
        </div>
      )}
      <WaiverNotice w={w} />
      {loadError && !mine && <RelayProblem error={loadError} />}
      {!mine && !loadError && <Muted>Reading your claims from MFL…</Muted>}
      {mine && pending === null && <Muted>MFL returned your claims in a form this app can&apos;t read yet, so it won&apos;t edit them here. Check them on MFL&apos;s site.</Muted>}
      {mine && pending?.length === 0 && <Muted>No pending claims. Tap BID on a free agent to add one.</Muted>}
      {mine && pending && pending.length > 0 && (
        <>
          <p style={{ margin: '12px 16px 4px', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
            In priority order. Bids stay private until MFL runs waivers, and you can change them until then.
          </p>
          {pending.map((b, i) => {
            const p = info(b.player);
            return (
              <div key={`${b.player}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ flex: 'none', width: 16, font: DISPLAY(13), color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    <InjuryTag tag={p.injury ?? undefined} />
                  </span>
                  <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos || '—'}</b> · {p.team || '—'}{b.drop ? ` · drop ${info(b.drop).name}` : ''}
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => onEdit(i)} aria-label={`Change your bid on ${p.name}`} style={{ flex: 'none', height: 44, padding: '0 4px', border: 0, background: 'none', color: 'var(--ink)', font: DISPLAY(19), fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>${b.bid}</button>
                <button type="button" disabled={busy} onClick={() => w.replaceClaims(pending.filter((_, j) => j !== i), `Claim on ${p.name} removed.`)} style={smallBtn(false)}>REMOVE</button>
              </div>
            );
          })}
          <div style={{ padding: '12px 16px' }}>
            <button type="button" disabled={busy} onClick={() => w.replaceClaims([], 'All claims cleared.')} style={{ ...smallBtn(false), width: '100%', height: 44 }}>CLEAR ALL CLAIMS</button>
          </div>
        </>
      )}
    </>
  );
}

export function WaiverNotice({ w }: { w: WaiversState }) {
  if (!w.notice) return null;
  const ok = w.notice.tone === 'ok';
  return (
    <div role="status" style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 2, font: '500 13px/1.4 var(--font-body)', background: ok ? 'var(--rise-tint)' : 'var(--live-tint)', boxShadow: `inset 3px 0 0 ${ok ? 'var(--rise)' : 'var(--live)'}` }}>
      {w.notice.text}
    </div>
  );
}

function RelayProblem({ error }: { error: RelayError }) {
  return (
    <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-2)' }}>
      <p style={{ margin: 0 }}>{error.signedOut ? EXPIRED : error.error}</p>
      <p style={{ margin: '12px 0 0' }}><Link href="/settings/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Settings → Make moves</Link></p>
    </div>
  );
}

/** A new claim on `id`, or (with `edit`) a change to that pending claim, sent as the whole list with REPLACE. */
export function BidSheet({ id, edit, w, info, onClose }: { id: string; edit?: number; w: WaiversState; info: (id: string) => PlayerInfo; onClose: () => void }) {
  const player = info(id);
  const roster = w.mine?.roster ?? [];
  const old = edit !== undefined ? w.pending?.[edit] : undefined;
  const [bid, setBid] = useState(old?.bid ?? MIN_BID);
  const [dropId, setDropId] = useState<string | null>(old?.drop ?? null);
  const droppable = roster.filter((r) => r.status === 'ROSTER').sort((a, b) => a.salary - b.salary);
  const d = dropId ? roster.find((r) => r.id === dropId) : null;
  const freed = d ? d.salary : 0;
  const dead = d ? deadCap(d.salary, d.contractYear) : 0;
  const after = Math.round((w.room - bid + freed - dead) * 100) / 100;
  const valid = Number.isInteger(bid) && bid >= MIN_BID;
  const rosterFull = w.active >= w.rosterMax;

  const confirm = async () => {
    if (old && w.pending) {
      const next = w.pending.map((b, i) => (i === edit ? { player: id, bid, drop: dropId } : b));
      if (await w.replaceClaims(next, `Claim changed: ${player.name} for $${bid}${dropId ? `, dropping ${info(dropId).name}` : ''}.`)) onClose();
    } else if (await w.placeBid(id, bid, dropId)) onClose();
  };

  return (
    <BottomSheet label={`Bid on ${player.name}`} onClose={onClose} height="86%" header={
      <div style={{ padding: '10px 16px 12px' }}>
        <div style={{ font: DISPLAY(11), letterSpacing: '.12em', color: 'var(--ink-3)' }}>{old ? 'CHANGE CLAIM' : 'BLIND BID'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <h2 style={{ margin: 0, font: '700 22px/1.05 var(--font-display)', letterSpacing: '.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</h2>
          <InjuryTag tag={player.injury ?? undefined} />
        </div>
        <div style={{ marginTop: 4, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)' }}>
          <b style={{ fontWeight: 700, color: posColor(player.pos) }}>{player.pos}</b> · {player.team} · {money(w.room)} cap room
        </div>
      </div>
    }>
      <div style={{ padding: '4px 16px 16px' }}>
        {!w.mine ? (
          w.loadError ? <RelayProblem error={w.loadError} /> : <Muted>Reading your roster from MFL…</Muted>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" aria-label="Lower bid" onClick={() => setBid((b) => Math.max(MIN_BID, b - STEP))} style={{ ...smallBtn(false), width: 44, height: 44 }}>−</button>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 44, border: '1px solid var(--edge)', borderRadius: 2, font: DISPLAY(24) }}>
                $
                <input inputMode="numeric" aria-label="Bid amount" value={String(bid)} onChange={(e) => setBid(Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0))}
                  style={{ width: 80, border: 0, background: 'transparent', color: 'var(--ink)', font: DISPLAY(24), textAlign: 'left' }} />
              </label>
              <button type="button" aria-label="Raise bid" onClick={() => setBid((b) => b + STEP)} style={{ ...smallBtn(false), width: 44, height: 44 }}>+</button>
            </div>
            <p style={{ margin: '6px 0 12px', font: '500 12px/1.4 var(--font-body)', color: valid ? 'var(--ink-3)' : 'var(--live)' }}>
              ${MIN_BID} minimum, whole dollars.
            </p>

            <div style={{ font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--ink-3)', margin: '4px 0 6px' }}>DROP IF YOU WIN HIM</div>
            <div role="radiogroup" aria-label="Drop if you win him" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 2 }}>
              <Choice on={dropId === null} onClick={() => setDropId(null)} title="No drop" sub={rosterFull ? 'Your roster is full, so MFL will likely reject this' : 'Keep everyone'} warn={rosterFull} />
              {droppable.map((r) => (
                <Choice key={r.id} on={dropId === r.id} onClick={() => setDropId(r.id)} title={info(r.id).name}
                  sub={`${info(r.id).pos} · ${money(r.salary)} · dead ${money(deadCap(r.salary, r.contractYear))}`} />
              ))}
            </div>

            <div style={{ margin: '14px 0', font: '500 14px/1.5 var(--font-body)' }}>
              <Line label="Your bid" value={money(bid)} />
              {d && <Line label={`${info(d.id).name} off your cap`} value={money(freed)} />}
              {d && <Line label="Dead cap" value={money(dead)} tone="var(--fall)" />}
              <Line label="Room if you win (est.)" value={money(after)} tone={after < 0 ? 'var(--live)' : undefined} />
            </div>
            {w.notice?.tone === 'bad' && <div style={{ margin: '0 -16px 12px' }}><WaiverNotice w={w} /></div>}
            <button type="button" disabled={!valid || w.busy} onClick={confirm} style={{ ...bigBtn, opacity: valid ? 1 : 0.5 }}>
              {w.busy ? 'SENDING…' : `${old ? 'UPDATE CLAIM' : 'PLACE CLAIM'} · $${bid}`}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Choice({ on, onClick, title, sub, warn }: { on: boolean; onClick: () => void; title: string; sub: string; warn?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '6px 12px', textAlign: 'left', border: 0, borderBottom: '1px solid var(--line)', background: on ? 'var(--bg-200)' : 'transparent', boxShadow: on ? 'inset 3px 0 0 var(--volt)' : undefined, color: 'var(--ink)', cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `${on ? 700 : 600} 13.5px/1.2 var(--font-body)` }}>{title}</span>
        <span style={{ display: 'block', marginTop: 2, font: '500 12px/1.3 var(--font-body)', color: warn ? 'var(--fall)' : 'var(--ink-3)' }}>{sub}</span>
      </span>
      <span style={{ font: DISPLAY(14, 800), color: 'var(--volt)' }}>{on ? '✓' : ''}</span>
    </button>
  );
}

function Stat({ value, label, bad }: { value: string; label: string; bad?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, paddingTop: 11, boxSizing: 'border-box', background: bad ? 'var(--live-tint)' : undefined }}>
      <span style={{ font: DISPLAY(16), fontVariantNumeric: 'tabular-nums', color: bad ? 'var(--live)' : 'var(--ink)' }}>{value}</span>
      <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: bad ? 'var(--live)' : 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tone }}>{value}</b>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 16, font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>{children}</div>;
}

function smallBtn(primary: boolean) {
  return {
    flex: 'none', height: 32, padding: '0 12px', borderRadius: 2, cursor: 'pointer',
    border: `1px solid ${primary ? 'var(--volt)' : 'var(--edge)'}`,
    background: primary ? 'var(--volt)' : 'transparent',
    color: primary ? 'var(--on-volt)' : 'var(--ink)',
    font: DISPLAY(12), letterSpacing: '.1em',
  } as const;
}

const bigBtn = {
  width: '100%', height: 44, borderRadius: 2, cursor: 'pointer',
  border: '1px solid var(--volt)', background: 'var(--volt)', color: 'var(--on-volt)',
  font: DISPLAY(14), letterSpacing: '.1em',
} as const;
