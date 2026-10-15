'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode,
} from 'react';
import BottomSheet from '@/components/BottomSheet';
import InjuryTag from '@/components/InjuryTag';
import { posColor } from '@/components/pos';
import SectionHead from '@/components/team/SectionHead';
import { DISPLAY, money, pts1 } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import type { PlayerCardData, PlayerCardWeek } from '@/lib/types';

/**
 * The player card: one bottom sheet for the whole app, opened by tapping any
 * player's name (<PlayerLink>). Its open state lives in `?player=<id>`, so the
 * phone's back gesture closes the card instead of leaving the page.
 */

const Ctx = createContext<{ open: (id: string) => void } | null>(null);

const PARAM = 'player';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function urlWith(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PARAM, id);
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

export function PlayerCardProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  // Whether this session pushed the history entry the card sits on.
  const pushed = useRef(false);

  useEffect(() => {
    const read = () => {
      const next = new URLSearchParams(window.location.search).get(PARAM);
      if (!next) pushed.current = false;
      setId(next);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const open = useCallback((next: string) => {
    if (pushed.current) window.history.replaceState(window.history.state, '', urlWith(next));
    else window.history.pushState(window.history.state, '', urlWith(next));
    pushed.current = true;
    setId(next);
  }, []);

  const close = useCallback(() => {
    if (pushed.current) {
      window.history.back(); // popstate clears the id
    } else {
      // Opened from a shared link: drop the param without leaving the page.
      window.history.replaceState(window.history.state, '', urlWith(null));
      setId(null);
    }
  }, []);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {id && <Sheet id={id} onClose={close} />}
    </Ctx.Provider>
  );
}

/** A player's name that opens his card. Renders plain children without an id. */
export function PlayerLink({ playerId, children, style }: { playerId?: string; children: ReactNode; style?: CSSProperties }) {
  const ctx = useContext(Ctx);
  if (!playerId || !ctx) return <>{children}</>;
  const go = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.stopPropagation(); // rows that expand on tap keep that for the rest of the row
    ctx.open(playerId);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </span>
  );
}

/* ── Sheet ─────────────────────────────────────────────────────────────── */

const cache = new Map<string, PlayerCardData>();

/** Dead cap if cut: this season's cap hit × years left × 30% (league rule). */
const deadCap = (salary: number, years: number) => salary * years * 0.3;

function Sheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<PlayerCardData | null>(cache.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (cache.has(id)) return setData(cache.get(id)!);
    setData(null);
    try {
      const res = await fetch(`${BASE}/api/player/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'No card for this player.' : `Player request failed (${res.status})`);
      const body = (await res.json()) as PlayerCardData | null;
      if (!body) throw new Error('No card for this player.');
      cache.set(id, body);
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this player');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // The page behind stays put while the card is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <BottomSheet
      fixed
      label={data ? `${data.name} player card` : 'Player card'}
      onClose={onClose}
      maxHeight="calc(100dvh - 52px)"
      height="calc(100dvh - 52px)"
      header={data ? <Header p={data} /> : <div style={{ height: 60 }} />}
    >
      {error ? (
        <div style={{ padding: '20px 16px' }}>
          <div style={{ font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--live)' }}>COULD NOT LOAD</div>
          <p style={{ marginTop: 10, font: '400 13px/1.4 var(--font-body)', color: 'var(--ink-2)' }}>{error}</p>
          <button type="button" onClick={load} style={{ marginTop: 16, height: 36, padding: '0 14px', cursor: 'pointer', border: 0, borderRadius: 2, background: 'var(--volt)', color: 'var(--on-volt)', font: DISPLAY(13, 800), letterSpacing: '.1em' }}>
            TRY AGAIN
          </button>
        </div>
      ) : !data ? (
        <Skeleton />
      ) : (
        <>
          <Strip p={data} />
          {data.espnId && <News espnId={data.espnId} />}
          <GameLog p={data} />
          <div style={{ height: 24 }} />
        </>
      )}
    </BottomSheet>
  );
}

/* ── Header ───────────────────────────────────────────────────────────── */

function Header({ p }: { p: PlayerCardData }) {
  // The viewer's team, or the build's default until they pick one (as My Team does).
  const myTeam = useMyTeam(process.env.NEXT_PUBLIC_DEFAULT_FRANCHISE ?? '');
  const mine = !!p.owner && p.owner.id === myTeam;
  const bio = [p.nflTeam, p.jersey ? `#${p.jersey}` : '', p.bye ? `BYE ${p.bye}` : '', p.bio.age ? `AGE ${p.bio.age.toFixed(1)}` : ''].filter(Boolean).join(' · ');
  const c = p.contract;
  const yrs = c ? `${Math.max(1, c.years)} ${Math.max(1, c.years) === 1 ? 'YR' : 'YRS'}` : '';
  // Second line: yours — salary · years · dead cap if cut; another team's — team · salary · years;
  // a free agent — what the market pays for this production.
  const parts: Array<{ v: string; l?: string; tone?: string }> = !p.owner
    ? [{ v: 'Free agent', tone: 'var(--volt)' }, ...(p.market ? [{ v: `$${p.market.toLocaleString('en-US')}`, l: 'MARKET' }] : [])]
    : mine && c
      ? [{ v: money(c.salary) }, { v: yrs }, { v: money(deadCap(c.salary, Math.max(1, c.years))), l: 'DEAD CAP', tone: 'var(--fall)' }]
      : [{ v: p.owner.name }, ...(c ? [{ v: money(c.salary) }, { v: yrs }] : [])];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0 12px 16px' }}>
      <span style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, marginTop: 2, borderRadius: 2, background: 'var(--bg-300)', color: posColor(p.pos), font: DISPLAY(14, 800), letterSpacing: '.06em' }}>{p.pos}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h2 style={{ margin: 0, font: '700 22px/1.05 var(--font-display)', letterSpacing: '.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h2>
          <InjuryTag tag={p.injury} />
        </div>
        <div style={{ marginTop: 4, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{bio}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 2, font: '500 12px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {parts.map((x, i) => (
            <span key={i} style={{ whiteSpace: 'pre' }}>{i > 0 && ' · '}<b style={{ fontWeight: 600, color: x.tone ?? 'var(--ink)' }}>{x.v}</b>{x.l ? ` ${x.l}` : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** YTD PTS · PPG · POS RNK · OVR RNK. */
function Strip({ p }: { p: PlayerCardData }) {
  const gp = p.log.filter((w) => w.game).length;
  const cells: Array<[string, string]> = [
    ['YTD PTS', pts1(p.season.fpts)],
    ['PPG', gp ? (p.season.fpts / gp).toFixed(1) : '—'],
    ['POS RNK', p.season.rank ? `${p.pos}${p.season.rank}` : '—'],
    ['OVR RNK', p.season.ovrRank ? `#${p.season.ovrRank}` : '—'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--edge)' }}>
      {cells.map(([l, v]) => (
        <div key={l} style={{ padding: '10px 0 10px 16px' }}>
          <div style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>{l}</div>
          <div style={{ marginTop: 5, font: DISPLAY(20), fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ── News ───────────────────────────────────────────────────────────── */

interface NewsItem { id: number; headline: string; story?: string; description?: string; published: string; type?: string }

/**
 * Read when the card opens, so it's always current: through the live relay
 * (worker/, which caches it briefly), or straight from ESPN without one.
 */
const RELAY = (process.env.NEXT_PUBLIC_LIVE_URL ?? '').replace(/\/$/, '');
const newsUrl = (espnId: string) =>
  RELAY
    ? `${RELAY}/news?player=${encodeURIComponent(espnId)}`
    : `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=6&playerId=${encodeURIComponent(espnId)}`;
const newsCache = new Map<string, NewsItem[]>();

/** ["18 hours ago", "18h"]. */
function ago(iso: string): [string, string] {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return ['', ''];
  const units: Array<[number, string, string]> = [[7 * 864e5, 'week', 'w'], [864e5, 'day', 'd'], [36e5, 'hour', 'h'], [6e4, 'minute', 'm']];
  for (const [size, word, short] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return [`${n} ${word}${n === 1 ? '' : 's'} ago`, `${n}${short}`];
  }
  return ['just now', 'now'];
}

/**
 * LATEST NEWS. Collapsed: the newest item open (text clamped to two lines)
 * and one older headline. ALL NEWS expands the list in place; each headline
 * opens its own text and closes the other; SHOW LESS collapses.
 */
function News({ espnId }: { espnId: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(newsCache.get(espnId) ?? null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(0);

  useEffect(() => {
    if (newsCache.has(espnId)) return;
    let cancelled = false;
    fetch(newsUrl(espnId))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { feed?: NewsItem[] }) => {
        const feed = (body.feed ?? []).filter((x) => x.headline);
        newsCache.set(espnId, feed);
        if (!cancelled) setItems(feed);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [espnId]);

  const list = items ?? [];
  const shown = all ? list : list.slice(0, 2);
  const note = { padding: '12px 16px', font: '500 13px/1.4 var(--font-body)', color: 'var(--ink-3)' } as const;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)' }}>
        <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
        <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>LATEST NEWS</span>
        {list.length > 2 && (
          <button type="button" aria-expanded={all} onClick={() => { setAll((v) => !v); setOpen(0); }} style={{ marginLeft: 'auto', border: 0, background: 'none', padding: '8px 0', cursor: 'pointer', font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--ink-3)' }}>
            {all ? 'SHOW LESS' : `ALL NEWS (${list.length})`}
          </button>
        )}
      </div>
      {failed ? <div style={note}>News couldn&apos;t load right now.</div>
        : !items ? <div aria-busy="true" style={{ ...note, animation: 'blip 1.6s infinite' }}>Loading…</div>
        : list.length === 0 ? <div style={note}>No recent news.</div>
        : shown.map((n, i) => {
          const isOpen = i === open;
          const [long, short] = ago(n.published);
          const text = n.story || n.description || '';
          return (
            <div key={n.id} style={{ padding: isOpen ? '10px 16px 12px' : '9px 16px', borderBottom: '1px solid var(--line)' }}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(i)} style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', border: 0, background: 'none', padding: 0, color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0, font: isOpen ? '600 14.5px/1.3 var(--font-body)' : '500 13px/1.3 var(--font-body)', ...(isOpen ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>{n.headline}</span>
                {!isOpen && <span style={{ flex: 'none', font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)' }}>{short}</span>}
              </button>
              {isOpen && (
                <>
                  <div style={{ marginTop: 3, font: '500 11px/1 var(--font-body)', color: 'var(--ink-3)' }}>{long}{n.type ? ` · via ${n.type}` : ''}</div>
                  {text && text !== n.headline && (
                    <div style={{ marginTop: 6, font: '400 13px/1.4 var(--font-body)', color: 'var(--ink-2)', ...(all ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{text}</div>
                  )}
                  {all && (
                    <a href={`https://www.espn.com/nfl/player/_/id/${espnId}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--ink-2)' }}>READ ON ESPN ↗</a>
                  )}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}

/* ── Game log ─────────────────────────────────────────────────────────── */

type Stats = Record<string, number>;
interface Col {
  label: string;
  value: (s: Stats) => number | null;
  /** Rates show a decimal. */
  rate?: boolean;
  /** Any non-zero value is bad (fumbles). */
  bad?: boolean;
  width?: number;
}
interface Group { title: string; cols: Col[] }

const n = (s: Stats, k: string) => s[k] ?? 0;
const per = (num: string, den: string) => (s: Stats) => (n(s, den) > 0 ? n(s, num) / n(s, den) : null);
const stat = (k: string) => (s: Stats) => n(s, k);

const PASS: Group = { title: 'PASS', cols: [
  { label: 'ATT', value: stat('pass_att') }, { label: 'CMP', value: stat('pass_cmp') },
  { label: 'YD', value: stat('pass_yd'), width: 42 }, { label: 'TD', value: stat('pass_td') }, { label: 'INT', value: stat('pass_int'), bad: true },
] };
const SACKED: Group = { title: 'SACKED', cols: [{ label: 'SK', value: stat('pass_sack'), bad: true }, { label: 'YDS', value: stat('pass_sack_yds'), bad: true }] };
const RUSHING: Group = { title: 'RUSHING', cols: [
  { label: 'ATT', value: stat('rush_att') }, { label: 'YD', value: stat('rush_yd'), width: 40 },
  { label: 'YPC', value: per('rush_yd', 'rush_att'), rate: true }, { label: 'TD', value: stat('rush_td') },
] };
const RECEIVING: Group = { title: 'RECEIVING', cols: [
  { label: 'TAR', value: stat('rec_tgt') }, { label: 'REC', value: stat('rec') },
  { label: 'YD', value: stat('rec_yd'), width: 40 }, { label: 'TD', value: stat('rec_td') },
] };
const FUMBLE: Group = { title: 'FUMBLE', cols: [{ label: 'LOST', value: stat('fum_lost'), bad: true, width: 40 }] };

const GROUPS: Record<PlayerCardData['pos'], Group[]> = {
  QB: [PASS, SACKED, RUSHING, FUMBLE],
  RB: [RUSHING, RECEIVING, FUMBLE],
  WR: [RECEIVING, RUSHING, FUMBLE],
  TE: [RECEIVING, RUSHING, FUMBLE],
};

/** Clearly above his season average → blue, clearly below → orange; fumbles orange when any. */
function tint(v: number | null, avg: number | null, bad?: boolean): string | undefined {
  if (v === null || (v === 0 && !bad)) return undefined;
  if (bad) return v > 0 ? 'var(--fall-tint)' : undefined;
  if (avg === null) return undefined;
  if (avg <= 0) return v > 0 ? 'var(--rise-tint)' : undefined;
  const r = v / avg;
  return r >= 1.15 ? 'var(--rise-tint)' : r <= 0.85 ? 'var(--fall-tint)' : undefined;
}

const W = { wk: 34, opp: 46 };

/**
 * Sleeper-style log: one row per week of this season (byes included), PROJ
 * and FPTS in league scoring, snap share, then the position's stat groups.
 * Scrolls sideways with WK and OPP pinned.
 */
function GameLog({ p }: { p: PlayerCardData }) {
  const weeks = p.log.filter((w) => !w.future);
  const played = weeks.filter((w) => w.game);
  const gp = played.length;
  const groups = GROUPS[p.pos];
  const totals: Stats = {};
  for (const w of played) for (const [k, v] of Object.entries(w.game!.stats)) totals[k] = (totals[k] ?? 0) + v;
  const avgOf = (c: Col) => (gp === 0 ? null : c.rate ? c.value(totals) : (c.value(totals) ?? 0) / gp);
  const fptsAvg = gp ? played.reduce((t, w) => t + w.game!.fpts, 0) / gp : null;
  const snapped = played.filter((w) => w.game!.snp !== null);
  const snpAvg = snapped.length ? snapped.reduce((t, w) => t + w.game!.snp!, 0) / snapped.length : null;

  const fmt = (v: number | null, rate?: boolean) => (v === null ? '-' : v === 0 ? '-' : rate ? v.toFixed(1) : String(Math.round(v * 10) / 10));
  const cell = (extra: CSSProperties = {}): CSSProperties => ({
    height: 32, padding: '0 6px', boxSizing: 'border-box', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
    borderBottom: '1px solid var(--line)', font: '500 12.5px/1 var(--font-body)', ...extra,
  });
  const head = (extra: CSSProperties = {}): CSSProperties => ({
    height: 24, padding: '0 6px', textAlign: 'right', whiteSpace: 'nowrap', font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)', borderBottom: '1px solid var(--edge)', ...extra,
  });
  const pin = (left: number, width: number, bg = 'var(--bg-100)'): CSSProperties => ({ position: 'sticky', left, zIndex: 1, background: bg, minWidth: width, width, textAlign: 'left' });
  const divider = { borderLeft: '1px solid var(--line)' };

  return (
    <div>
      <SectionHead label="GAME LOG" />
      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...head({ borderBottom: 0 }), ...pin(0, W.wk) }} />
              <th style={{ ...head({ borderBottom: 0 }), ...pin(W.wk, W.opp) }} />
              <th colSpan={2} style={head({ borderBottom: 0, textAlign: 'center', color: 'var(--ink-2)', ...divider })}>FANTASY</th>
              <th style={head({ borderBottom: 0, ...divider })} />
              {groups.map((g) => (
                <th key={g.title} colSpan={g.cols.length} style={head({ borderBottom: 0, textAlign: 'center', color: 'var(--ink-2)', letterSpacing: '.12em', ...divider })}>{g.title}</th>
              ))}
            </tr>
            <tr>
              <th style={{ ...head(), ...pin(0, W.wk), paddingLeft: 16 }}>WK</th>
              <th style={{ ...head(), ...pin(W.wk, W.opp) }}>OPP</th>
              <th style={head({ ...divider, minWidth: 40 })}>PROJ</th>
              <th style={head({ color: 'var(--ink)', minWidth: 46 })}>FPTS</th>
              <th style={head({ ...divider, minWidth: 42 })}>SNP%</th>
              {groups.map((g) => g.cols.map((c, i) => (
                <th key={g.title + c.label} style={head({ minWidth: c.width ?? 34, ...(i === 0 ? divider : {}) })}>{c.label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const g = w.game;
              const bye = w.opp === null;
              if (bye) {
                return (
                  <tr key={w.week}>
                    <td style={{ ...cell({ font: DISPLAY(12) }), ...pin(0, W.wk), paddingLeft: 16 }}>{w.week}</td>
                    <td style={{ ...cell({ font: DISPLAY(12), color: 'var(--ink-3)' }), ...pin(W.wk, W.opp) }}>BYE</td>
                    <td colSpan={3 + groups.reduce((t, gr) => t + gr.cols.length, 0)} style={cell({ background: 'var(--bg-200)' })} />
                  </tr>
                );
              }
              return (
                <tr key={w.week}>
                  <td style={{ ...cell({ font: DISPLAY(12) }), ...pin(0, W.wk), paddingLeft: 16 }}>{w.week}</td>
                  <td style={{ ...cell({ font: DISPLAY(12) }), ...pin(W.wk, W.opp) }}>{w.opp}</td>
                  <td style={cell({ color: 'var(--ink-3)', ...divider })}>{w.proj != null ? w.proj.toFixed(1) : '-'}</td>
                  <td style={cell({ font: DISPLAY(13.5), background: g ? tint(g.fpts, fptsAvg) : undefined })}>{g ? g.fpts.toFixed(1) : '-'}</td>
                  <td style={cell({ ...divider, background: g ? tint(g.snp, snpAvg) : undefined })}>{g?.snp ? g.snp : '-'}</td>
                  {groups.map((gr) => gr.cols.map((c, i) => {
                    const v = g ? c.value(g.stats) : null;
                    const shown = fmt(v, c.rate);
                    return (
                      <td key={gr.title + c.label} style={cell({ ...(i === 0 ? divider : {}), color: shown === '-' ? 'var(--ink-3)' : 'var(--ink)', background: g ? tint(v, avgOf(c), c.bad) : undefined })}>
                        {shown}
                      </td>
                    );
                  }))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Skeleton() {
  const bar = (w: number | string, h: number): CSSProperties => ({ display: 'block', width: w, height: h, background: 'var(--bg-200)', borderRadius: 2 });
  return (
    <div aria-busy="true" aria-label="Loading player" style={{ padding: 16, display: 'grid', gap: 10, animation: 'blip 1.6s infinite' }}>
      <span style={bar('40%', 12)} />
      {Array.from({ length: 10 }, (_, i) => <span key={i} style={bar('100%', 26)} />)}
    </div>
  );
}

/** For screens that want to open a card without a <PlayerLink>. */
export function usePlayerCard() {
  return useContext(Ctx);
}
