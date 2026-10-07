'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import { useMyTeam } from '@/lib/myTeam';
import { NFL_COLORS } from '@/lib/nflColors';
import type { PlayerRow, PlayerStatKey, PlayerStats, PlayersData } from '@/lib/types';

/**
 * Every QB/RB/WR/TE in the league, read-only: who's available, how they
 * project and how they've scored. Search, availability, position and mode all
 * filter the same list; tapping any stat header sorts by it.
 */

type Mode = 'proj' | 'last' | 'total' | 'avg';
type Pos = 'ALL' | PlayerRow['pos'];
type SortKey = 'pts' | PlayerStatKey | 'gp' | 'fpts' | 'ppg';

const PAGE = 100;
const POSITIONS: Pos[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];

const STAT_LABEL: Record<PlayerStatKey, string> = {
  pass_yd: 'PASS YD', pass_td: 'PASS TD', pass_int: 'INT',
  rush_att: 'RUSH ATT', rush_yd: 'RUSH YD', rush_td: 'RUSH TD',
  rec_tgt: 'TGT', rec: 'REC', rec_yd: 'REC YD', rec_td: 'REC TD',
};

const COLUMNS: Record<PlayerRow['pos'], PlayerStatKey[]> = {
  QB: ['pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td'],
  RB: ['rush_att', 'rush_yd', 'rush_td', 'rec_tgt', 'rec', 'rec_yd', 'rec_td'],
  WR: ['rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rush_yd'],
  TE: ['rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rush_yd'],
};

/** A row's numbers under the current mode; null where there's nothing to show. */
function figures(p: PlayerRow, mode: Mode): { pts: number | null; stats: PlayerStats | null; gp: number; ppg: number | null } {
  const { gp, pts: total } = p.season;
  const ppg = gp > 0 ? total / gp : null;
  switch (mode) {
    case 'proj':
      return { pts: p.proj.pts, stats: p.proj.pts === null ? null : p.proj.stats, gp, ppg };
    case 'last':
      return { pts: p.lastWeek?.pts ?? null, stats: p.lastWeek?.stats ?? null, gp, ppg };
    case 'total':
      return { pts: gp > 0 || total ? total : null, stats: gp > 0 ? p.season.stats : null, gp, ppg };
    case 'avg': {
      if (gp === 0) return { pts: null, stats: null, gp, ppg };
      const stats: PlayerStats = {};
      for (const [k, v] of Object.entries(p.season.stats)) stats[k as PlayerStatKey] = v / gp;
      return { pts: ppg, stats, gp, ppg };
    }
  }
}

function sortValue(p: PlayerRow, mode: Mode, key: SortKey): number | null {
  const f = figures(p, mode);
  if (key === 'pts') return f.pts;
  if (key === 'gp') return f.gp;
  if (key === 'fpts') return p.season.pts;
  if (key === 'ppg') return f.ppg;
  return f.stats ? (f.stats[key] ?? 0) : null;
}

/** Projections and averages to one decimal; actual counts and totals whole. */
function fmt(v: number | null | undefined, mode: Mode): string {
  if (v === null || v === undefined) return '—';
  return mode === 'proj' || mode === 'avg' ? v.toFixed(1) : String(Math.round(v));
}

const fmtPts = (v: number | null) => (v === null ? '—' : v.toFixed(1));

