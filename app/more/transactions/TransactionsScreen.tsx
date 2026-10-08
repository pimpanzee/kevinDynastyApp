'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import FadedTeamLogo from '@/components/FadedTeamLogo';
import HeaderBar, { HeaderLabel } from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import { SectionTitle, StickySectionHeader } from '@/components/ListChrome';
import PhoneFrame from '@/components/PhoneFrame';
import { PlayerLink } from '@/components/PlayerCard';
import StatusBar from '@/components/StatusBar';
import TeamAvatar from '@/components/TeamAvatar';
import { fmtMoney } from '@/lib/format';
import { useMyTeam } from '@/lib/myTeam';
import type { TransactionsData, TxAsset, TxMove, TxPlayer } from '@/lib/types';

/**
 * The league's in-season moves, newest first and read-only: waiver runs,
 * free-agent adds and drops, trades, IR and taxi moves. One team filter;
 * every player name opens the player card.
 */

type Team = TransactionsData['franchises'][number];
/** 'all', 'mine', or a franchise id. */
type Filter = string;

const PAGE = 100;
const MINE_BG = 'color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))';

const involves = (m: TxMove, id: string) =>
  m.franchiseId === id || !!m.trade?.sides.some((s) => s.franchiseId === id);

/** A waiver run (claims sharing a processing time) or a single move. */
type Block = { kind: 'run'; day: string; claims: TxMove[] } | { kind: 'move'; move: TxMove };
interface Section { week: number; blocks: Block[] }

function sections(moves: TxMove[]): Section[] {
  const out: Section[] = [];
  for (const m of moves) {
    let sec = out[out.length - 1];
    if (!sec || sec.week !== m.week) out.push((sec = { week: m.week, blocks: [] }));
    const last = sec.blocks[sec.blocks.length - 1];
    if (m.kind !== 'waivers') sec.blocks.push({ kind: 'move', move: m });
    else if (last?.kind === 'run' && last.claims[0]!.timestamp === m.timestamp) last.claims.push(m);
    else sec.blocks.push({ kind: 'run', day: m.day, claims: [m] });
  }
  return out;
}

function weekLabel(week: number, current: number): string {
  if (week === current) return 'THIS WEEK';
  if (week === current - 1) return 'LAST WEEK';
  return `WEEK ${week}`;
}

