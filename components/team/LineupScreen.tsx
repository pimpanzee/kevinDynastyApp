'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import LineupAlert from '@/components/LineupAlert';
import PhoneFrame from '@/components/PhoneFrame';
import SubTabs from '@/components/SubTabs';
import { posColor } from '@/components/pos';
import { lineupIssue, type LineupIssue } from '@/lib/lineupAlerts';
import { getMine, isError, write, type Mine, type RelayError } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import SectionHead from './SectionHead';
import { DISPLAY } from './format';

export interface LineupPlayer {
  name: string;
  pos: string;
  team: string;
  injury?: string;
  /** The build's projection week: "@ BUF" away, "BUF" at home, null on a bye. Absent when unknown. */
  opp?: string | null;
  /** Projected points in league scoring that week. */
  proj?: number | null;
  /** Season points per game, in league scoring. */
  ppg?: number | null;
  /** Share of ESPN leagues starting him this week, 0–100. */
  startPct?: number | null;
}

type Slot = Mine['roster'][number]['status'];
type Move = { type: 'ir' | 'taxi_squad'; param: 'ACTIVATE' | 'DEACTIVATE' | 'PROMOTE' | 'DEMOTE'; short: string; title: string; done: string; note: string };

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
/** An open starter slot, picked to start a bench player in it. */
const OPEN = '@open';

const TO_IR: Move = { type: 'ir', param: 'DEACTIVATE', short: 'IR', title: 'Move {name} to IR?', done: 'moved to IR', note: 'Takes effect on MFL right away. MFL decides whether he is eligible for IR.' };
const TO_TAXI: Move = { type: 'taxi_squad', param: 'DEMOTE', short: 'TAXI', title: 'Move {name} to the taxi squad?', done: 'moved to the taxi squad', note: 'Takes effect on MFL right away. A taxi player costs $0 against this year’s cap; MFL decides who is taxi eligible.' };
const ACTIVATE: Move = { type: 'ir', param: 'ACTIVATE', short: 'ACTIVATE', title: 'Activate {name} from IR?', done: 'activated from IR', note: 'Takes effect on MFL right away and needs an open active roster spot.' };
const PROMOTE: Move = { type: 'taxi_squad', param: 'PROMOTE', short: 'PROMOTE', title: 'Promote {name} to the active roster?', done: 'promoted to the active roster', note: 'Promoting puts his salary back on this year’s cap. MFL decides whether he can go back to the taxi squad.' };

const ISSUE_TEXT: Record<LineupIssue, string> = { IR: 'on IR', OUT: 'out', BYE: 'on a bye', DOUBTFUL: 'doubtful', 'NO PROJ': 'not projected to play' };

/** The swap button's two greens: ready, and locked once his game has started. */
const LOCKED_BG = 'color-mix(in srgb, var(--volt) 28%, var(--bg-100))';
const LOCKED_INK = 'color-mix(in srgb, var(--volt) 55%, var(--ink))';

interface Notice {
  tone: 'ok' | 'bad';
  text: string;
}

