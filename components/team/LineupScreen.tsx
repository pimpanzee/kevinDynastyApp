'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import LineupAlert from '@/components/LineupAlert';
import { PlayerLink } from '@/components/PlayerCard';
import PhoneFrame from '@/components/PhoneFrame';
import { posColor } from '@/components/pos';
import { capUsed, overCapBy } from '@/lib/cap';
import { lineupIssue, type LineupIssue } from '@/lib/lineupAlerts';
import { getMine, isError, write, type Mine, type RelayError, SIGNED_OUT } from '@/lib/relay';
import type { TeamsData } from '@/lib/types';
import SectionHead from './SectionHead';
import { DISPLAY, money } from './format';

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
  /** The year he entered the NFL, from MFL. Taxi is for first and second year players. */
  draftYear?: number;
}

type Slot = Mine['roster'][number]['status'];
type MoveKey = 'IR' | 'TAXI' | 'ACTIVATE' | 'PROMOTE' | 'DROP';
interface Move {
  label: string;
  /** Where he ends up; null once dropped. */
  to: Slot | null;
  type: 'ir' | 'taxi_squad' | 'fcfsWaiver';
  param: 'ACTIVATE' | 'DEACTIVATE' | 'PROMOTE' | 'DEMOTE' | 'DROP';
  /** The row's tag while queued. */
  tag: string;
  /** Its group on the review screen, and the line under each player there. */
  group: string;
  path: string;
  note: string;
  /** Filled when allowed (the move his status points to); otherwise an outline. */
  suggest: boolean;
  danger?: boolean;
}

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
/** An open starter slot, picked to start a bench player in it. */
const OPEN = '@open';

/**
 * Manage roster moves. MFL has no eligibility endpoint, so the IR and taxi
 * rules below are read off the league's own rosters (every IR player is on an
 * NFL reserve list; every taxi player is in his first or second year). MFL
 * still has the last word. Active roster size is never blocked: an illegal
 * roster is the owner's call, shown red in the counts.
 */
const MOVES: Record<MoveKey, Move> = {
  IR: { label: 'IR', to: 'INJURED_RESERVE', type: 'ir', param: 'DEACTIVATE', tag: '→ IR', group: 'TO IR', path: 'Active → IR', note: 'Each IR move opens an active roster spot.', suggest: true },
  TAXI: { label: 'TAXI', to: 'TAXI_SQUAD', type: 'taxi_squad', param: 'DEMOTE', tag: '→ TAXI', group: 'TO TAXI', path: 'Active → Taxi', note: 'A taxi player costs $0 against this year’s cap.', suggest: false },
  ACTIVATE: { label: 'ACTIVATE', to: 'ROSTER', type: 'ir', param: 'ACTIVATE', tag: '→ ACTIVE', group: 'ACTIVATE FROM IR', path: 'IR → Active', note: 'Each activation uses an active roster spot.', suggest: true },
  PROMOTE: { label: 'PROMOTE', to: 'ROSTER', type: 'taxi_squad', param: 'PROMOTE', tag: '→ ACTIVE', group: 'PROMOTE FROM TAXI', path: 'Taxi → Active', note: 'Promoting puts his salary back on this year’s cap, and he can’t go back to the taxi squad.', suggest: true },
  DROP: { label: 'DROP', to: null, type: 'fcfsWaiver', param: 'DROP', tag: 'DROP', group: 'DROP', path: 'Released to waivers', note: 'Dropped players go to waivers. Dead cap from their contracts stays on your cap, and a drop can’t be undone here once it’s sent.', suggest: false, danger: true },
};
/** The order changes go to MFL: spots open up before anyone fills them. */
const SEND_ORDER: MoveKey[] = ['DROP', 'IR', 'TAXI', 'ACTIVATE', 'PROMOTE'];

const ISSUE_TEXT: Record<LineupIssue, string> = { IR: 'on IR', OUT: 'out', BYE: 'on a bye', DOUBTFUL: 'doubtful', 'NO PROJ': 'not projected to play' };

/** The swap button is a volt outline with volt arrows; once his game has started, a duller green. */
const LOCKED_BG = 'color-mix(in srgb, var(--volt) 28%, var(--bg-100))';
const LOCKED_INK = 'color-mix(in srgb, var(--volt) 55%, var(--ink-3))';
const DROP_TINT = 'color-mix(in srgb, var(--fall) 7%, transparent)';
const QUEUE_TINT = 'color-mix(in srgb, var(--volt) 6%, transparent)';

