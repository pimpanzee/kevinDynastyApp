'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import { posColor } from '@/components/pos';
import { getMine, isError, write, type Mine, type RelayError } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import SectionHead from './SectionHead';
import { DISPLAY } from './format';

export interface LineupPlayer {
  name: string;
  pos: string;
  team: string;
  injury?: string;
}

type Slot = Mine['roster'][number]['status'];
type Move = { type: 'ir' | 'taxi_squad'; param: 'ACTIVATE' | 'DEACTIVATE' | 'PROMOTE' | 'DEMOTE'; label: string; done: string };

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];

/** What each roster slot can move to. */
const MOVES: Record<Slot, Move[]> = {
  ROSTER: [
    { type: 'ir', param: 'DEACTIVATE', label: 'Move to IR', done: 'moved to IR' },
    { type: 'taxi_squad', param: 'DEMOTE', label: 'Move to taxi squad', done: 'moved to the taxi squad' },
  ],
  INJURED_RESERVE: [{ type: 'ir', param: 'ACTIVATE', label: 'Activate from IR', done: 'activated from IR' }],
  TAXI_SQUAD: [{ type: 'taxi_squad', param: 'PROMOTE', label: 'Promote to active roster', done: 'promoted to the active roster' }],
};

interface Notice {
  tone: 'ok' | 'bad';
  text: string;
}