/** "SUN 1:00" in ET, as the rest of the app writes kickoffs. */
function kickoffLabel(ms: number | undefined, now: number): string {
  if (!ms) return 'BYE';
  if (ms <= now) return 'LOCKED';
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${get('weekday').toUpperCase()} ${get('hour')}:${get('minute')}`;
}

const one = (n: number) => n.toFixed(1);
const plural = (n: number, pos: string) => `${n} ${pos}${n === 1 ? '' : 's'}`;

/** The widths of the stat and button columns, shared by the header row and every player row. */
const COL = { ppg: 34, pct: 42, proj: 38, act: 56, gap: 6 };

/**
 * Your team on MFL, read live through the write relay, in two modes on two
 * routes: LINEUP sets this week's starters, IR · TAXI moves players between
 * the active roster, IR and the taxi squad.
 *
 * Lineup: tap ⇄ on a player and the screen jumps to the other group, where
 * everyone he can trade places with (keeping the lineup legal) gets a SWAP
 * button. Open starter slots and an empty bench spot work the same way, so a
 * player can be started or benched without a swap. Tapping a greyed-out
 * player says which rule he would break. Nothing reaches MFL until the
 * lineup is submitted and confirmed. Players lock at their own kickoff.
 *
 * IR · TAXI: each move is confirmed, then sent to MFL right away. The roster
 * is re-read after every write.
 */
export default function LineupScreen({
  mode,
  players,
  projWeek,
  rules,
  limits,
}: {
  mode: 'lineup' | 'moves';
  players: Record<string, LineupPlayer>;
  /** The week the build's opponents and projections are for. */
  projWeek: number;
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
  const [moving, setMoving] = useState<{ id: string; move: Move } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
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
    setSel(null);
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
      .then((d: { projWeek?: number; players?: Array<{ id: string; name: string; pos: string; nflTeam: string; injury?: string; next: { opp: string } | null; proj: { pts: number | null }; season: { gp: number; pts: number } }> }) => {
        const found: Record<string, LineupPlayer> = {};
        for (const p of d.players ?? []) {
          found[p.id] = {
            name: p.name, pos: p.pos, team: p.nflTeam, injury: p.injury,
            ...(d.projWeek === projWeek ? { opp: p.next?.opp ?? null, proj: p.proj.pts } : {}),
            ppg: p.season.gp ? p.season.pts / p.season.gp : null,
          };
        }
        setExtra(found);
      })
      .catch(() => {});
  }, [mine, players, extra, projWeek]);

  const info = (id: string): LineupPlayer => players[id] ?? extra[id] ?? { name: `Player ${id}`, pos: '', team: '' };
  const locked = (id: string) => {
    const k = mine?.kickoffs[info(id).team];
    return k !== undefined && k <= now;
  };
  // Opponents and projections come from the build; use them only when it was built for this week.
  const weekOk = mine?.week === projWeek;
  const proj = (id: string) => (weekOk ? info(id).proj ?? null : null);
  const issue = (id: string): LineupIssue | null => {
    const p = info(id);
    if (!weekOk) return p.injury === 'IR' ? 'IR' : p.injury === 'O' ? 'OUT' : p.injury === 'D' ? 'DOUBTFUL' : null;
    return lineupIssue({ injury: p.injury, bye: p.opp === null, proj: p.proj ?? null });
  };

  /** Each starter rule the set breaks, as "3 QBs, max 2". */
  const broken = (ids: Iterable<string>): string[] => {
    const c: Record<string, number> = {};
    let total = 0;
    for (const id of ids) {
      c[info(id).pos] = (c[info(id).pos] ?? 0) + 1;
      total++;
    }
    const out: string[] = [];
    if (total > rules.max) out.push(`${total} starters, max ${rules.max}`);
    if (total < rules.min) out.push(`${total} starters, min ${rules.min}`);
    for (const [pos, lim] of Object.entries(rules.positions)) {
      const n = c[pos] ?? 0;
      if (n > lim.max) out.push(`${plural(n, pos)}, max ${lim.max}`);
      if (n < lim.min) out.push(`${plural(n, pos)}, min ${lim.min}`);
    }
    return out;
  };
  const projTotal = (ids: Iterable<string>) => [...ids].reduce((t, id) => t + (proj(id) ?? 0), 0);

  const rows = useMemo(() => {
    if (!mine) return null;
    const sort = (ids: string[]) =>
      [...ids].sort((a, b) => {
        const pa = POS_ORDER.indexOf(info(a).pos);
        const pb = POS_ORDER.indexOf(info(b).pos);
        return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb) || (proj(b) ?? -1) - (proj(a) ?? -1) || info(a).name.localeCompare(info(b).name);
      });
    const of = (s: Slot) => mine.roster.filter((p) => p.status === s).map((p) => p.id);
    const active = of('ROSTER');
    return {
      active: sort(active),
      starters: sort(active.filter((id) => starters.has(id))),
      bench: sort(active.filter((id) => !starters.has(id))),
      ir: sort(of('INJURED_RESERVE')),
      taxi: sort(of('TAXI_SQUAD')),
    };
    // info and proj read players/extra/weekOk, all covered by mine and the lists here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, starters, players, extra]);

  const isActive = (id: string) => mine?.roster.some((p) => p.id === id && p.status === 'ROSTER') ?? false;
  const original = useMemo(() => new Set(mine?.starters ?? []), [mine]);
  const lineup = rows?.starters ?? [];
  const added = lineup.filter((id) => !original.has(id));
  const removed = mine ? mine.starters.filter((id) => !starters.has(id) && isActive(id)) : [];
  const changed = added.length + removed.length > 0;
  const problemsNow = broken(lineup);
  const openSlots = Math.max(0, rules.max - lineup.length);

  // With a player (or an open slot) picked: what each row in the other group would do to the lineup.
  const selStarting = sel !== null && sel !== OPEN && starters.has(sel);
  const outcome = (id: string): string[] | null => {
    if (!sel || !rows) return null;
    const next = new Set(lineup);
    if (id === OPEN) {
      if (sel === OPEN || selStarting) return null;
      next.add(sel);
    } else if (id === 'bench') {
      if (!selStarting) return null;
      next.delete(sel);
    } else if (sel === OPEN) {
      if (starters.has(id)) return null;
      next.add(id);
    } else {
      if (starters.has(id) === selStarting) return null;
      if (selStarting) {
        next.delete(sel);
        next.add(id);
      } else {
        next.delete(id);
        next.add(sel);
      }
    }
    return broken(next);
  };

  // Jump to the group he can trade places with.
  useEffect(() => {
    if (!sel) return;
    const target = sel === OPEN || starters.has(sel) ? 'lineup-bench' : 'lineup-starters';
    document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const pick = (id: string) => {
    setNotice(null);
    setWhy(null);
    setSel(id);
  };
  const cancel = () => {
    setSel(null);
    setWhy(null);
  };
  const apply = (id: string) => {
    if (!sel) return;
    setStarters((s) => {
      const next = new Set(s);
      if (id === OPEN) next.add(sel);
      else if (id === 'bench') next.delete(sel);
      else if (sel === OPEN) next.add(id);
      else if (s.has(sel)) {
        next.delete(sel);
        next.add(id);
      } else {
        next.delete(id);
        next.add(sel);
      }
      return next;
    });
    cancel();
  };
  const explain = (id: string, label: string) => {
    if (id !== OPEN && id !== 'bench' && locked(id)) return setWhy(`${label} can’t move: his game has started.`);
    const b = outcome(id);
    if (b?.length) setWhy(`${label} would leave ${b.join(' and ')}.`);
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
    const ids = [...starters].filter(isActive);
    const r = await write('lineup', { W: String(mine.week), STARTERS: ids.join(',') });
    setConfirming(false);
    await afterWrite(r, `Week ${mine.week} lineup saved on MFL.`);
    setBusy(false);
  };

  const move = async () => {
    if (!moving) return;
    setBusy(true);
    const { id, move: m } = moving;
    const r = await write(m.type, { [m.param]: id });
    setMoving(null);
    await afterWrite(r, `${info(id).name} ${m.done}.`);
    setBusy(false);
  };

  const problems = lineup
    .filter((id) => !locked(id))
    .map((id) => ({ id, issue: issue(id) }))
    .filter((p): p is { id: string; issue: LineupIssue } => p.issue !== null);
  const diff = projTotal(lineup) - projTotal(mine?.starters.filter(isActive) ?? []);
  const valid = problemsNow.length === 0;

  const counts: Record<string, number> = {};
  for (const id of lineup) counts[info(id).pos] = (counts[info(id).pos] ?? 0) + 1;
  const cells: Array<{ value: string | number; label: string; ok: boolean }> = mode === 'lineup'
    ? [
      { value: lineup.length, label: `START ${rules.min === rules.max ? rules.min : `${rules.min}–${rules.max}`}`, ok: lineup.length >= rules.min && lineup.length <= rules.max },
      ...Object.entries(rules.positions).map(([pos, lim]) => ({ value: counts[pos] ?? 0, label: `${pos} ${lim.min}–${lim.max}`, ok: (counts[pos] ?? 0) >= lim.min && (counts[pos] ?? 0) <= lim.max })),
    ]
    : rows
      ? [
        { value: rows.active.length, label: `ACTIVE ${limits.rosterMin}–${limits.rosterMax}`, ok: rows.active.length >= limits.rosterMin && rows.active.length <= limits.rosterMax },
        { value: `${rows.ir.length}/${limits.ir}`, label: 'IR', ok: rows.ir.length <= limits.ir },
        { value: `${rows.taxi.length}/${limits.taxi}`, label: 'TAXI', ok: rows.taxi.length <= limits.taxi },
      ]
      : [];

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar
        back="/team/"
        title={mode === 'moves' ? 'IR · TAXI' : mine ? `WEEK ${mine.week} LINEUP` : 'LINEUP'}
        right={mode === 'lineup' && mine && weekOk ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, marginRight: 8 }}>
            <span style={{ font: DISPLAY(20, 800), fontVariantNumeric: 'tabular-nums' }}>{one(projTotal(lineup))}</span>
            <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>PROJECTED</span>
          </span>
        ) : undefined}
      />
      <SubTabs label="Make moves" tabs={[{ key: 'lineup', label: 'LINEUP', href: '/team/lineup/' }, { key: 'moves', label: 'IR · TAXI', href: '/team/moves/' }]} active={mode} />

      {mine && rows && (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, background: 'var(--bg-100)', borderBottom: '1px solid var(--line)' }}>
          {cells.map((c) => <RuleCell key={c.label} {...c} />)}
        </div>
      )}

      {notice && (
        <div role="status" style={{ flex: 'none', padding: '10px 16px', font: '500 13px/1.4 var(--font-body)', background: notice.tone === 'ok' ? 'var(--rise-tint)' : 'var(--live-tint)', color: 'var(--ink)', boxShadow: `inset 0 -1px 0 ${notice.tone === 'ok' ? 'var(--rise)' : 'var(--live)'}` }}>
          {notice.text}
        </div>
      )}

      {sel && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px 6px 16px', background: 'var(--bg-200)', borderBottom: '1px solid var(--edge)' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, font: '500 13px/1.35 var(--font-body)' }}>
            <span>
              {sel === OPEN
                ? 'Pick a bench player to start in the open slot.'
                : selStarting
                  ? `Pick who comes in for ${info(sel).name}, or the empty bench spot to just bench him.`
                  : `Pick who ${info(sel).name} replaces${openSlots ? ', or an open slot' : ''}.`}
            </span>
            {why && <span role="alert" style={{ color: 'var(--live)', fontWeight: 600 }}>{why}</span>}
          </span>
          <button type="button" onClick={cancel} aria-label="Cancel swap" style={iconBtn(44)}>{CloseIcon}</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        {loadError && !mine && (
          <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-2)' }}>
            <p style={{ margin: 0 }}>{loadError.signedOut ? 'Your MFL login on the relay has expired. Run scripts/mfl-login.mjs again and replace MFL_COOKIE in Cloudflare.' : loadError.error}</p>
            <p style={{ margin: '12px 0 0' }}>
              <Link href="/settings/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Settings → Make moves</Link>
            </p>
          </div>
        )}
        {!mine && !loadError && <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>Reading your roster from MFL…</div>}

        {mine && rows && mode === 'lineup' && (
          <>
            {!sel && !valid && (
              <div role="alert" style={{ margin: '12px 16px 0', padding: '10px 12px', background: 'var(--live-tint)', boxShadow: 'inset 3px 0 0 var(--live)', font: '500 13px/1.4 var(--font-body)' }}>
                This lineup isn’t legal: {problemsNow.join('; ')}. Fix it before you submit.
              </div>
            )}
            {!sel && problems.length > 0 && <LineupAlert alerts={problems.map((p) => ({ name: info(p.id).name, issue: p.issue, kickoff: mine.kickoffs[info(p.id).team] ?? null }))} />}
            <Group id="lineup-starters" label={`STARTERS · ${rows.starters.length}`} stats>
              {rows.starters.map((id) => <PlayerRow key={id} id={id} />)}
              {Array.from({ length: openSlots }, (_, i) => <OpenRow key={`open-${i}`} first={i === 0} />)}
            </Group>
            <Group id="lineup-bench" label={`BENCH · ${rows.bench.length}`} stats>
              {selStarting && <BenchSpotRow />}
              {rows.bench.map((id) => <PlayerRow key={id} id={id} />)}
            </Group>
          </>
        )}

        {mine && rows && mode === 'moves' && (
          <>
            <Group label={`ACTIVE · ${rows.active.length}`}>{rows.active.map((id) => <MoveRow key={id} id={id} moves={[TO_IR, TO_TAXI]} />)}</Group>
            <Group label={`IR · ${rows.ir.length} OF ${limits.ir}`}>
              {rows.ir.length ? rows.ir.map((id) => <MoveRow key={id} id={id} moves={[ACTIVATE]} />) : <Empty text="Nobody on IR." />}
            </Group>
            <Group label={`TAXI · ${rows.taxi.length} OF ${limits.taxi}`}>
              {rows.taxi.length ? rows.taxi.map((id) => <MoveRow key={id} id={id} moves={[PROMOTE]} />) : <Empty text="Nobody on the taxi squad." />}
            </Group>
          </>
        )}
      </div>

      {mode === 'lineup' && mine && changed && !sel && (
        <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
          <button type="button" onClick={() => { setStarters(new Set(mine.starters)); setNotice(null); }} style={btn(false)}>UNDO</button>
          <button type="button" disabled={!valid || busy} onClick={() => setConfirming(true)} style={{ ...btn(true), flex: 1, opacity: valid ? 1 : 0.5 }}>
            {!valid ? 'LINEUP NOT LEGAL YET' : weekOk ? `SUBMIT LINEUP · ${diff >= 0 ? '+' : '−'}${one(Math.abs(diff))}` : 'SUBMIT LINEUP'}
          </button>
        </div>
      )}

      {confirming && mine && (
        <BottomSheet label="Confirm lineup" onClose={() => setConfirming(false)} header={<SheetTitle>Submit week {mine.week} lineup?</SheetTitle>}>
          <div style={{ padding: '0 16px 16px', font: '500 14px/1.5 var(--font-body)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {added.length > 0 && <p style={{ margin: 0 }}><b style={{ color: 'var(--rise)' }}>In:</b> {added.map((id) => info(id).name).join(', ')}</p>}
            {removed.length > 0 && <p style={{ margin: 0 }}><b style={{ color: 'var(--fall)' }}>Out:</b> {removed.map((id) => info(id).name).join(', ')}</p>}
            {weekOk && (
              <p style={{ margin: 0, color: 'var(--ink-2)' }}>
                Projected <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{one(projTotal(mine.starters.filter(isActive)))} → {one(projTotal(lineup))}</b>
              </p>
            )}
            {problems.length > 0 && (
              <p role="alert" style={{ margin: '4px 0 0', padding: '8px 10px', background: 'var(--live-tint)', boxShadow: 'inset 3px 0 0 var(--live)', fontSize: 13 }}>
                {problems.map((p) => `${info(p.id).name} is ${ISSUE_TEXT[p.issue]} and still starting.`).join(' ')}
              </p>
            )}
            <p style={{ margin: '0 0 8px', color: 'var(--ink-3)', fontSize: 12.5 }}>You can change it again until each player&apos;s kickoff.</p>
            <button type="button" disabled={busy} onClick={submit} style={{ ...btn(true), width: '100%' }}>{busy ? 'SUBMITTING…' : 'SUBMIT TO MFL'}</button>
          </div>
        </BottomSheet>
      )}

      {moving && (
        <BottomSheet label="Roster move" onClose={() => setMoving(null)} header={<SheetTitle>{moving.move.title.replace('{name}', info(moving.id).name)}</SheetTitle>}>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, font: '500 13px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>{moving.move.note}</p>
            <button type="button" disabled={busy} onClick={move} style={{ ...btn(true), width: '100%' }}>{busy ? 'SENDING…' : `${moving.move.short === 'IR' ? 'MOVE TO IR' : moving.move.short === 'TAXI' ? 'MOVE TO TAXI' : moving.move.short} ON MFL`}</button>
          </div>
        </BottomSheet>
      )}
    </PhoneFrame>
  );

  function Group({ id, label, stats, children }: { id?: string; label: string; stats?: boolean; children: ReactNode }) {
    const head: CSSProperties = { flex: 'none', textAlign: 'right' };
    return (
      <section id={id} style={{ scrollMarginTop: 0 }}>
        <div style={{ marginTop: 4 }}><SectionHead label={label} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: COL.gap, height: 24, padding: '0 8px 0 16px', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)' }}>
          <span style={{ flex: 1 }}>PLAYER</span>
          <span style={{ ...head, width: COL.ppg }}>PPG</span>
          {stats && <span style={{ ...head, width: COL.pct }}>START%</span>}
          <span style={{ ...head, width: COL.proj }}>PROJ</span>
          <span style={{ flex: 'none', width: stats ? COL.act : 112 }} />
        </div>
        {children}
      </section>
    );
  }

  function Line({ id }: { id: string }) {
    const p = info(id);
    const matchup = !weekOk || p.opp === undefined ? p.team || '—' : p.opp === null ? `${p.team} · BYE WEEK` : `${p.team} ${p.opp.startsWith('@') ? p.opp : `vs ${p.opp}`}`;
    const kick = p.opp === null && weekOk ? null : kickoffLabel(mine!.kickoffs[p.team], now);
    return (
      <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos || '—'}</b> · {matchup}
        {kick && <> · <span style={{ color: locked(id) ? 'var(--fall)' : undefined }}>{kick}</span></>}
      </span>
    );
  }

  function Name({ id, tag }: { id: string; tag?: 'IN' | 'OUT' | null }) {
    const p = info(id);
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
        <InjuryTag tag={p.injury} />
        {tag && (
          <span style={{ flex: 'none', font: '700 9.5px/1 var(--font-display)', letterSpacing: '.08em', padding: '3px 4px', borderRadius: 2, color: 'var(--on-volt)', background: tag === 'IN' ? 'var(--rise)' : 'var(--fall)' }}>{tag}</span>
        )}
      </span>
    );
  }

  function rowStyle(state: 'sel' | 'target' | 'dim' | null): CSSProperties {
    return {
      display: 'flex', alignItems: 'center', gap: COL.gap, minHeight: 56, padding: '0 8px 0 16px', borderBottom: '1px solid var(--line)',
      background: state === 'sel' ? 'var(--bg-200)' : state === 'target' ? 'color-mix(in srgb, var(--volt) 7%, transparent)' : undefined,
      boxShadow: state === 'sel' || state === 'target' ? 'inset 3px 0 0 var(--volt)' : undefined,
    };
  }

  /** The swap-mode button for a row: ⇄ to pick, SWAP / START / BENCH on a legal partner, ✕ to cancel. */
  function Action({ id, label, targetText }: { id: string; label: string; targetText: string }) {
    if (id !== OPEN && id !== 'bench' && locked(id)) {
      return <span role="img" aria-label={`${label}: locked, his game has started`} style={{ ...actBtn('locked'), opacity: sel ? 0.5 : 1 }}>{SwapIcon}</span>;
    }
    if (!sel) return <button type="button" aria-label={`Swap ${label}`} onClick={() => pick(id)} style={actBtn('ready')}>{SwapIcon}</button>;
    if (sel === id) return <button type="button" aria-label="Cancel swap" onClick={cancel} style={actBtn('ring')}>{CloseIcon}</button>;
    const b = outcome(id);
    if (b === null) return <span style={{ width: COL.act }} />;
    if (!b.length) return <button type="button" aria-label={`${targetText} ${label}`} onClick={() => apply(id)} style={{ ...actBtn('ready'), font: DISPLAY(12), letterSpacing: '.08em' }}>{targetText}</button>;
    return <button type="button" aria-label={`${label}: not allowed, tap for why`} onClick={() => explain(id, label)} style={{ ...actBtn('ready'), opacity: 0.3 }}>{SwapIcon}</button>;
  }

  function stateOf(id: string): 'sel' | 'target' | 'dim' | null {
    if (!sel) return null;
    if (sel === id) return 'sel';
    if (id !== OPEN && id !== 'bench' && locked(id)) return 'dim';
    const b = outcome(id);
    return b === null ? null : b.length ? 'dim' : 'target';
  }

  function PlayerRow({ id }: { id: string }) {
    const p = info(id);
    const starting = starters.has(id);
    const bad = starting && issue(id) !== null;
    const tag = starting && !original.has(id) ? 'IN' : !starting && original.has(id) ? 'OUT' : null;
    const state = stateOf(id);
    const pr = proj(id);
    const num: CSSProperties = { flex: 'none', textAlign: 'right', font: '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' };
    return (
      <div style={{ ...rowStyle(state), opacity: state === 'dim' ? 0.5 : 1 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Name id={id} tag={tag} />
          <Line id={id} />
        </span>
        <span style={{ ...num, width: COL.ppg }}>{p.ppg ? one(p.ppg) : '—'}</span>
        <span style={{ ...num, width: COL.pct }}>{p.startPct === undefined || p.startPct === null ? '—' : `${Math.round(p.startPct)}%`}</span>
        <span style={{ ...num, width: COL.proj, font: DISPLAY(17), color: bad ? 'var(--live)' : starting ? 'var(--ink)' : 'var(--ink-2)' }}>{pr === null ? '—' : one(pr)}</span>
        <span style={{ flex: 'none', width: COL.act, display: 'flex', justifyContent: 'flex-end' }}>
          <Action id={id} label={p.name} targetText={sel === OPEN ? 'START' : 'SWAP'} />
        </span>
      </div>
    );
  }

  function OpenRow({ first }: { first: boolean }) {
    // Every open slot is the same; only the first takes part in a swap.
    const state = first ? stateOf(OPEN) : sel ? 'dim' : null;
    return (
      <div style={{ ...rowStyle(state), opacity: state === 'dim' ? 0.5 : 1 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: DISPLAY(14), letterSpacing: '.1em', color: 'var(--ink-2)' }}>OPEN SLOT</span>
          <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)' }}>Start a bench player here</span>
        </span>
        <span style={{ flex: 'none', width: COL.act, display: 'flex', justifyContent: 'flex-end' }}>
          {first ? <Action id={OPEN} label="the open slot" targetText="START" /> : <span style={{ width: COL.act }} />}
        </span>
      </div>
    );
  }

  function BenchSpotRow() {
    const state = stateOf('bench');
    return (
      <div style={{ ...rowStyle(state), opacity: state === 'dim' ? 0.5 : 1 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: DISPLAY(14), letterSpacing: '.1em', color: 'var(--ink-2)' }}>EMPTY BENCH SPOT</span>
          <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Bench {sel ? info(sel).name : 'him'} and leave his slot open</span>
        </span>
        <span style={{ flex: 'none', width: COL.act, display: 'flex', justifyContent: 'flex-end' }}>
          <Action id="bench" label="the empty bench spot" targetText="BENCH" />
        </span>
      </div>
    );
  }

  function MoveRow({ id, moves }: { id: string; moves: Move[] }) {
    const p = info(id);
    const num: CSSProperties = { flex: 'none', textAlign: 'right', font: '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' };
    const pr = proj(id);
    const full = (m: Move) =>
      m.param === 'DEACTIVATE' ? rows!.ir.length >= limits.ir
        : m.param === 'DEMOTE' ? rows!.taxi.length >= limits.taxi
          : rows!.active.length >= limits.rosterMax;
    // Fill the button for the move his status points to (IR for a player out or on NFL IR, and the way back
    // from IR or taxi); outline the rest.
    const suggested = (m: Move) => (m.param === 'DEACTIVATE' ? p.injury === 'IR' || p.injury === 'O' : m.param !== 'DEMOTE');
    return (
      <div style={rowStyle(null)}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Name id={id} />
          <Line id={id} />
        </span>
        <span style={{ ...num, width: COL.ppg }}>{p.ppg ? one(p.ppg) : '—'}</span>
        <span style={{ ...num, width: COL.proj, font: DISPLAY(17), color: 'var(--ink)' }}>{pr === null ? '—' : one(pr)}</span>
        <span style={{ flex: 'none', width: 112, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {moves.map((m) => {
            const isFull = full(m);
            return (
              <button
                key={m.param}
                type="button"
                disabled={busy || isFull}
                title={isFull ? (m.param === 'DEACTIVATE' ? 'IR is full' : m.param === 'DEMOTE' ? 'Taxi squad is full' : 'Active roster is full') : undefined}
                aria-label={`${m.short === 'IR' ? 'Move to IR' : m.short === 'TAXI' ? 'Move to taxi squad' : m.short}: ${p.name}${isFull ? ' (full)' : ''}`}
                onClick={() => { setNotice(null); setMoving({ id, move: m }); }}
                style={{ ...actBtn(isFull ? 'locked' : suggested(m) ? 'ready' : 'ring'), width: moves.length > 1 ? 53 : 112, font: DISPLAY(12), letterSpacing: '.08em', cursor: isFull ? 'default' : 'pointer' }}
              >
                {m.short}
              </button>
            );
          })}
        </span>
      </div>
    );
  }
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '14px 16px', font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>{text}</div>;
}

function RuleCell({ value, label, ok }: { value: string | number; label: string; ok: boolean }) {
  return (
    <div title={ok ? undefined : 'Outside the league’s rules'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, height: 46, background: ok ? undefined : 'var(--live-tint)', boxShadow: ok ? undefined : 'inset 0 -2px 0 var(--live)' }}>
      <span style={{ font: DISPLAY(17), fontVariantNumeric: 'tabular-nums', color: ok ? 'var(--ink)' : 'var(--live)' }}>{value}</span>
      <span style={{ font: DISPLAY(10), letterSpacing: '.08em', whiteSpace: 'nowrap', color: ok ? 'var(--ink-3)' : 'var(--live)' }}>{label}</span>
    </div>
  );
}

function SheetTitle({ children }: { children: ReactNode }) {
  return <div style={{ padding: '14px 16px 10px', font: DISPLAY(20, 800), letterSpacing: '.02em' }}>{children}</div>;
}

const SwapIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" />
  </svg>
);
const CloseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);

function actBtn(kind: 'ready' | 'ring' | 'locked'): CSSProperties {
  return {
    flex: 'none', width: COL.act, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    cursor: kind === 'locked' ? 'default' : 'pointer',
    border: `1px solid ${kind === 'locked' ? 'transparent' : 'var(--volt)'}`,
    background: kind === 'ready' ? 'var(--volt)' : kind === 'locked' ? LOCKED_BG : 'transparent',
    color: kind === 'ready' ? 'var(--on-volt)' : kind === 'locked' ? LOCKED_INK : 'var(--ink)',
  };
}

function iconBtn(width: number): CSSProperties {
  return { flex: 'none', width, height: 44, border: 0, padding: 0, background: 'none', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
}

function btn(primary: boolean): CSSProperties {
  return {
    height: 44, padding: '0 16px', borderRadius: 2, cursor: 'pointer',
    border: `1px solid ${primary ? 'var(--volt)' : 'var(--edge)'}`,
    background: primary ? 'var(--volt)' : 'transparent',
    color: primary ? 'var(--on-volt)' : 'var(--ink)',
    font: DISPLAY(14), letterSpacing: '.1em',
  };
}