export default function PlayersScreen() {
  const [data, setData] = useState<PlayersData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/players.json`);
      if (!res.ok) throw new Error(`Players request failed (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load players');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const myTeam = useMyTeam(data?.myFranchiseId ?? '');
  const modes = useMemo(() => {
    const out: Array<{ mode: Mode; label: string }> = [];
    if (!data) return out;
    if (data.hasProj) out.push({ mode: 'proj', label: `WEEK ${data.projWeek} PROJ` });
    if (data.lastWeek) out.push({ mode: 'last', label: `LAST WEEK · WK ${data.lastWeek}` });
    out.push({ mode: 'total', label: 'SEASON TOTAL' }, { mode: 'avg', label: 'SEASON AVG' });
    return out;
  }, [data]);

  const [modeChoice, setMode] = useState<Mode | null>(null);
  // Without projections, open on season averages rather than a column of dashes.
  const mode: Mode = modeChoice ?? (data && !data.hasProj ? 'avg' : 'proj');
  const [modeOpen, setModeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [available, setAvailable] = useState(true);
  const [pos, setPos] = useState<Pos>('ALL');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'pts', desc: true });
  const [limit, setLimit] = useState(PAGE);

  // A new filter starts back at the top of the list.
  useEffect(() => { setLimit(PAGE); }, [query, available, pos, mode, sort]);

  const abbrevs = useMemo(() => new Map(data?.franchises.map((f) => [f.id, f.abbrev])), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.players.filter(
      (p) => (!available || !p.owner) && (pos === 'ALL' || p.pos === pos) && (!q || p.name.toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    return list
      .map((p) => ({ p, v: sortValue(p, mode, sort.key) }))
      // Rows with nothing to compare (no game, no projection) always sink.
      .sort((a, b) => (a.v === null ? 1 : 0) - (b.v === null ? 1 : 0) || dir * ((a.v ?? 0) - (b.v ?? 0)) || a.p.name.localeCompare(b.p.name))
      .map((r) => r.p);
  }, [data, query, available, pos, mode, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  const modeLabel = modes.find((m) => m.mode === mode)?.label ?? '';

  return (
    <PhoneFrame>
      <StatusBar label="PLAYERS" />
      <HeaderBar
        right={
          data && (
            <button
              onClick={() => setModeOpen((v) => !v)}
              aria-expanded={modeOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 32,
                background: 'none', border: '1px solid var(--color-divider)', padding: '0 11px',
                font: '800 11px var(--font-heading)', letterSpacing: '.06em',
                color: 'var(--color-text)', cursor: 'pointer',
              }}
            >
              {modeLabel.split(' · ')[0]} <span style={{ fontSize: 8 }}>▼</span>
            </button>
          )
        }
      />

      {modeOpen && (
        <div style={{ borderBottom: '2px solid var(--color-divider)', background: 'var(--color-neutral-200)' }}>
          {modes.map((m) => (
            <div
              key={m.mode}
              onClick={() => { setMode(m.mode); setSort({ key: 'pts', desc: true }); setModeOpen(false); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setMode(m.mode); setSort({ key: 'pts', desc: true }); setModeOpen(false); } }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                height: 44, padding: '0 14px', borderBottom: '1px solid var(--color-divider)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <span>{m.label}</span>
              <span style={{ font: '800 12px var(--font-heading)', color: 'var(--color-accent)' }}>{m.mode === mode ? '✓' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '10px 14px', borderBottom: '2px solid var(--color-text)', display: 'grid', gap: 8 }}>
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          aria-label="Search players by name"
          autoComplete="off"
          style={{ fontSize: 16, minHeight: 36, padding: '4px 10px' }}
        />
        <Seg
          name="availability"
          value={available ? 'AVAILABLE' : 'ALL PLAYERS'}
          options={['AVAILABLE', 'ALL PLAYERS']}
          onChange={(v) => setAvailable(v === 'AVAILABLE')}
        />
        <Seg name="position" value={pos} options={POSITIONS} onChange={(v) => setPos(v as Pos)} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data ? (
          <Skeleton />
        ) : rows.length === 0 ? (
          <Empty query={query} available={available} pos={pos} />
        ) : (
          <>
            {rows.slice(0, limit).map((p, i) => (
              <Row
                key={p.id}
                player={p}
                rank={i + 1}
                mode={mode}
                sort={sort}
                onSort={onSort}
                owner={!available && p.owner ? { abbrev: abbrevs.get(p.owner) ?? p.owner, mine: p.owner === myTeam } : null}
              />
            ))}
            {rows.length > limit && (
              <div style={{ padding: '14px', display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setLimit((n) => n + PAGE)}
                  style={{ font: '800 11px var(--font-heading)', letterSpacing: '.06em' }}
                >
                  LOAD MORE · {rows.length - limit} LEFT
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

/** The design system's segmented control, as radio buttons. */
function Seg({ name, value, options, onChange }: { name: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={name} style={{ display: 'flex', borderRadius: 0 }}>
      {options.map((o) => (
        <label
          key={o}
          className="seg-opt"
          style={{ flex: 1, justifyContent: 'center', padding: '6px 4px', font: '800 10.5px var(--font-heading)', letterSpacing: '.06em' }}
        >
          <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

function Row({
  player, rank, mode, sort, onSort, owner,
}: {
  player: PlayerRow;
  rank: number;
  mode: Mode;
  sort: { key: SortKey; desc: boolean };
  onSort: (key: SortKey) => void;
  owner: { abbrev: string; mine: boolean } | null;
}) {
  const f = figures(player, mode);
  const game = mode === 'last' ? player.last : player.next;
  const season = mode === 'total' || mode === 'avg';
  // No game that week means his bye; say so once rather than "BYE 5 · BYE".
  const gameText = !game ? 'ON BYE' : mode === 'last' ? game.opp : `${game.opp} ${game.kickoff}`;

  const cells: Array<{ key: SortKey; label: string; value: string }> = COLUMNS[player.pos].map((k) => ({
    key: k, label: STAT_LABEL[k], value: f.stats ? fmt(f.stats[k] ?? 0, mode) : '—',
  }));
  if (season) {
    cells.push(
      { key: 'gp', label: 'GP', value: String(f.gp) },
      { key: 'fpts', label: 'FPTS', value: player.season.gp > 0 || player.season.pts ? player.season.pts.toFixed(1) : '—' },
      { key: 'ppg', label: 'FPTS/G', value: fmtPts(f.ppg) },
    );
  }

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-divider)',
        background: owner?.mine ? 'color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 6px' }}>
        <span style={{ width: 22, flex: 'none', textAlign: 'right', font: '800 11px var(--font-heading)', color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums' }}>
          {rank}
        </span>
        <Avatar name={player.name} team={player.nflTeam} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ font: '600 13.5px/1.2 var(--font-body)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {player.name}
            </span>
            <InjuryTag tag={player.injury} />
          </div>
          <div style={{ font: '800 9px var(--font-heading)', letterSpacing: '.07em', color: 'var(--color-neutral-600)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.pos} · {player.nflTeam}{game && player.bye ? ` · BYE ${player.bye}` : ''} · {gameText}
          </div>
        </div>
        {owner && (
          <span
            className={owner.mine ? 'tag tag-accent' : 'tag tag-neutral'}
            title={owner.mine ? 'Your team' : 'Rostered'}
            style={{ flex: 'none', fontSize: 9, padding: '2px 6px', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 0 }}
          >
            {owner.abbrev}
          </span>
        )}
        <button
          onClick={() => onSort('pts')}
          title="Sort by points"
          style={{
            flex: 'none', minWidth: 48, height: 30, padding: '0 7px', cursor: 'pointer',
            background: 'none', border: `1px solid ${sort.key === 'pts' ? 'var(--color-text)' : 'var(--color-divider)'}`,
            font: '800 14px var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)',
          }}
        >
          {fmtPts(f.pts)}
        </button>
      </div>

      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 14, padding: '2px 14px 10px 86px', width: 'max-content' }}>
          {cells.map((c) => {
            const active = sort.key === c.key;
            return (
              <button
                key={c.key + c.label}
                onClick={() => onSort(c.key)}
                title={`Sort by ${c.label}`}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 34, color: 'inherit' }}
              >
                <div style={{ font: '800 8.5px var(--font-heading)', letterSpacing: '.06em', whiteSpace: 'nowrap', color: active ? 'var(--color-accent-700)' : 'var(--color-neutral-600)' }}>
                  {c.label}{active ? (sort.desc ? ' ▼' : ' ▲') : ''}
                </div>
                <div style={{ font: '600 12px var(--font-body)', fontVariantNumeric: 'tabular-nums', marginTop: 2, color: active ? 'var(--color-accent-700)' : 'var(--color-neutral-800)' }}>
                  {c.value}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Initials on the NFL team's color — no headshots in this version. */
function Avatar({ name, team }: { name: string; team: string }) {
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <span
      aria-hidden
      style={{
        width: 30, height: 30, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: NFL_COLORS[team] ?? 'var(--color-neutral-600)', color: '#fff',
        font: '800 10.5px var(--font-heading)', letterSpacing: '.02em',
      }}
    >
      {initials}
    </span>
  );
}

const bar = (w: number | string, h: number): CSSProperties => ({
  width: w, height: h, background: 'var(--color-neutral-200)', flex: 'none',
});

/** Placeholder rows in the real rows' shape while the player file loads. */
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading players" style={{ animation: 'blip 1.6s infinite' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--color-divider)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={bar(22, 10)} />
            <span style={{ ...bar(30, 30), borderRadius: '50%' }} />
            <div style={{ flex: 1, display: 'grid', gap: 5 }}>
              <span style={bar('55%', 12)} />
              <span style={bar('75%', 8)} />
            </div>
            <span style={bar(48, 30)} />
          </div>
          <div style={{ display: 'flex', gap: 14, paddingLeft: 72, marginTop: 8 }}>
            {Array.from({ length: 5 }, (_, j) => <span key={j} style={bar(34, 20)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ query, available, pos }: { query: string; available: boolean; pos: Pos }) {
  const who = `${available ? 'available ' : ''}${pos === 'ALL' ? 'players' : `${pos}s`}`;
  return (
    <div style={{ padding: '24px 14px' }}>
      <div style={{ font: '800 11px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>NO PLAYERS</div>
      <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
        {query.trim() ? `No ${who} match “${query.trim()}”.` : `No ${who} to show.`}
        {available ? ' Switch to ALL PLAYERS to include rostered ones.' : ''}
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
        The player list didn&apos;t load.
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