/** How many times a saved lineup is read back from MFL, and the wait between reads. */
const VERIFY_TRIES = 3;
const VERIFY_GAP_MS = 4000;

/** The starters sent against the starters MFL shows. */
export function lineupDiff(sent: string[], onMfl: string[]) {
  const a = new Set(sent);
  const b = new Set(onMfl);
  const missing = sent.filter((id) => !b.has(id));
  const extra = onMfl.filter((id) => !a.has(id));
  return { same: missing.length === 0 && extra.length === 0, missing, extra };
}

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

/** The widths of the stat and button columns, shared by the header row and every player row. The button's
 * cell (slot) is wider than the button so the numbers don't crowd it. */
const COL = { ppg: 34, pct: 42, proj: 38, act: 56, slot: 70, gap: 6 };

/**
 * Your team on MFL, read live through the write relay, in two modes on two
 * routes: LINEUP sets this week's starters, MANAGE ROSTER moves players
 * between the active roster, IR and the taxi squad, and drops them.
 *
 * Lineup: tap ⇄ on a player and the screen jumps to the other group, where
 * everyone he can trade places with (keeping the lineup legal) gets a SWAP
 * button. Open starter slots and an empty bench spot work the same way, so a
 * player can be started or benched without a swap. Tapping a greyed-out
 * player says which rule he would break. Nothing reaches MFL until the
 * lineup is submitted and confirmed. Players lock at their own kickoff.
 *
 * Manage roster: each tap queues a move (UNDO takes it back) and the counts
 * show the roster as it will be. A move a rule blocks is greyed out and says
 * why when tapped. SUBMIT opens a review of every queued change; confirming
 * sends them one at a time in SEND_ORDER. One that MFL rejects stays queued
 * and the rest still go through. The roster is re-read afterwards.
 */
