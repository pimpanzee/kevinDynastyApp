'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import { usePlayerCard } from '@/components/PlayerCard';
import SubTabs from '@/components/SubTabs';
import { teamInitials } from '@/components/TeamAvatar';
import { posColor } from '@/components/pos';
import { DISPLAY, pts1 } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import type { PlayerRow, PlayersData } from '@/lib/types';

/**
 * Players: FREE AGENTS or ALL PLAYERS, searchable, filtered by position and
 * sorted by any column (tap the active header again to flip). All players
 * shows who rosters each one inside the pinned cell. Rows open the card.
 * The data is a static file built with the site (/players.json).
 */

type List = 'fa' | 'all';
type Pos = 'ALL' | PlayerRow['pos'];
type ColKey = 'proj' | 'ppg' | 'pts' | 'posRank' | 'ovrRank';

const POSITIONS: Pos[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const COLS: Array<{ key: ColKey; label: string; low?: boolean }> = [
  { key: 'proj', label: 'WK PROJ' },
  { key: 'ppg', label: 'PPG' },
  { key: 'pts', label: 'YTD PTS' },
  { key: 'posRank', label: 'POS RNK', low: true },
  { key: 'ovrRank', label: 'OVR RNK', low: true },
];
const GRID = '176px repeat(5, 66px)';
const PAGE = 150;

interface Row extends PlayerRow {
  ppg: number | null;
  posRank: number | null;
  ovrRank: number | null;
}

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

  const card = usePlayerCard();
  const mine = useMyTeam(data?.myFranchiseId ?? '');
  const [list, setList] = useState<List>('fa');
  const [pos, setPos] = useState<Pos>('ALL');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: ColKey; desc: boolean }>({ key: 'proj', desc: true });
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [list, pos, q, sort]);

  // Ranks by season points, among everyone listed.
  const rows: Row[] = useMemo(() => {
    const players = data?.players ?? [];
    const scored = players.filter((p) => p.season.gp > 0).sort((a, b) => b.season.pts - a.season.pts);
    const ovr = new Map(scored.map((p, i) => [p.id, i + 1]));
    const posRank = new Map<string, number>();
    const seen: Record<string, number> = {};
    for (const p of scored) posRank.set(p.id, (seen[p.pos] = (seen[p.pos] ?? 0) + 1));
    return players.map((p) => ({
      ...p,
      ppg: p.season.gp ? p.season.pts / p.season.gp : null,
      posRank: posRank.get(p.id) ?? null,
      ovrRank: ovr.get(p.id) ?? null,
    }));
  }, [data]);

  const owners = useMemo(() => new Map(data?.franchises.map((f) => [f.id, f])), [data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const value = (r: Row): number | null => {
      switch (sort.key) {
        case 'proj': return r.next ? r.proj.pts : null;
        case 'ppg': return r.ppg;
        case 'pts': return r.season.gp ? r.season.pts : null;
        case 'posRank': return r.posRank;
        case 'ovrRank': return r.ovrRank;
      }
    };
    return rows
      .filter((r) => (list === 'all' || !r.owner) && (pos === 'ALL' || r.pos === pos) && (!needle || r.name.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const va = value(a), vb = value(b);
        // Byes and missing values sink, whichever way the column sorts.
        if (va === null || vb === null) return va === null && vb === null ? 0 : va === null ? 1 : -1;
        return sort.desc ? vb - va : va - vb;
      });
  }, [rows, list, pos, q, sort]);

  const pickSort = (c: (typeof COLS)[number]) =>
    setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !c.low }));

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar />
      <SubTabs
        label="Player lists"
        tabs={[{ key: 'fa', label: 'FREE AGENTS' }, { key: 'all', label: 'ALL PLAYERS' }]}
        active={list}
        onSelect={(k) => setList(k as List)}
      />
      <div style={{ flex: 'none', display: 'grid', gap: 8, padding: '10px 16px', background: 'var(--bg-100)', borderBottom: '1px solid var(--line)' }}>
        <label style={{ position: 'relative', display: 'block' }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search players by name</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ position: 'absolute', left: 12, top: 14, color: 'var(--ink-3)' }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={list === 'fa' ? 'Search free agents' : 'Search all players'}
            style={{ boxSizing: 'border-box', width: '100%', height: 44, padding: '0 12px 0 36px', font: '500 16px/1 var(--font-body)', color: 'var(--ink)', background: 'var(--bg-000)', border: '1px solid var(--line)', borderRadius: 2 }}
          />
        </label>
        <div role="group" aria-label="Position" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
          {POSITIONS.map((p) => {
            const on = p === pos;
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => setPos(p)} style={{ height: 36, borderRadius: 2, border: `1px solid ${on ? 'var(--edge)' : 'var(--line)'}`, background: on ? 'var(--bg-300)' : 'transparent', color: on ? 'var(--ink)' : p === 'ALL' ? 'var(--ink-3)' : posColor(p), font: DISPLAY(12), letterSpacing: '.1em', cursor: 'pointer' }}>{p}</button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {error ? (
          <div style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>
            {error}. <button type="button" onClick={load} style={{ border: 0, background: 'none', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Try again</button>
          </div>
        ) : !data ? (
          <div aria-busy="true" style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)', animation: 'blip 1.6s infinite' }}>Loading…</div>
        ) : (
          <div style={{ width: 'max-content', minWidth: '100%' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', height: 36, background: 'var(--bg-000)', borderBottom: '1px solid var(--edge)', whiteSpace: 'nowrap' }}>
              <span style={{ position: 'sticky', left: 0, zIndex: 3, display: 'flex', alignItems: 'center', paddingLeft: 16, background: 'var(--bg-000)', boxShadow: '1px 0 0 var(--line)', font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>PLAYER</span>
              {COLS.map((c) => {
                const on = sort.key === c.key;
                return (
                  <button key={c.key} type="button" onClick={() => pickSort(c)} aria-label={`Sort by ${c.label}${on ? (sort.desc ? ', descending' : ', ascending') : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, padding: '0 10px 0 0', background: on ? 'var(--bg-200)' : 'transparent', border: 0, boxShadow: on ? 'inset 0 -2px 0 var(--volt)' : undefined, font: DISPLAY(10), letterSpacing: '.1em', color: on ? 'var(--ink)' : 'var(--ink-3)', cursor: 'pointer' }}>
                    {c.label}
                    <span aria-hidden style={{ width: 8, fontSize: 9, color: 'var(--volt)' }}>{on ? (sort.desc ? '▼' : '▲') : ''}</span>
                  </button>
                );
              })}
            </div>
            {shown.slice(0, limit).map((r) => {
              const isMine = !!r.owner && r.owner === mine;
              const owner = r.owner ? owners.get(r.owner) : undefined;
              const bg = isMine ? 'var(--bg-200)' : 'var(--bg-000)';
              const cells: Array<[ColKey, string]> = [
                ['proj', r.next ? (r.proj.pts !== null ? r.proj.pts.toFixed(1) : '—') : 'BYE'],
                ['ppg', r.ppg !== null ? r.ppg.toFixed(1) : '—'],
                ['pts', r.season.gp ? pts1(r.season.pts) : '—'],
                ['posRank', r.posRank ? `${r.pos}${r.posRank}` : '—'],
                ['ovrRank', r.ovrRank ? `#${r.ovrRank}` : '—'],
              ];
              return (
                <button key={r.id} type="button" onClick={() => card?.open(r.id)} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', height: 48, width: '100%', padding: 0, border: 0, borderBottom: '1px solid var(--line)', background: isMine ? 'var(--bg-200)' : 'transparent', color: 'var(--ink)', textAlign: 'left', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <span style={{ position: 'sticky', left: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, height: '100%', padding: '0 10px 0 16px', boxSizing: 'border-box', minWidth: 0, background: bg, boxShadow: `${isMine ? 'inset 3px 0 0 var(--volt), ' : ''}1px 0 0 var(--line)` }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ font: '600 14px/1.2 var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      <InjuryTag tag={r.injury} />
                      {list === 'all' && (
                        // Who rosters him: the team's chip (yours in volt), or FA outlined in blue.
                        <span title={owner?.name ?? 'Free agent'} style={{ flex: 'none', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 18, padding: '0 4px', boxSizing: 'border-box', borderRadius: 3, background: !owner ? 'transparent' : isMine ? 'var(--volt)' : 'var(--bg-300)', color: !owner ? 'var(--rise)' : isMine ? 'var(--on-volt)' : 'var(--ink)', border: !owner ? '1px solid var(--rise)' : 0, font: DISPLAY(10, 800), letterSpacing: '.04em' }}>
                          {owner ? teamInitials(owner.name) : 'FA'}
                        </span>
                      )}
                    </span>
                    <span style={{ font: '500 12px/1.2 var(--font-body)', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <b style={{ fontWeight: 700, color: posColor(r.pos) }}>{r.pos}</b> · {r.nflTeam}{r.next ? ` · ${r.next.opp}` : ' · BYE'}
                    </span>
                  </span>
                  {cells.map(([k, text]) => (
                    <span key={k} style={{ textAlign: 'right', paddingRight: 18, font: sort.key === k ? DISPLAY(15) : '500 13px/1 var(--font-body)', color: text === '—' || text === 'BYE' ? 'var(--ink-3)' : 'var(--ink)' }}>{text}</span>
                  ))}
                </button>
              );
            })}
            {shown.length === 0 && <div style={{ padding: 16, font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' }}>No players match.</div>}
            {shown.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} style={{ position: 'sticky', left: 0, display: 'block', width: 390, maxWidth: '100vw', height: 48, border: 0, background: 'none', color: 'var(--ink-2)', font: DISPLAY(12), letterSpacing: '.12em', cursor: 'pointer' }}>SHOW MORE</button>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}
