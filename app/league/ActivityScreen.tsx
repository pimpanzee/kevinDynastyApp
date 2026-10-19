'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PlayerLink } from '@/components/PlayerCard';
import LeagueFrame from '@/components/league/LeagueFrame';
import { MINE_ROW } from '@/components/league/TeamChip';
import { posColor } from '@/components/pos';
import SectionHead from '@/components/team/SectionHead';
import { DISPLAY, money } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import TeamLink from '@/components/league/TeamLink';
import type { TransactionsData, TxAsset, TxMove, TxPlayer } from '@/lib/types';

/**
 * League › Activity: every in-season move, newest first, grouped by week.
 * A daily waiver run is one entry with a block per team; trades show what
 * each side got. Filtered by kind only.
 */

type Kind = 'ALL' | 'TRADES' | 'WAIVERS' | 'DROPS' | 'IR / TAXI';
const KINDS: Kind[] = ['ALL', 'TRADES', 'WAIVERS', 'DROPS', 'IR / TAXI'];
const KIND_OF: Record<TxMove['kind'], Kind> = {
  trade: 'TRADES', waivers: 'WAIVERS', add: 'DROPS', drop: 'DROPS', ir: 'IR / TAXI', taxi: 'IR / TAXI',
};
const TAG: Record<TxMove['kind'], string> = { trade: 'TRADE', waivers: 'WAIVER', add: 'FREE AGENT', drop: 'DROP', ir: 'IR', taxi: 'TAXI' };
const PAGE = 80;

/** A waiver run (claims sharing a processing time) or a single move. */
type Entry = { run: true; claims: TxMove[] } | { run: false; move: TxMove };

function group(moves: TxMove[]): Array<{ week: number; entries: Entry[] }> {
  const out: Array<{ week: number; entries: Entry[] }> = [];
  for (const m of moves) {
    let sec = out[out.length - 1];
    if (!sec || sec.week !== m.week) out.push((sec = { week: m.week, entries: [] }));
    const last = sec.entries[sec.entries.length - 1];
    if (m.kind !== 'waivers') sec.entries.push({ run: false, move: m });
    else if (last?.run && last.claims[0]!.timestamp === m.timestamp) last.claims.push(m);
    else sec.entries.push({ run: true, claims: [m] });
  }
  return out;
}

const yrs = (n: number) => `${n} ${n === 1 ? 'YR' : 'YRS'}`;
/** "Thu 9:14 PM" from "THU OCT 8 · 9:14 PM". */
const shortWhen = (when: string) => {
  const [d, t] = when.split(' · ');
  const wd = d.split(' ')[0];
  return `${wd[0]}${wd.slice(1).toLowerCase()} ${t}`;
};

