'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import SubTabs from '@/components/SubTabs';
import { posColor } from '@/components/pos';
import { deadCap } from '@/lib/cap';
import { getMine, getWaivers, isError, write, type Mine, type PendingBid, type RelayError, type Waivers } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import { DISPLAY, money } from './format';

/** League blind bid rules (MFL league export: bbidMinimum 5, bbidIncrement 1). */
const MIN_BID = 5;
const STEP = 1;
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;

interface Player {
  id: string;
  name: string;
  pos: string;
  team: string;
  injury?: string;
  proj: number | null;
  pts: number;
}

type Tab = 'fa' | 'claims' | 'drop';
type Notice = { tone: 'ok' | 'bad'; text: string };

const EXPIRED = 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.';

/**
 * Waivers: every pickup here is a blind bid. FREE AGENTS lists who MFL says
 * is available right now; BID opens a sheet with the amount, an optional
 * drop, and what the claim does to your cap. MY CLAIMS lists your pending
 * bids in priority order. DROP releases a player at once, after showing his
 * dead cap. Everything is confirmed first and re-read from MFL afterwards.
 */
export default function WaiversScreen({ cap, limits, adj }: { cap: number; limits: TeamsData['limits']; adj: Record<string, number> }) {
  const [tab, setTab] = useState<Tab>('fa');
  const [mine, setMine] = useState<Mine | null>(null);
  const [waivers, setWaivers] = useState<Waivers | null>(null);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [loadError, setLoadError] = useState<RelayError | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
  const [bidding, setBidding] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, w] = await Promise.all([getMine(), getWaivers()]);
    if (isError(m)) return setLoadError(m);
    if (isError(w)) return setLoadError(w);
    setLoadError(null);
    setMine(m);
    setWaivers(w);
  }, []);

  useEffect(() => {
    load();
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/players.json`)
      .then((r) => r.json())
      .then((d: { players?: Array<{ id: string; name: string; pos: string; nflTeam: string; injury?: string; proj?: { pts: number | null }; season?: { pts: number } }> }) => {
        setPlayers(new Map((d.players ?? []).map((p) => [p.id, { id: p.id, name: p.name, pos: p.pos, team: p.nflTeam, injury: p.injury, proj: p.proj?.pts ?? null, pts: p.season?.pts ?? 0 }])));
      })
      .catch(() => {});
  }, [load]);

  const info = (id: string): Player => players.get(id) ?? { id, name: `Player ${id}`, pos: '', team: '', proj: null, pts: 0 };

  // Cap room from the live roster: every salary but the taxi squad's, plus the team's adjustments.
  const counting = mine?.roster.filter((p) => p.status !== 'TAXI_SQUAD') ?? [];
  const used = counting.reduce((t, p) => t + p.salary, 0) + (mine ? adj[mine.franchiseId] ?? 0 : 0);
  const room = Math.round((cap - used) * 100) / 100;
  const active = mine?.roster.filter((p) => p.status === 'ROSTER').length ?? 0;
  const rosterFull = active >= limits.rosterMax;
  const pending = waivers?.pending ?? null;
  const pendingTotal = (pending ?? []).reduce((t, b) => t + b.bid, 0);

  const freeAgents = useMemo(() => {
    if (!waivers) return [];
    const q = query.trim().toLowerCase();
    return waivers.freeAgents
      .filter((id) => players.has(id))
      .map((id) => players.get(id)!)
      .filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => (b.proj ?? -1) - (a.proj ?? -1) || b.pts - a.pts)
      .slice(0, 150);
  }, [waivers, players, query, pos]);

  const report = async (r: { ok: true } | RelayError, success: string) => {
    setNotice(isError(r)
      ? { tone: 'bad', text: r.signedOut ? EXPIRED : r.unknown ? `${r.error} Your claims and roster were re-read, so check them before trying again.` : r.error }
      : { tone: 'ok', text: success });
    await load();
  };

  const placeBid = async (player: string, bid: number, drop: string | null) => {
    setBusy(true);
    // Without REPLACE, MFL adds this claim after your existing ones.
    const r = await write('blindBidWaiverRequest', { PICKS: `${player}_${bid}_${drop ?? '0000'}` });
    setBidding(null);
    await report(r, `Claim placed: ${info(player).name} for $${bid}${drop ? `, dropping ${info(drop).name}` : ''}.`);
    setTab('claims');
    setBusy(false);
  };

  /** Rewrites the whole claim list (REPLACE). Only offered when MFL's list was read. */
  const replaceClaims = async (next: PendingBid[], success: string) => {
    setBusy(true);
    const picks = next.map((b) => `${b.player}_${b.bid}_${b.drop ?? '0000'}`).join(',');
    const r = await write('blindBidWaiverRequest', { PICKS: picks, REPLACE: '1' });
    await report(r, success);
    setBusy(false);
  };

  const drop = async (id: string) => {
    setBusy(true);
    const r = await write('fcfsWaiver', { DROP: id });
    setDropping(null);
    await report(r, `${info(id).name} dropped.`);
    setBusy(false);
  };

  const tabs = [
    { key: 'fa', label: 'FREE AGENTS' },
    { key: 'claims', label: `MY CLAIMS${pending?.length ? ` · ${pending.length}` : ''}` },
    { key: 'drop', label: 'DROP' },
  ];

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar back="/team/" title="WAIVERS" />
      {mine && (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', height: 36, borderBottom: '1px solid var(--line)' }}>
          <Stat value={money(room)} label="ROOM" bad={room < 0} />
          <Stat value={`${active}/${limits.rosterMax}`} label="ROSTER" bad={active > limits.rosterMax} />
          <Stat value={`$${pendingTotal}`} label="BIDS" />
        </div>
      )}
      <SubTabs label="Waiver sections" tabs={tabs} active={tab} onSelect={(k) => { setTab(k as Tab); setNotice(null); }} />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        {notice && (
          <div role="status" style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 2, font: '500 13px/1.4 var(--font-body)', background: notice.tone === 'ok' ? 'var(--rise-tint)' : 'var(--live-tint)', boxShadow: `inset 3px 0 0 ${notice.tone === 'ok' ? 'var(--rise)' : 'var(--live)'}` }}>
            {notice.text}
          </div>
        )}
        {loadError && !mine && (
          <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-2)' }}>
            <p style={{ margin: 0 }}>{loadError.signedOut ? EXPIRED : loadError.error}</p>
            <p style={{ margin: '12px 0 0' }}><Link href="/settings/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Settings → Make moves</Link></p>
          </div>
        )}
        {!mine && !loadError && <Muted>Reading waivers from MFL…</Muted>}

        {mine && waivers && tab === 'fa' && (
          <>
            <div style={{ display: 'flex', gap: 6, padding: '12px 16px 8px' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search free agents" aria-label="Search free agents"
                style={{ flex: 1, minWidth: 0, height: 36, padding: '0 10px', borderRadius: 2, border: '1px solid var(--edge)', background: 'var(--bg-100)', color: 'var(--ink)', font: '500 14px/1 var(--font-body)' }} />
            </div>
            <div role="radiogroup" aria-label="Position" style={{ display: 'flex', gap: 6, padding: '0 16px 8px' }}>
              {POSITIONS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={pos === p} onClick={() => setPos(p)} style={{ height: 30, padding: '0 10px', borderRadius: 2, border: `1px solid ${pos === p ? 'var(--volt)' : 'var(--line)'}`, background: pos === p ? 'var(--volt)' : 'transparent', color: pos === p ? 'var(--on-volt)' : 'var(--ink-3)', font: DISPLAY(12), letterSpacing: '.08em', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
            {freeAgents.length === 0 && <Muted>{players.size ? 'No free agents match.' : 'Loading players…'}</Muted>}
            {freeAgents.map((p) => (
              <Row key={p.id} p={p} detail={p.proj !== null ? `${p.proj.toFixed(1)} PROJ` : `${p.pts.toFixed(1)} PTS`}>
                <button type="button" onClick={() => { setNotice(null); setBidding(p.id); }} style={smallBtn(true)}>BID</button>
              </Row>
            ))}
          </>
        )}

        {mine && waivers && tab === 'claims' && (
          <>
            {pending === null && <Muted>MFL returned your claims in a form this app can&apos;t read yet, so it won&apos;t edit them here. Check them on MFL&apos;s site.</Muted>}
            {pending && pending.length === 0 && <Muted>No pending claims. Bid on a free agent to add one.</Muted>}
            {pending && pending.length > 0 && (
              <>
                <p style={{ margin: '12px 16px 4px', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
                  In priority order. Bids stay private until MFL runs waivers; you can change them until then.
                </p>
                {pending.map((b, i) => (
                  <Row key={`${b.player}-${i}`} p={info(b.player)} detail={`$${b.bid}${b.drop ? ` · drop ${info(b.drop).name}` : ''}`}>
                    <button type="button" disabled={busy} onClick={() => replaceClaims(pending.filter((_, j) => j !== i), `Claim on ${info(b.player).name} removed.`)} style={smallBtn(false)}>REMOVE</button>
                  </Row>
                ))}
                <div style={{ padding: '12px 16px' }}>
                  <button type="button" disabled={busy} onClick={() => replaceClaims([], 'All claims cleared.')} style={{ ...smallBtn(false), width: '100%', height: 40 }}>CLEAR ALL CLAIMS</button>
                </div>
              </>
            )}
          </>
        )}

        {mine && tab === 'drop' && (
          <>
            <p style={{ margin: '12px 16px 4px', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
              A drop happens on MFL at once and can&apos;t be undone. To drop someone only if you win a player, add the drop to that claim instead.
            </p>
            {[...mine.roster].sort((a, b) => b.salary - a.salary).map((r) => (
              <Row key={r.id} p={info(r.id)} detail={`${money(r.salary)} · ${Math.max(1, r.contractYear)} YR · dead ${money(deadCap(r.salary, r.contractYear))}${r.status === 'TAXI_SQUAD' ? ' · TAXI' : r.status === 'INJURED_RESERVE' ? ' · IR' : ''}`}>
                <button type="button" onClick={() => { setNotice(null); setDropping(r.id); }} style={smallBtn(false)}>DROP</button>
              </Row>
            ))}
          </>
        )}
      </div>

      {bidding && mine && (
        <BidSheet
          player={info(bidding)}
          roster={mine.roster}
          info={info}
          room={room}
          rosterFull={rosterFull}
          busy={busy}
          onClose={() => setBidding(null)}
          onConfirm={(bid, dropId) => placeBid(bidding, bid, dropId)}
        />
      )}

      {dropping && mine && (() => {
        const r = mine.roster.find((x) => x.id === dropping);
        if (!r) return null;
        const dead = deadCap(r.salary, r.contractYear);
        const freed = r.status === 'TAXI_SQUAD' ? 0 : r.salary;
        return (
          <BottomSheet label="Drop player" onClose={() => setDropping(null)} header={<SheetTitle>Drop {info(r.id).name}?</SheetTitle>}>
            <div style={{ padding: '0 16px 16px', font: '500 14px/1.5 var(--font-body)' }}>
              <Line label="Salary off your cap" value={money(freed)} />
              <Line label="Dead cap" value={money(dead)} tone="var(--fall)" />
              <Line label="Room after (est.)" value={money(room + freed - dead)} tone={room + freed - dead < 0 ? 'var(--live)' : undefined} />
              <p style={{ margin: '10px 0 14px', color: 'var(--ink-3)', fontSize: 12.5 }}>Takes effect on MFL right away. It can&apos;t be undone, and he goes to waivers.</p>
              <button type="button" disabled={busy} onClick={() => drop(r.id)} style={{ ...bigBtn, background: 'var(--live)', borderColor: 'var(--live)', color: '#fff' }}>{busy ? 'DROPPING…' : `DROP ${info(r.id).name.toUpperCase()}`}</button>
            </div>
          </BottomSheet>
        );
      })()}
    </PhoneFrame>
  );
}

function BidSheet({ player, roster, info, room, rosterFull, busy, onClose, onConfirm }: {
  player: Player;
  roster: Mine['roster'];
  info: (id: string) => Player;
  room: number;
  rosterFull: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (bid: number, drop: string | null) => void;
}) {
  const [bid, setBid] = useState(MIN_BID);
  const [dropId, setDropId] = useState<string | null>(null);
  const droppable = roster.filter((r) => r.status === 'ROSTER').sort((a, b) => a.salary - b.salary);
  const d = dropId ? roster.find((r) => r.id === dropId) : null;
  const freed = d ? d.salary : 0;
  const dead = d ? deadCap(d.salary, d.contractYear) : 0;
  const after = Math.round((room - bid + freed - dead) * 100) / 100;
  const valid = Number.isInteger(bid) && bid >= MIN_BID;

  return (
    <BottomSheet label="Blind bid" onClose={onClose} height="86%" header={<SheetTitle>Bid on {player.name}</SheetTitle>}>
      <div style={{ padding: '0 16px 16px' }}>
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
          ${MIN_BID} minimum, whole dollars. Ties go to the earliest bid.
        </p>

        <div style={{ font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--ink-3)', margin: '4px 0 6px' }}>DROP IF YOU WIN HIM</div>
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 2 }}>
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
        <button type="button" disabled={!valid || busy} onClick={() => onConfirm(bid, dropId)} style={{ ...bigBtn, opacity: valid ? 1 : 0.5 }}>
          {busy ? 'SENDING…' : `PLACE CLAIM · $${bid}`}
        </button>
      </div>
    </BottomSheet>
  );
}

function Row({ p, detail, children }: { p: Player; detail: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <InjuryTag tag={p.injury} />
        </span>
        <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos || '—'}</b> · {p.team || '—'} · {detail}
        </span>
      </span>
      {children}
    </div>
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
  return <div style={{ padding: '16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>{children}</div>;
}

function SheetTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '14px 16px 10px', font: DISPLAY(20, 800), letterSpacing: '.02em' }}>{children}</div>;
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