export default function TransactionsScreen() {
  const [data, setData] = useState<TransactionsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/transactions.json`);
      if (!res.ok) throw new Error(`Transactions request failed (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load transactions');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const myTeam = useMyTeam(data?.myFranchiseId ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  // A new filter starts back at the top of the list.
  useEffect(() => { setLimit(PAGE); }, [filter]);

  // Owner icons are big remote images (one animated GIF is ~12MB). They're
  // asked for only once the feed has painted — a second animation frame
  // comes after one has — so they never hold up the first render.
  const [icons, setIcons] = useState(false);
  useEffect(() => {
    if (!data) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setIcons(true)); });
    return () => cancelAnimationFrame(id);
  }, [data]);

  const teams = useMemo(() => new Map(data?.franchises.map((f) => [f.id, f])), [data]);
  const team = useCallback(
    (id: string): Team => {
      const f = teams.get(id) ?? { id, name: id ? `Team ${id}` : 'League', abbrev: id, icon: null };
      return icons ? f : { ...f, icon: null };
    },
    [teams, icons],
  );

  const selected = filter === 'mine' ? myTeam : filter === 'all' ? null : filter;
  const moves = useMemo(
    () => (data ? (selected ? data.moves.filter((m) => involves(m, selected)) : data.moves) : []),
    [data, selected],
  );
  const shown = useMemo(() => sections(moves.slice(0, limit)), [moves, limit]);

  const chips: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'ALL' },
    { id: 'mine', label: 'MY TEAM' },
    ...(data?.franchises ?? []).map((f) => ({ id: f.id, label: f.abbrev.toUpperCase() })),
  ];

  return (
    <PhoneFrame>
      <StatusBar label="TRANSACTIONS" />
      <HeaderBar right={<HeaderLabel>TRANSACTIONS</HeaderLabel>} />

      <div
        role="radiogroup"
        aria-label="Team"
        style={{ flex: 'none', overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none', borderBottom: '2px solid var(--color-text)' }}
      >
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', width: 'max-content' }}>
          {chips.map((c) => {
            const on = c.id === filter;
            const name = c.id === 'all' ? 'All teams' : c.id === 'mine' ? 'My team' : team(c.id).name;
            return (
              <button
                key={c.id}
                role="radio"
                aria-checked={on}
                title={name}
                onClick={() => setFilter(c.id)}
                style={{
                  height: 30, padding: '0 11px', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: on ? 'var(--color-accent)' : 'none',
                  color: on ? 'var(--color-bg)' : 'var(--color-text)',
                  border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                  font: '800 11px var(--font-heading)', letterSpacing: '.06em',
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data ? (
          <Skeleton />
        ) : moves.length === 0 ? (
          <Empty name={selected ? team(selected).name : null} />
        ) : (
          <>
            {shown.map((sec) => (
              <section key={sec.week} aria-label={weekLabel(sec.week, data.currentWeek)}>
                <StickySectionHeader padding="14px 14px 8px">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <SectionTitle>{weekLabel(sec.week, data.currentWeek)}</SectionTitle>
                    {sec.week >= data.currentWeek - 1 && <Meta>WEEK {sec.week}</Meta>}
                  </div>
                </StickySectionHeader>
                {sec.blocks.map((b) =>
                  b.kind === 'run' ? (
                    <WaiverRun key={`run-${b.claims[0]!.id}`} day={b.day} claims={b.claims} team={team} myTeam={myTeam} />
                  ) : b.move.kind === 'trade' ? (
                    <TradeCard key={b.move.id} move={b.move} team={team} myTeam={myTeam} />
                  ) : (
                    <MoveRow key={b.move.id} move={b.move} team={team(b.move.franchiseId)} mine={b.move.franchiseId === myTeam} />
                  ),
                )}
              </section>
            ))}
            {moves.length > limit && (
              <div style={{ padding: '14px', display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setLimit((n) => n + PAGE)}
                  style={{ font: '800 11px var(--font-heading)', letterSpacing: '.06em' }}
                >
                  LOAD MORE · {moves.length - limit} LEFT
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** Small all-caps secondary text: positions, times, labels. */
function Meta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ font: '800 9px var(--font-heading)', letterSpacing: '.07em', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
}

function Tag({ children, accent = false, outline = false }: { children: ReactNode; accent?: boolean; outline?: boolean }) {
  return (
    <span
      className={outline ? 'tag tag-outline' : accent ? 'tag tag-accent' : 'tag tag-neutral'}
      style={{ flex: 'none', fontSize: 8.5, padding: '2px 6px', whiteSpace: 'nowrap', borderRadius: 0 }}
    >
      {children}
    </span>
  );
}

const Commish = () => <Tag outline>COMMISH</Tag>;

/** "Christian McCaffrey" with an injury tag, and "RB · SFO" — or "Unknown player". */
function PlayerName({ p, size = 13 }: { p: TxPlayer; size?: number }) {
  return (
    <>
      <span style={{ font: `600 ${size}px/1.25 var(--font-body)`, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {/* Padded out to a 24px tap target without changing the line's height. */}
        <PlayerLink playerId={p.card ? p.id : undefined} style={{ display: 'inline-block', padding: '5px 0', margin: '-5px 0' }}>
          {p.name}
        </PlayerLink>
      </span>
      <InjuryTag tag={p.injury} />
    </>
  );
}

const posTeam = (p: TxPlayer) => [p.pos, p.nflTeam].filter(Boolean).join(' · ');

/** "+ Player  RB · SFO" or "− Player", with an optional tag at the end. */
function PlayerLine({ p, sign, tag }: { p: TxPlayer; sign: '+' | '−'; tag?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, minHeight: 24 }}>
      <span
        aria-label={sign === '+' ? 'Added' : 'Dropped'}
        style={{ width: 10, flex: 'none', font: '800 13px/1 var(--font-heading)', color: sign === '+' ? 'var(--color-text)' : 'var(--color-accent-700)' }}
      >
        {sign}
      </span>
      <PlayerName p={p} />
      {posTeam(p) && <Meta>{posTeam(p)}</Meta>}
      {tag && <span style={{ marginLeft: 'auto', display: 'flex' }}>{tag}</span>}
    </div>
  );
}

/** Team name over its move, with an icon on the left. */
function RowShell({ team, mine, right, children }: { team: Team; mine: boolean; right: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-divider)',
        background: mine ? MINE_BG : undefined,
      }}
    >
      <TeamAvatar name={team.name} icon={team.icon} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
          <span style={{ font: `${mine ? 800 : 700} 12.5px/1.2 var(--font-body)`, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {team.name}
          </span>
          <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>{right}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function WaiverRun({ day, claims, team, myTeam }: { day: string; claims: TxMove[]; team: (id: string) => Team; myTeam: string }) {
  return (
    <div>
      <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid var(--color-divider)' }}>
        <Meta style={{ fontSize: 10, letterSpacing: '.14em' }}>WAIVERS · {day}</Meta>
      </div>
      {claims.map((c) => (
        <RowShell
          key={c.id}
          team={team(c.franchiseId)}
          mine={c.franchiseId === myTeam}
          right={
            <>
              {c.byCommish && <Commish />}
              <span style={{ font: '800 14px var(--font-heading)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(c.bid ?? 0)}</span>
            </>
          }
        >
          {c.adds.map((p) => <PlayerLine key={`a${p.id}`} p={p} sign="+" />)}
          {c.drops.map((p) => <PlayerLine key={`d${p.id}`} p={p} sign="−" />)}
        </RowShell>
      ))}
    </div>
  );
}

/** A free-agent add, drop or add/drop, or an IR or taxi move. */
function MoveRow({ move, team, mine }: { move: TxMove; team: Team; mine: boolean }) {
  const slot = move.kind === 'ir' ? 'IR' : move.kind === 'taxi' ? 'TAXI' : null;
  return (
    <RowShell
      team={team}
      mine={mine}
      right={
        <>
          {move.byCommish && <Commish />}
          <Meta>{move.when}</Meta>
        </>
      }
    >
      {slot ? (
        <>
          {move.drops.map((p) => <PlayerLine key={`d${p.id}`} p={p} sign="−" tag={<Tag accent>TO {slot}</Tag>} />)}
          {move.adds.map((p) => <PlayerLine key={`a${p.id}`} p={p} sign="+" tag={<Tag>OFF {slot}</Tag>} />)}
        </>
      ) : (
        <>
          {move.adds.map((p) => <PlayerLine key={`a${p.id}`} p={p} sign="+" />)}
          {move.drops.map((p) => <PlayerLine key={`d${p.id}`} p={p} sign="−" />)}
        </>
      )}
    </RowShell>
  );
}

/** Two sides, each with what it gave up, under its faded team logo. */
function TradeCard({ move, team, myTeam }: { move: TxMove; team: (id: string) => Team; myTeam: string }) {
  const sides = move.trade?.sides ?? [];
  return (
    <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Meta style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--color-accent-700)' }}>TRADE</Meta>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {move.byCommish && <Commish />}
          <Meta>{move.when}</Meta>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sides.length || 1}, minmax(0, 1fr))`, border: '1px solid var(--color-divider)' }}>
        {sides.map((s, i) => {
          const t = team(s.franchiseId);
          const mine = s.franchiseId === myTeam;
          return (
            <div key={s.franchiseId + i} style={{ minWidth: 0, borderLeft: i ? '1px solid var(--color-divider)' : undefined, background: mine ? MINE_BG : undefined }}>
              <div style={{ position: 'relative', height: 44, overflow: 'hidden', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-divider)' }}>
                <FadedTeamLogo name={t.name} icon={t.icon} />
                {mine && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--color-accent)' }} />}
                <span
                  style={{
                    position: 'relative', margin: '0 8px 0 34px',
                    font: `${mine ? 800 : 700} 12px/1.15 var(--font-body)`,
                    textWrap: 'balance', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    textShadow: '0 0 6px var(--color-bg), 0 0 2px var(--color-bg)',
                  }}
                >
                  {t.name}
                </span>
              </div>
              <div style={{ padding: '7px 8px 9px' }}>
                <Meta>GAVE</Meta>
                {s.gave.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginTop: 4 }}>Nothing</div>}
                {s.gave.map((a, j) => <Asset key={j} a={a} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Asset({ a }: { a: TxAsset }) {
  if (a.type === 'pick') {
    return <div style={{ font: '600 12px/1.25 var(--font-body)', marginTop: 6 }}>{a.label}</div>;
  }
  return (
    <div style={{ marginTop: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <PlayerName p={a} size={12} />
      </div>
      {posTeam(a) && <Meta style={{ display: 'block', marginTop: 2 }}>{posTeam(a)}</Meta>}
    </div>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

const bar = (w: number | string, h: number): CSSProperties => ({
  width: w, height: h, background: 'var(--color-neutral-200)', flex: 'none',
});

/** Placeholder rows in the real rows' shape while the file loads. */
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading transactions" style={{ animation: 'blip 1.6s infinite' }}>
      <div style={{ padding: '14px 14px 8px', borderBottom: '2px solid var(--color-text)' }}>
        <span style={{ ...bar(72, 11), display: 'block' }} />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-divider)' }}>
          <span style={{ ...bar(30, 30), borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={bar('45%', 12)} />
              <span style={bar(40, 12)} />
            </span>
            <span style={bar('70%', 10)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ name }: { name: string | null }) {
  return (
    <div style={{ padding: '24px 14px' }}>
      <div style={{ font: '800 11px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>NO MOVES</div>
      <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
        {name ? `No moves for ${name} yet.` : 'No in-season moves yet.'}
      </p>
    </div>
  );
}

/** The app's error state (app/error.tsx), inline. */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '24px 14px' }}>
      <div style={{ font: '800 11px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>COULD NOT LOAD</div>
      <p style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
        The transactions didn&apos;t load.
      </p>
      <p style={{ marginTop: 12, fontSize: 11, lineHeight: 1.5, color: 'var(--color-neutral-600)', borderLeft: '2px solid var(--color-divider)', paddingLeft: 9 }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        style={{
          marginTop: 20, height: 36, padding: '0 14px', cursor: 'pointer',
          background: 'var(--color-accent)', color: 'var(--color-bg)', border: 0,
          font: '800 11px var(--font-heading)', letterSpacing: '.06em',
        }}
      >
        TRY AGAIN
      </button>
    </div>
  );
}