export default function LineupScreen({
  mode,
  players,
  projWeek,
  rules,
  limits,
  season,
  cap,
  capAdjust,
}: {
  mode: 'lineup' | 'moves';
  players: Record<string, LineupPlayer>;
  /** The week the build's opponents and projections are for. */
  projWeek: number;
  rules: TeamsData['lineup'];
  limits: TeamsData['limits'];
  /** The MFL season, for taxi eligibility. */
  season: number;
  /** League salary cap. */
  cap: number;
  /** Franchise → salary adjustments (dead cap etc.) at build time. */
  capAdjust: Record<string, number>;
}) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [loadError, setLoadError] = useState<RelayError | null>(null);
  const [starters, setStarters] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Record<string, LineupPlayer>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [queued, setQueued] = useState<Record<string, MoveKey>>({});
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const show = useCallback((r: Mine) => {
    setLoadError(null);
    setMine(r);
    setStarters(new Set(r.starters));
    setSel(null);
    setNow(Date.now());
  }, []);

  const load = useCallback(async () => {
    const r = await getMine();
    if (isError(r)) {
      setLoadError(r);
      return;
    }
    show(r);
  }, [show]);

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
  // MFL refuses any lineup while a team is over the cap, so don't let one be sent.
  const capNow = mine ? capUsed(mine.roster, mine.capAdjust ?? capAdjust[mine.franchiseId] ?? 0) : 0;
  const overCap = mine ? overCapBy(capNow, cap) : 0;
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
          ? SIGNED_OUT
          : r.unknown
            ? `${r.error} Your roster was re-read below, so check it before trying again.`
            : r.error,
      });
    } else {
      setNotice({ tone: 'ok', text: success });
    }
    await load();
  };

  /**
   * Sends the lineup, then reads it back from MFL and only says it saved
   * once MFL shows exactly these starters. MFL can take a few seconds to
   * show a change, so a mismatch is re-read twice before it's reported. A
   * write that timed out is settled the same way.
   */
  const submit = async () => {
    if (!mine) return;
    setBusy(true);
    const week = mine.week;
    const ids = [...starters].filter(isActive);
    const r = await write('lineup', { W: String(week), STARTERS: ids.join(',') });
    if (isError(r) && !r.unknown) {
      setConfirming(false);
      await afterWrite(r, '');
      setBusy(false);
      return;
    }
    setProgress('CHECKING MFL…');
    let back: Mine | RelayError = { error: 'not read' };
    let diff = lineupDiff(ids, []);
    for (let i = 0; i < VERIFY_TRIES; i++) {
      if (i) await new Promise((done) => setTimeout(done, VERIFY_GAP_MS));
      back = await getMine(week);
      if (isError(back)) break;
      diff = lineupDiff(ids, back.starters);
      if (diff.same) break;
    }
    setProgress(null);
    setConfirming(false);
    const name = (id: string) => info(id).name;
    if (isError(back)) {
      setNotice({
        tone: 'bad',
        text: !isError(r)
          ? `MFL accepted your week ${week} lineup, but reading it back failed (${back.error}). Open this screen again to check it.`
          : `${r.error} Reading it back failed too (${back.error}), so open this screen again to check your lineup.`,
      });
      await load();
    } else if (diff.same) {
      setNotice({ tone: 'ok', text: `Week ${week} lineup saved and checked: MFL shows your ${ids.length} starters.` });
      show(back);
    } else {
      const parts = [
        diff.missing.length ? `not starting on MFL: ${diff.missing.map(name).join(', ')}` : '',
        diff.extra.length ? `still starting on MFL: ${diff.extra.map(name).join(', ')}` : '',
      ].filter(Boolean);
      setNotice({
        tone: 'bad',
        text: `${isError(r) ? 'MFL didn’t answer, and your' : 'MFL accepted the save, but your'} week ${week} lineup isn’t showing there yet (${parts.join('; ')}). Below is what MFL has now; set it again and resubmit.`,
      });
      show(back);
    }
    setBusy(false);
  };

  // Queued moves for players still on the roster, and where everyone ends up once they go through.
  const onRoster = (id: string) => mine?.roster.some((p) => p.id === id) ?? false;
  const queue = Object.entries(queued).filter(([id]) => onRoster(id)) as Array<[string, MoveKey]>;
  const slotAfter = (id: string, status: Slot): Slot | null => (queued[id] ? MOVES[queued[id]].to : status);
  const countAfter = (s: Slot) => mine?.roster.filter((p) => slotAfter(p.id, p.status) === s).length ?? 0;
  const activeAfter = countAfter('ROSTER');
  const irAfter = countAfter('INJURED_RESERVE');
  const taxiAfter = countAfter('TAXI_SQUAD');
  const activeOk = (n: number) => n >= limits.rosterMin && n <= limits.rosterMax;

  /** Why a move is blocked for him, or null when it is allowed. */
  const blocked = (id: string, k: MoveKey): string | null => {
    const p = info(id);
    if (locked(id)) return `${p.name}’s game has started. Moves for him open again after it ends.`;
    if (k === 'IR') {
      if (p.injury !== 'IR') return `${p.name} isn’t on NFL injured reserve. Only players MFL lists as IR, IR-R or IR-PUP can go on IR.`;
      if (irAfter >= limits.ir) return `IR is full (${limits.ir} of ${limits.ir}, counting your queued changes). Activate or drop someone on IR first.`;
    }
    if (k === 'TAXI') {
      if (p.draftYear && p.draftYear < season - 1) return `${p.name} was drafted in ${p.draftYear}. Only first and second year players (drafted ${season - 1} or later) can go on the taxi squad.`;
      if (taxiAfter >= limits.taxi) return `The taxi squad is full (${limits.taxi} of ${limits.taxi}, counting your queued changes). Promote or drop someone on it first.`;
    }
    return null;
  };

  const sendQueued = async () => {
    const todo = SEND_ORDER.flatMap((k) => queue.filter(([, q]) => q === k).map(([id]) => ({ id, m: MOVES[k], k })));
    setBusy(true);
    const failed: Array<{ id: string; k: MoveKey; error: string }> = [];
    let signedOut = false;
    for (const [i, { id, m, k }] of todo.entries()) {
      // Once the MFL login has expired, every write after it would fail the same way.
      if (signedOut) {
        failed.push({ id, k, error: 'not sent' });
        continue;
      }
      setProgress(`SENDING ${i + 1} OF ${todo.length}…`);
      const r = await write(m.type, { [m.param]: id });
      if (isError(r)) {
        signedOut = Boolean(r.signedOut);
        failed.push({ id, k, error: r.unknown ? `${r.error} Check your roster below before trying again.` : r.error });
      }
    }
    // What MFL turned down stays queued, to fix or try again.
    setQueued(Object.fromEntries(failed.map((f) => [f.id, f.k])));
    setReviewing(false);
    setProgress(null);
    const sent = todo.length - failed.length;
    const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;
    if (signedOut) {
      setNotice({ tone: 'bad', text: `${sent ? `${changes(sent)} saved on MFL, then your` : 'Your'} MFL login expired. Sign in again (Settings); the rest are still queued.` });
    } else if (failed.length) {
      setNotice({ tone: 'bad', text: `${sent} of ${changes(todo.length)} saved on MFL. Still queued: ${failed.map((f) => `${info(f.id).name} (${f.error})`).join('; ')}` });
    } else {
      setNotice({ tone: activeOk(activeAfter) ? 'ok' : 'bad', text: `${changes(sent)} saved on MFL.${activeOk(activeAfter) ? '' : ` Your active roster is now ${activeAfter}, outside ${limits.rosterMin}–${limits.rosterMax}.`}` });
    }
    await load();
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
      // As the roster will be once the queued changes go through.
      ? [
        { value: activeAfter, label: `ACTIVE ${limits.rosterMin}–${limits.rosterMax}`, ok: activeOk(activeAfter) },
        { value: `${irAfter}/${limits.ir}`, label: 'IR', ok: irAfter <= limits.ir },
        { value: `${taxiAfter}/${limits.taxi}`, label: 'TAXI', ok: taxiAfter <= limits.taxi },
      ]
      : [];

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar
        back="/team/"
        title={mode === 'moves' ? 'MANAGE ROSTER' : mine ? `WEEK ${mine.week} LINEUP` : 'LINEUP'}
        right={mode === 'lineup' && mine && weekOk ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, marginRight: 8 }}>
            <span style={{ font: DISPLAY(20, 800), fontVariantNumeric: 'tabular-nums' }}>{one(projTotal(lineup))}</span>
            <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>PROJECTED</span>
          </span>
        ) : undefined}
      />

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
            <p style={{ margin: 0 }}>{loadError.signedOut ? SIGNED_OUT : loadError.error}</p>
            <p style={{ margin: '12px 0 0' }}>
              <Link href="/login/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Sign in with MFL</Link>
            </p>
          </div>
        )}
        {!mine && !loadError && <div style={{ padding: '24px 16px', font: '500 14px/1.5 var(--font-body)', color: 'var(--ink-3)' }}>Reading your roster from MFL…</div>}

        {mine && rows && mode === 'lineup' && (
          <>
            {!sel && overCap > 0 && (
              <div role="alert" style={{ margin: '12px 16px 0', padding: '10px 12px', background: 'var(--live-tint)', boxShadow: 'inset 3px 0 0 var(--live)', font: '500 13px/1.45 var(--font-body)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>
                  <b>You’re {money(overCap)} over the ${cap.toLocaleString('en-US')} cap</b> ({money(capNow)} with dead cap; taxi salaries don’t count).
                  MFL won’t take a lineup from a team over the cap, so submitting is off until you’re under.
                </span>
                <span>
                  Drop, IR or taxi someone in <Link href="/team/moves/" style={{ color: 'var(--volt)', fontWeight: 600 }}>Manage roster</Link>, or move salary in a <Link href="/team/trades/" style={{ color: 'var(--volt)', fontWeight: 600 }}>trade</Link>.
                </span>
              </div>
            )}
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
            <Group label={`ACTIVE · ${rows.active.length}`}>{rows.active.map((id) => <MoveRow key={id} id={id} moves={['IR', 'TAXI', 'DROP']} />)}</Group>
            <Group label={`IR · ${rows.ir.length} OF ${limits.ir}`}>
              {rows.ir.length ? rows.ir.map((id) => <MoveRow key={id} id={id} moves={['ACTIVATE', 'DROP']} />) : <Empty text="Nobody on IR." />}
            </Group>
            <Group label={`TAXI · ${rows.taxi.length} OF ${limits.taxi}`}>
              {rows.taxi.length ? rows.taxi.map((id) => <MoveRow key={id} id={id} moves={['PROMOTE', 'DROP']} />) : <Empty text="Nobody on the taxi squad." />}
            </Group>
          </>
        )}
      </div>

      {mode === 'lineup' && mine && changed && !sel && (
        <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
          <button type="button" onClick={() => { setStarters(new Set(mine.starters)); setNotice(null); }} style={btn(false)}>UNDO</button>
          <button type="button" disabled={!valid || overCap > 0 || busy} onClick={() => setConfirming(true)} style={{ ...btn(true), flex: 1, opacity: valid && !overCap ? 1 : 0.5 }}>
            {overCap > 0 ? `OVER THE CAP BY ${money(overCap)}` : !valid ? 'LINEUP NOT LEGAL YET' : weekOk ? `SUBMIT LINEUP · ${diff >= 0 ? '+' : '−'}${one(Math.abs(diff))}` : 'SUBMIT LINEUP'}
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
            <button type="button" disabled={busy || overCap > 0} onClick={submit} style={{ ...btn(true), width: '100%' }}>{progress ?? (busy ? 'SUBMITTING…' : 'SUBMIT TO MFL')}</button>
          </div>
        </BottomSheet>
      )}

      {mode === 'moves' && mine && queue.length > 0 && (
        <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
          <button type="button" disabled={busy} onClick={() => { setQueued({}); setNotice(null); }} style={{ ...btn(false), width: 96 }}>RESET</button>
          <button type="button" disabled={busy} onClick={() => { setNotice(null); setReviewing(true); }} style={{ ...btn(true), flex: 1 }}>
            SUBMIT {queue.length} {queue.length === 1 ? 'CHANGE' : 'CHANGES'}
          </button>
        </div>
      )}

      {reviewing && mine && rows && queue.length > 0 && (
        <div role="dialog" aria-label="Review roster changes" style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', background: 'var(--bg-000)' }}>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, height: 56, padding: '0 16px 0 4px', borderBottom: '1px solid var(--edge)' }}>
            <button type="button" disabled={busy} onClick={() => setReviewing(false)} aria-label="Back to Manage roster" style={{ ...iconBtn(44), color: 'var(--ink)' }}>{BackIcon}</button>
            <span style={{ flex: 1, font: DISPLAY(22, 800), letterSpacing: '.04em', whiteSpace: 'nowrap' }}>REVIEW CHANGES</span>
          </div>
          <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', background: 'var(--bg-100)', borderBottom: '1px solid var(--line)' }}>
            <RuleCell before={rows.active.length} value={activeAfter} label={`ACTIVE ${limits.rosterMin}–${limits.rosterMax}`} ok={activeOk(activeAfter)} />
            <RuleCell before={`${rows.ir.length}/${limits.ir}`} value={`${irAfter}/${limits.ir}`} label="IR" ok={irAfter <= limits.ir} />
            <RuleCell before={`${rows.taxi.length}/${limits.taxi}`} value={`${taxiAfter}/${limits.taxi}`} label="TAXI" ok={taxiAfter <= limits.taxi} />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {SEND_ORDER.map((k) => {
              const ids = rows.active.concat(rows.ir, rows.taxi).filter((id) => queued[id] === k);
              if (!ids.length) return null;
              const m = MOVES[k];
              return (
                <section key={k}>
                  <div style={{ marginTop: 4 }}><SectionHead label={`${m.group} · ${ids.length}`} /></div>
                  {ids.map((id) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 8px 0 16px', borderBottom: '1px solid var(--line)' }}>
                      <PlayerLink playerId={id} style={{ ...NAME_CELL, gap: 3 }}>
                        <span style={{ font: '600 14px/1.2 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info(id).name}</span>
                        <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                          <b style={{ fontWeight: 700, color: posColor(info(id).pos) }}>{info(id).pos || '—'}</b> · <span style={{ color: m.danger ? 'var(--fall)' : undefined }}>{m.path}</span>
                        </span>
                      </PlayerLink>
                      <button type="button" disabled={busy} onClick={() => unqueue(id)} aria-label={`Remove ${info(id).name} from these changes`} style={{ ...btn(false), height: 36, padding: 0, width: 64, font: DISPLAY(11.5), letterSpacing: '.06em', color: 'var(--ink-2)' }}>REMOVE</button>
                    </div>
                  ))}
                  <p style={{ margin: 0, padding: '8px 16px 4px', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>{m.note}</p>
                </section>
              );
            })}
            <p style={{ margin: 0, padding: '16px 16px 24px', font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
              Sent to MFL in this order: drops, then IR and taxi moves, then activations and promotions. If MFL rejects one, the rest still go through and it stays queued.
            </p>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 16px calc(14px + env(safe-area-inset-bottom))', background: 'var(--bg-100)', borderTop: '1px solid var(--edge)' }}>
            <button type="button" disabled={busy} onClick={sendQueued} style={{ ...btn(true), width: '100%', height: 48 }}>
              {progress ?? `SUBMIT ${queue.length} ${queue.length === 1 ? 'CHANGE' : 'CHANGES'} TO MFL`}
            </button>
            <button type="button" disabled={busy} onClick={() => setReviewing(false)} style={{ ...btn(false), width: '100%', border: 0, color: 'var(--ink-2)' }}>KEEP EDITING</button>
          </div>
        </div>
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
          <span style={{ ...head, width: COL.proj }}>PROJ</span>
          <span style={{ ...head, width: COL.ppg }}>PPG</span>
          {stats && <span style={{ ...head, width: COL.pct }}>START%</span>}
          <span style={{ flex: 'none', width: stats ? COL.slot : 112 }} />
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
      return <span role="img" aria-label={`${label}: locked, his game has started`} style={{ ...actBtn('lockedOutline'), opacity: sel ? 0.5 : 1 }}>{LockIcon}</span>;
    }
    if (!sel) return <button type="button" aria-label={`Swap ${label}`} onClick={() => pick(id)} style={actBtn('outline')}>{SwapIcon}</button>;
    if (sel === id) return <button type="button" aria-label="Cancel swap" onClick={cancel} style={actBtn('ring')}>{CloseIcon}</button>;
    const b = outcome(id);
    if (b === null) return <span style={{ width: COL.act }} />;
    if (!b.length) return <button type="button" aria-label={`${targetText} ${label}`} onClick={() => apply(id)} style={{ ...actBtn('ready'), font: DISPLAY(12), letterSpacing: '.08em' }}>{targetText}</button>;
    return <button type="button" aria-label={`${label}: not allowed, tap for why`} onClick={() => explain(id, label)} style={{ ...actBtn('outline'), opacity: 0.3 }}>{SwapIcon}</button>;
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
        <PlayerLink playerId={id} style={NAME_CELL}>
          <Name id={id} tag={tag} />
          <Line id={id} />
        </PlayerLink>
        <span style={{ ...num, width: COL.proj, font: DISPLAY(17), color: bad ? 'var(--live)' : starting ? 'var(--ink)' : 'var(--ink-2)' }}>{pr === null ? '—' : one(pr)}</span>
        <span style={{ ...num, width: COL.ppg }}>{p.ppg ? one(p.ppg) : '—'}</span>
        <span style={{ ...num, width: COL.pct }}>{p.startPct === undefined || p.startPct === null ? '—' : `${Math.round(p.startPct)}%`}</span>
        <span style={{ flex: 'none', width: COL.slot, display: 'flex', justifyContent: 'flex-end' }}>
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
        <span style={{ flex: 'none', width: COL.slot, display: 'flex', justifyContent: 'flex-end' }}>
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
        <span style={{ flex: 'none', width: COL.slot, display: 'flex', justifyContent: 'flex-end' }}>
          <Action id="bench" label="the empty bench spot" targetText="BENCH" />
        </span>
      </div>
    );
  }

  function unqueue(id: string) {
    setQueued((q) => {
      const next = { ...q };
      delete next[id];
      if (!Object.keys(next).length) setReviewing(false);
      return next;
    });
  }

  function MoveRow({ id, moves }: { id: string; moves: MoveKey[] }) {
    const p = info(id);
    const num: CSSProperties = { flex: 'none', textAlign: 'right', font: '500 13px/1 var(--font-body)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' };
    const pr = proj(id);
    const q = queued[id] ? MOVES[queued[id]] : null;
    const width = (k: MoveKey) => (moves.length === 3 || MOVES[k].danger ? 44 : 92);
    return (
      <div style={{ ...rowStyle(null), background: q ? (q.danger ? DROP_TINT : QUEUE_TINT) : undefined, boxShadow: q ? `inset 3px 0 0 ${q.danger ? 'var(--fall)' : 'var(--volt)'}` : undefined }}>
        <PlayerLink playerId={id} style={NAME_CELL}>
          <Name id={id} />
          {q ? (
            <span style={{ font: DISPLAY(11), letterSpacing: '.08em', color: q.danger ? 'var(--fall)' : 'var(--volt)', whiteSpace: 'nowrap' }}>{q.tag} · QUEUED</span>
          ) : <Line id={id} />}
        </PlayerLink>
        <span style={{ ...num, width: COL.proj, font: DISPLAY(17), color: 'var(--ink)' }}>{pr === null ? '—' : one(pr)}</span>
        <span style={{ ...num, width: COL.ppg }}>{p.ppg ? one(p.ppg) : '—'}</span>
        <span style={{ flex: 'none', width: 140, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
          {q ? (
            <button type="button" disabled={busy} onClick={() => unqueue(id)} aria-label={`Undo ${q.label} for ${p.name}`} style={{ ...moveBtn('undo'), width: 92 }}>UNDO</button>
          ) : moves.map((k) => {
            const m = MOVES[k];
            const why = blocked(id, k);
            return (
              <button
                key={k}
                type="button"
                disabled={busy}
                aria-disabled={why ? true : undefined}
                aria-label={`${m.label} ${p.name}${why ? ' (not available, tap for why)' : ''}`}
                onClick={() => (why ? setNotice({ tone: 'bad', text: why }) : (setNotice(null), setQueued((qs) => ({ ...qs, [id]: k }))))}
                style={{ ...moveBtn(why ? 'off' : m.danger ? 'danger' : m.suggest ? 'fill' : 'outline'), width: width(k) }}
              >
                {m.label}
              </button>
            );
          })}
        </span>
      </div>
    );
  }
}

/** The name + matchup block of a row; tapping it opens the player card. */
const NAME_CELL: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'stretch', justifyContent: 'center' };

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '14px 16px', font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>{text}</div>;
}

/** One rule's count, red when outside the league's rules; with `before`, shown as "before → value". */
function RuleCell({ value, label, ok, before }: { value: string | number; label: string; ok: boolean; before?: string | number }) {
  return (
    <div title={ok ? undefined : 'Outside the league’s rules'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, height: before === undefined ? 46 : 52, background: ok ? undefined : 'var(--live-tint)', boxShadow: ok ? undefined : 'inset 0 -2px 0 var(--live)' }}>
      <span style={{ font: DISPLAY(before === undefined ? 17 : 16), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: ok ? 'var(--ink)' : 'var(--live)' }}>
        {before !== undefined && <span style={{ color: 'var(--ink-3)' }}>{before} → </span>}
        {value}
      </span>
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
const LockIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const BackIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
);
const CloseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);

function actBtn(kind: 'ready' | 'outline' | 'ring' | 'locked' | 'lockedOutline'): CSSProperties {
  const locked = kind === 'locked' || kind === 'lockedOutline';
  return {
    flex: 'none', width: COL.act, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    cursor: locked ? 'default' : 'pointer',
    border: `1.5px solid ${kind === 'locked' ? 'transparent' : kind === 'lockedOutline' ? LOCKED_BG : 'var(--volt)'}`,
    background: kind === 'ready' ? 'var(--volt)' : kind === 'locked' ? LOCKED_BG : 'transparent',
    color: kind === 'ready' ? 'var(--on-volt)' : kind === 'outline' ? 'var(--volt)' : locked ? LOCKED_INK : 'var(--ink)',
  };
}

/** Manage roster buttons: filled for the move his status points to, outlined otherwise, orange for a drop, grey when a rule blocks it. */
function moveBtn(kind: 'fill' | 'outline' | 'danger' | 'off' | 'undo'): CSSProperties {
  return {
    flex: 'none', height: 36, padding: 0, borderRadius: 2, cursor: 'pointer', font: DISPLAY(11.5), letterSpacing: '.06em',
    border: `1px solid ${kind === 'off' ? 'var(--line)' : kind === 'danger' ? 'var(--fall)' : kind === 'undo' ? 'var(--edge)' : 'var(--volt)'}`,
    background: kind === 'fill' ? 'var(--volt)' : kind === 'off' ? 'var(--bg-200)' : 'transparent',
    color: kind === 'fill' ? 'var(--on-volt)' : kind === 'off' ? 'var(--ink-3)' : kind === 'danger' ? 'var(--fall)' : 'var(--ink)',
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