export default function ActivityScreen() {
  const [data, setData] = useState<TransactionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/transactions.json`);
      if (!res.ok) throw new Error(`Activity request failed (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mine = useMyTeam(data?.myFranchiseId ?? '');
  const [kind, setKind] = useState<Kind>('ALL');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [kind]);
  const name = useMemo(() => {
    const m = new Map(data?.franchises.map((f) => [f.id, f.name]));
    return (id: string) => m.get(id) ?? (id ? `Team ${id}` : 'League');
  }, [data]);

  const moves = useMemo(() => (data?.moves ?? []).filter((m) => kind === 'ALL' || KIND_OF[m.kind] === kind), [data, kind]);
  const sections = useMemo(() => group(moves.slice(0, limit)), [moves, limit]);
  const current = data?.currentWeek ?? 0;
  const weekLabel = (w: number) => (w === current ? 'THIS WEEK' : w === current - 1 ? 'LAST WEEK' : `WEEK ${w}`);

  return (
    <LeagueFrame>
      <div role="group" aria-label="Kind of move" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {KINDS.map((k) => {
          const on = k === kind;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)} style={{ flex: 'none', height: 28, padding: '0 10px', borderRadius: 2, border: `1px solid ${on ? 'var(--edge)' : 'var(--line)'}`, background: on ? 'var(--bg-300)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)', font: DISPLAY(11), letterSpacing: '.1em', cursor: 'pointer' }}>{k}</button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {error ? (
          <div style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>
            {error}. <button type="button" onClick={load} style={{ border: 0, background: 'none', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Try again</button>
          </div>
        ) : !data ? (
          <div aria-busy="true" style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)', animation: 'blip 1.6s infinite' }}>Loading…</div>
        ) : sections.length === 0 ? (
          <div style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>Nothing yet.</div>
        ) : sections.map((sec, i) => (
          <div key={sec.week}>
            <SectionHead gap={i > 0} label={weekLabel(sec.week)} right={`WEEK ${sec.week} · ${sec.entries.length} ${sec.entries.length === 1 ? 'MOVE' : 'MOVES'}`} />
            {sec.entries.map((e) => (e.run
              ? <WaiverRun key={e.claims[0]!.id} claims={e.claims} mine={mine} name={name} />
              : <Move key={e.move.id} m={e.move} mine={mine} name={name} />))}
          </div>
        ))}
        {moves.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} style={{ display: 'block', width: '100%', height: 48, border: 0, background: 'none', color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em', cursor: 'pointer' }}>SHOW MORE</button>
        )}
        <div style={{ height: 20 }} />
      </div>
    </LeagueFrame>
  );
}

function Head({ tag, title, when, commish }: { tag: string; title: ReactNode; when: string; commish?: boolean }) {
  const trade = tag === 'TRADE';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 'none', font: DISPLAY(10), letterSpacing: '.08em', padding: '3px 5px', borderRadius: 2, background: trade ? 'var(--volt)' : 'var(--bg-300)', color: trade ? 'var(--on-volt)' : 'var(--ink)' }}>{tag}</span>
      <span style={{ minWidth: 0, font: DISPLAY(14), letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 0 4px', margin: '-2px 0 -4px' }}>{title}</span>
      {commish && <span style={{ flex: 'none', font: DISPLAY(9.5), letterSpacing: '.08em', padding: '2px 4px', border: '1px solid var(--edge)', borderRadius: 2, color: 'var(--ink-2)' }}>COMMISH</span>}
      <span style={{ marginLeft: 'auto', flex: 'none', font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)' }}>{when}</span>
    </div>
  );
}

/** One player moved: + added, − dropped, → status change; an add shows his contract. */
function Line({ sign, p, note, noteTone }: { sign: '+' | '−' | '→'; p: TxPlayer; note?: string; noteTone?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: 6, padding: '5px 0' }}>
      <span aria-label={sign === '+' ? 'Added' : sign === '−' ? 'Dropped' : 'Moved'} style={{ font: DISPLAY(15, 800), color: sign === '+' ? 'var(--rise)' : sign === '−' ? 'var(--fall)' : 'var(--ink-3)' }}>{sign}</span>
      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ font: '600 13px/1.25 var(--font-body)' }}><PlayerLink playerId={p.card ? p.id : undefined}>{p.name}</PlayerLink></span>{' '}
        <span style={{ font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)' }}><b style={{ fontWeight: 700, color: posColor(p.pos) }}>{p.pos}</b>{p.nflTeam ? ` · ${p.nflTeam}` : ''}</span>
      </span>
      <span style={{ font: '600 12px/1 var(--font-body)', color: noteTone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{note}</span>
    </div>
  );
}

const contractNote = (p: TxPlayer, bid?: number) =>
  p.salary !== undefined ? `${money(p.salary)} · ${yrs(p.years ?? 1)}` : bid ? money(bid) : undefined;

function WaiverRun({ claims, mine, name }: { claims: TxMove[]; mine: string; name: (id: string) => string }) {
  // One block per team, in claim order.
  const teams: string[] = [];
  for (const c of claims) if (!teams.includes(c.franchiseId)) teams.push(c.franchiseId);
  const n = claims.length;
  return (
    <div style={{ padding: '10px 16px 11px', borderBottom: '1px solid var(--line)' }}>
      <Head tag="WAIVER" title={`Waiver run · ${n} ${n === 1 ? 'claim' : 'claims'}`} when={shortWhen(claims[0]!.when)} />
      {teams.map((t) => (
        <div key={t} style={{ margin: '8px -16px 0', padding: '2px 16px 0', ...(t === mine ? MINE_ROW : {}) }}>
          <div style={{ paddingTop: 6, font: DISPLAY(12), letterSpacing: '.06em', color: 'var(--ink-2)', textTransform: 'uppercase' }}><TeamLink id={t} mine={mine} underline>{name(t)}</TeamLink></div>
          {claims.filter((c) => c.franchiseId === t).flatMap((c) => [
            ...c.adds.map((p) => <Line key={`a${c.id}${p.id}`} sign="+" p={p} note={contractNote(p, c.bid)} />),
            ...c.drops.map((p) => <Line key={`d${c.id}${p.id}`} sign="−" p={p} />),
          ])}
        </div>
      ))}
    </div>
  );
}

function Move({ m, mine, name }: { m: TxMove; mine: string; name: (id: string) => string }) {
  const isMine = m.franchiseId === mine || !!m.trade?.sides.some((s) => s.franchiseId === mine);
  const row = { padding: '10px 16px 11px', borderBottom: '1px solid var(--line)', ...(isMine ? MINE_ROW : {}) };
  const when = shortWhen(m.when);
  if (m.kind === 'trade' && m.trade) {
    const [a, b] = m.trade.sides;
    // Each column is what that team got: the other side's assets.
    const cols = [{ team: a.franchiseId, got: b?.gave ?? [] }, { team: b?.franchiseId ?? '', got: a.gave }];
    return (
      <div style={row}>
        <Head tag="TRADE" title={<><TeamLink id={a.franchiseId} mine={mine} underline>{name(a.franchiseId)}</TeamLink><span style={{ color: 'var(--ink-2)' }}> ⇄ </span><TeamLink id={b?.franchiseId} mine={mine} underline>{name(b?.franchiseId ?? '')}</TeamLink></>} when={when} commish={m.byCommish} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginTop: 8, border: '1px solid var(--line)', borderRadius: 4 }}>
          {cols.map((c, i) => (
            <div key={i} style={{ minWidth: 0, padding: '8px 10px', borderLeft: i ? '1px solid var(--line)' : undefined }}>
              <div style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{name(c.team)} GET</div>
              {c.got.map((x, j) => <Asset key={j} a={x} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  const lines = m.kind === 'ir' || m.kind === 'taxi'
    ? [
        ...m.drops.map((p) => <Line key={`d${p.id}`} sign="→" p={p} note={m.kind === 'ir' ? 'TO IR' : 'TO TAXI'} noteTone="var(--ink-2)" />),
        ...m.adds.map((p) => <Line key={`a${p.id}`} sign="→" p={p} note={m.kind === 'ir' ? 'OFF IR' : 'OFF TAXI'} noteTone="var(--ink-2)" />),
      ]
    : [
        ...m.adds.map((p) => <Line key={`a${p.id}`} sign="+" p={p} note={contractNote(p)} />),
        ...m.drops.map((p) => <Line key={`d${p.id}`} sign="−" p={p} />),
      ];
  return (
    <div style={row}>
      <Head tag={TAG[m.kind]} title={<TeamLink id={m.franchiseId} mine={mine} underline>{name(m.franchiseId)}</TeamLink>} when={when} commish={m.byCommish} />
      <div style={{ marginTop: 6 }}>{lines}</div>
    </div>
  );
}

function Asset({ a }: { a: TxAsset }) {
  if (a.type === 'pick') {
    return (
      <div style={{ marginTop: 6, minWidth: 0 }}>
        <div style={{ font: '600 13px/1.25 var(--font-body)' }}>{a.label}</div>
        <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)' }}><b style={{ fontWeight: 700, color: 'var(--pos-pick)' }}>PICK</b> · {a.from}</div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6, minWidth: 0 }}>
      <div style={{ font: '600 13px/1.25 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><PlayerLink playerId={a.card ? a.id : undefined}>{a.name}</PlayerLink></div>
      <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <b style={{ fontWeight: 700, color: posColor(a.pos) }}>{a.pos}</b>{a.nflTeam ? ` · ${a.nflTeam}` : ''}{a.salary !== undefined ? ` · ${money(a.salary)} · ${yrs(a.years ?? 1)}` : ''}
      </div>
    </div>
  );
}