function kickoffLabel(ms: number | undefined, now: number): string {
  if (!ms) return 'BYE';
  if (ms <= now) return 'LOCKED';
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Your lineup for MFL's current week, read live through the write relay: tap
 * START or BENCH to change it, then submit. Players lock at their own
 * kickoff. The ⋯ on each player moves them to or from IR and the taxi squad.
 * Every change is confirmed first, and the roster is re-read after each one.
 */
export default function LineupScreen({
  players,
  rules,
  limits,
}: {
  players: Record<string, LineupPlayer>;
  rules: TeamsData['lineup'];
  limits: TeamsData['limits'];
}) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [loadError, setLoadError] = useState<RelayError | null>(null);
  const [starters, setStarters] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Record<string, LineupPlayer>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await getMine();
    if (isError(r)) {
      setLoadError(r);
      return;
    }
    setLoadError(null);
    setMine(r);
    setStarters(new Set(r.starters));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Players added since the last build aren't in the build's list; look them up once.
  useEffect(() => {
    if (!mine || mine.roster.every((p) => players[p.id] || extra[p.id])) return;
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/players.json`)
      .then((r) => r.json())
      .then((d: { players?: Array<{ id: string; name: string; pos: string; nflTeam: string; injury?: string }> }) => {
        const found: Record<string, LineupPlayer> = {};
        for (const p of d.players ?? []) found[p.id] = { name: p.name, pos: p.pos, team: p.nflTeam, injury: p.injury };
        setExtra(found);
      })
      .catch(() => {});
  }, [mine, players, extra]);

  const info = (id: string): LineupPlayer => players[id] ?? extra[id] ?? { name: `Player ${id}`, pos: '', team: '' };
  const locked = (id: string) => {
    const k = mine?.kickoffs[info(id).team];
    return k !== undefined && k <= now;
  };

  const rows = useMemo(() => {
    if (!mine) return null;
    const sort = (ids: string[]) =>
      [...ids].sort((a, b) => {
        const pa = POS_ORDER.indexOf(info(a).pos);
        const pb = POS_ORDER.indexOf(info(b).pos);
        return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb) || info(a).name.localeCompare(info(b).name);
      });
    const of = (s: Slot) => mine.roster.filter((p) => p.status === s).map((p) => p.id);
    const active = of('ROSTER');
    return {
      starters: sort(active.filter((id) => starters.has(id))),
      bench: sort(active.filter((id) => !starters.has(id))),
      ir: sort(of('INJURED_RESERVE')),
      taxi: sort(of('TAXI_SQUAD')),
    };
    // info reads players/extra, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, starters, players, extra]);

  const original = useMemo(() => new Set(mine?.starters ?? []), [mine]);
  const added = rows ? rows.starters.filter((id) => !original.has(id)) : [];
  const removed = mine ? mine.starters.filter((id) => !starters.has(id) && mine.roster.some((p) => p.id === id && p.status === 'ROSTER')) : [];
  const changed = added.length + removed.length > 0;

  // Starter rules: per position and overall.
  const counts: Record<string, number> = {};
  for (const id of rows?.starters ?? []) counts[info(id).pos] = (counts[info(id).pos] ?? 0) + 1;
  const total = rows?.starters.length ?? 0;
  const posChecks = Object.entries(rules.positions).map(([pos, lim]) => ({ pos, n: counts[pos] ?? 0, ok: (counts[pos] ?? 0) >= lim.min && (counts[pos] ?? 0) <= lim.max, lim }));
  const totalOk = total >= rules.min && total <= rules.max;
  const valid = totalOk && posChecks.every((c) => c.ok);

  const toggle = (id: string) => {
    if (locked(id)) return;
    setNotice(null);
    setStarters((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const afterWrite = async (r: { ok: true } | RelayError, success: string) => {
    if (isError(r)) {
      setNotice({
        tone: 'bad',
        text: r.signedOut
          ? 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.'
          : r.unknown
            ? `${r.error} Your roster was re-read below, so check it before trying again.`
            : r.error,
      });
    } else {
      setNotice({ tone: 'ok', text: success });
    }
    await load();
  };

  const submit = async () => {
    if (!mine) return;
    setBusy(true);
    const ids = [...starters].filter((id) => mine.roster.some((p) => p.id === id && p.status === 'ROSTER'));
    const r = await write('lineup', { W: String(mine.week), STARTERS: ids.join(',') });
    setConfirming(false);
    await afterWrite(r, `Week ${mine.week} lineup saved on MFL.`);
    setBusy(false);
  };

  const move = async (id: string, m: Move) => {
    setBusy(true);
    const r = await write(m.type, { [m.param]: id });
    setMoving(null);
    await afterWrite(r, `${info(id).name} ${m.done}.`);
    setBusy(false);
  };

  const slotOf = (id: string) => mine?.roster.find((p) => p.id === id)?.status ?? 'ROSTER';
  const movingSlot = moving ? slotOf(moving) : null;

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar back="/team/" title={mine ? `WEEK ${mine.week} LINEUP` : 'LINEUP'} />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: changed ? 84 : 24 }}>
        {notice && (
          <div role="status" style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 2, font: '500 13px/1.4 var(--font-body)', background: notice.tone === 'ok' ? 'var(--rise-tint)' : 'var(--live-tint)', color: 'var(--ink)', boxShadow: `inset 3px 0 0 ${notice.tone === 'ok' ? 'var(--rise)' : 'var(--live)'}` }}>
            {notice.text}
          </div>
        )}

        {loadError && !mine && (
          <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-2)' }}>
            <p style={{ margin: 0 }}>{loadError.signedOut ? 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.' : loadError.error}</p>
            <p style={{ margin: '12px 0 0' }}>
              <Link href="/settings/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Settings → Make moves</Link>
            </p>
          </div>
        )}
        {!mine && !loadError && <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>Reading your roster from MFL…</div>}

        {mine && rows && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px 4px' }}>
              <Chip ok={totalOk} text={`${total} STARTERS`} title={`${rules.min}–${rules.max} starters`} />
              {posChecks.map((c) => (
                <Chip key={c.pos} ok={c.ok} text={`${c.pos} ${c.n}`} title={`${c.pos}: ${c.lim.min}–${c.lim.max}`} />
              ))}
            </div>
            <p style={{ margin: '4px 16px 0', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
              {rules.min === rules.max ? `${rules.min}` : `${rules.min}–${rules.max}`} starters; {posChecks.map((c) => `${c.pos} ${c.lim.min}–${c.lim.max}`).join(', ')}. Players lock at their own kickoff.
            </p>

            <Section label={`STARTERS · ${rows.starters.length}`} ids={rows.starters} />
            <Section label={`BENCH · ${rows.bench.length}`} ids={rows.bench} />
            <Section label={`IR · ${rows.ir.length} OF ${limits.ir}`} ids={rows.ir} />
            <Section label={`TAXI · ${rows.taxi.length} OF ${limits.taxi}`} ids={rows.taxi} />
          </>
        )}
      </div>

      {mine && changed && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', gap: 8, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
          <button type="button" onClick={() => { setStarters(new Set(mine.starters)); setNotice(null); }} style={btn(false)}>UNDO</button>
          <button type="button" disabled={!valid || busy} onClick={() => setConfirming(true)} style={{ ...btn(true), flex: 1, opacity: valid ? 1 : 0.5 }}>
            {valid ? 'SUBMIT LINEUP' : 'LINEUP NOT LEGAL YET'}
          </button>
        </div>
      )}

      {confirming && mine && (
        <BottomSheet label="Confirm lineup" onClose={() => setConfirming(false)} header={<SheetTitle>Submit week {mine.week} lineup?</SheetTitle>}>
          <div style={{ padding: '0 16px 16px', font: '500 14px/1.5 var(--font-body)' }}>
            {added.length > 0 && <p style={{ margin: '0 0 6px' }}><b style={{ color: 'var(--rise)' }}>In:</b> {added.map((id) => info(id).name).join(', ')}</p>}
            {removed.length > 0 && <p style={{ margin: '0 0 6px' }}><b style={{ color: 'var(--fall)' }}>Out:</b> {removed.map((id) => info(id).name).join(', ')}</p>}
            <p style={{ margin: '0 0 14px', color: 'var(--ink-3)', fontSize: 12.5 }}>You can change it again until each player&apos;s kickoff.</p>
            <button type="button" disabled={busy} onClick={submit} style={{ ...btn(true), width: '100%' }}>{busy ? 'SUBMITTING…' : 'SUBMIT TO MFL'}</button>
          </div>
        </BottomSheet>
      )}

      {moving && movingSlot && (
        <BottomSheet label="Roster move" onClose={() => setMoving(null)} header={<SheetTitle>{info(moving).name}</SheetTitle>}>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOVES[movingSlot].map((m) => {
              const full = (m.param === 'DEACTIVATE' && rows!.ir.length >= limits.ir) || (m.param === 'DEMOTE' && rows!.taxi.length >= limits.taxi);
              return (
                <button key={m.param} type="button" disabled={busy || full} onClick={() => move(moving, m)} style={{ ...btn(true), width: '100%', opacity: full ? 0.5 : 1 }}>
                  {busy ? 'SENDING…' : full ? `${m.label.toUpperCase()} (FULL)` : m.label.toUpperCase()}
                </button>
              );
            })}
            <p style={{ margin: '4px 0 0', font: '500 12.5px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
              {movingSlot === 'TAXI_SQUAD'
                ? 'Promoting puts his salary back on this year’s cap. MFL decides whether he can go back to the taxi squad.'
                : movingSlot === 'ROSTER'
                  ? 'Takes effect on MFL right away. A taxi player costs $0 against this year’s cap; MFL decides who is taxi eligible.'
                  : 'Takes effect on MFL right away and needs an open active roster spot.'}
            </p>
          </div>
        </BottomSheet>
      )}
    </PhoneFrame>
  );

  function Section({ label, ids }: { label: string; ids: string[] }) {
    if (!ids.length) return null;
    return (
      <>
        <div style={{ marginTop: 12 }}><SectionHead label={label} /></div>
        {ids.map((id) => {
          const p = info(id);
          const slot = slotOf(id);
          const isLocked = locked(id);
          const starting = starters.has(id);
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '0 8px 0 16px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  <InjuryTag tag={p.injury} />
                </span>
                <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos || '—'}</b> · {p.team || '—'} · <span style={{ color: isLocked ? 'var(--fall)' : undefined }}>{kickoffLabel(mine!.kickoffs[p.team], now)}</span>
                </span>
              </span>
              {slot === 'ROSTER' && (
                <button type="button" disabled={isLocked} aria-pressed={starting} onClick={() => toggle(id)} style={{ flex: 'none', width: 72, height: 32, borderRadius: 2, border: `1px solid ${starting ? 'var(--volt)' : 'var(--edge)'}`, background: starting ? 'var(--volt)' : 'transparent', color: starting ? 'var(--on-volt)' : 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.1em', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.45 : 1 }}>
                  {starting ? 'START' : 'BENCH'}
                </button>
              )}
              <button type="button" aria-label={`Roster moves for ${p.name}`} onClick={() => { setNotice(null); setMoving(id); }} style={{ flex: 'none', width: 40, height: 40, border: 0, background: 'none', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
            </div>
          );
        })}
      </>
    );
  }
}

function Chip({ ok, text, title }: { ok: boolean; text: string; title: string }) {
  return (
    <span title={title} style={{ font: DISPLAY(12), letterSpacing: '.08em', padding: '5px 8px', borderRadius: 2, border: `1px solid ${ok ? 'var(--line)' : 'var(--live)'}`, color: ok ? 'var(--ink-2)' : 'var(--live)', background: ok ? 'transparent' : 'var(--live-tint)' }}>
      {text}
    </span>
  );
}

function SheetTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '14px 16px 10px', font: DISPLAY(20, 800), letterSpacing: '.02em' }}>{children}</div>;
}

function btn(primary: boolean) {
  return {
    height: 44, padding: '0 16px', borderRadius: 2, cursor: 'pointer',
    border: `1px solid ${primary ? 'var(--volt)' : 'var(--edge)'}`,
    background: primary ? 'var(--volt)' : 'transparent',
    color: primary ? 'var(--on-volt)' : 'var(--ink)',
    font: DISPLAY(14), letterSpacing: '.1em',
  } as const;
}
