'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import InjuryTag from '@/components/InjuryTag';
import { SectionTitle, StatCell } from '@/components/ListChrome';
import { useMyTeam } from '@/lib/myTeam';
import { NFL_COLORS } from '@/lib/nflColors';
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

function Sheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<PlayerCardData | null>(cache.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  // Focus moves into the sheet (not onto a control, which would show its ring).
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.focus(); }, []);

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Swipe down on the handle/header to dismiss.
  const onDown = (e: ReactPointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (start.current) setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onUp = () => {
    if (!start.current) return;
    const speed = drag / Math.max(1, Date.now() - start.current.t);
    start.current = null;
    if (drag > 110 || (drag > 40 && speed > 0.6)) onClose();
    else setDrag(0);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        background: 'var(--scrim)',
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={data ? `${data.name} player card` : 'Player card'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 390, maxWidth: '100%', height: '90dvh', display: 'flex', flexDirection: 'column', outline: 'none',
          background: 'var(--color-bg)', borderTop: '2px solid var(--color-text)',
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: start.current ? 'none' : 'transform .18s ease-out',
          animation: 'sheet-up .2s ease-out',
        }}
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ touchAction: 'none', flex: 'none', position: 'relative', paddingTop: 8 }}
        >
          <div aria-hidden style={{ width: 40, height: 4, margin: '0 auto', background: 'var(--color-neutral-400)' }} />
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Close"
            style={{
              position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 0, background: 'none',
              font: '800 20px/1 var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            ×
          </button>
          {data && <Header p={data} />}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
          {error ? (
            <div style={{ padding: '20px 14px' }}>
              <div style={{ font: '800 11px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>COULD NOT LOAD</div>
              <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--color-neutral-700)' }}>{error}</p>
              <button
                onClick={load}
                style={{
                  marginTop: 16, height: 36, padding: '0 14px', cursor: 'pointer', border: 0,
                  background: 'var(--color-accent)', color: 'var(--color-bg)', font: '800 11px var(--font-heading)', letterSpacing: '.06em',
                }}
              >
                TRY AGAIN
              </button>
            </div>
          ) : !data ? (
            <Skeleton />
          ) : (
            <>
              {data.contract && <Contract c={data.contract} />}
              {data.espnId && <News espnId={data.espnId} />}
              <GameLog p={data} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────────────── */

const fmtHeight = (inches?: number) => (inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : '—');

function Header({ p }: { p: PlayerCardData }) {
  const myTeam = useMyTeam('');
  const [first, ...rest] = p.name.split(' ');
  const mine = p.owner?.id === myTeam;
  return (
    <div style={{ padding: '6px 14px 12px', borderBottom: '2px solid var(--color-text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Headshot p={p} />
        <div style={{ flex: 1, minWidth: 0, paddingRight: 30 }}>
          <div style={{ font: '800 12px/1.1 var(--font-heading)', letterSpacing: '.04em', color: 'var(--color-neutral-700)', textTransform: 'uppercase' }}>
            {first}
          </div>
          <div style={{ font: '800 22px/1.1 var(--font-heading)', letterSpacing: '-.01em', textTransform: 'uppercase', overflowWrap: 'anywhere' }}>
            {rest.join(' ') || first}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)' }}>
              {p.pos} · {p.nflTeam}{p.jersey ? ` · #${p.jersey}` : ''}{p.bye ? ` · BYE ${p.bye}` : ''}
            </span>
            <InjuryTag tag={p.injury} />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginTop: 12 }}>
        <StatCell label="AGE" value={p.bio.age?.toFixed(1) ?? '—'} valueFont="800 14px var(--font-heading)" />
        <StatCell label="HEIGHT" value={fmtHeight(p.bio.height)} valueFont="800 14px var(--font-heading)" />
        <StatCell label="WEIGHT" value={p.bio.weight ? `${p.bio.weight} lbs` : '—'} valueFont="800 14px var(--font-heading)" />
        <StatCell label="EXP" value={p.bio.exp ?? '—'} valueFont="800 14px var(--font-heading)" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ font: '800 8px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-neutral-600)' }}>OWNER</span>
        {p.owner ? (
          <span className={mine ? 'tag tag-accent' : 'tag tag-neutral'} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 0 }}>
            {p.owner.name}
          </span>
        ) : (
          <span className="tag tag-outline" style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 0 }}>WAIVERS</span>
        )}
      </div>
    </div>
  );
}

function Headshot({ p }: { p: PlayerCardData }) {
  const [failed, setFailed] = useState(false);
  const initials = p.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <span
      style={{
        width: 72, height: 72, flex: 'none', borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: NFL_COLORS[p.nflTeam] ?? 'var(--color-neutral-600)', color: '#fff', boxShadow: 'var(--avatar-ring, none)', font: '800 22px var(--font-heading)',
      }}
    >
      {p.headshot && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote headshot in a static export
        <img
          src={p.headshot}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: 'var(--color-neutral-200)' }}
        />
      ) : (
        initials
      )}
    </span>
  );
}

/* ── Contract ─────────────────────────────────────────────────────────── */

function Contract({ c }: { c: NonNullable<PlayerCardData['contract']> }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-divider)' }}>
      <SectionTitle>CONTRACT</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
        <StatCell label="SALARY" value={`$${c.salary.toFixed(2)}`} valueFont="800 14px var(--font-heading)" />
        <StatCell label="YEARS" value={c.years} valueFont="800 14px var(--font-heading)" />
        <StatCell label="CONTRACT" value={c.code || '—'} valueFont="800 14px var(--font-heading)" />
        <StatCell label="STATUS" value={c.status} valueFont="800 14px var(--font-heading)" />
      </div>
    </div>
  );
}

/* ── News ───────────────────────────────────────────────────────────── */

interface NewsItem { id: number; headline: string; story?: string; published: string; type?: string }

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

/** "2h ago", "Yesterday", "Mon Oct 5". */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(Date.parse(iso));
}

function News({ espnId }: { espnId: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(newsCache.get(espnId) ?? null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (newsCache.has(espnId)) return;
    let cancelled = false;
    fetch(newsUrl(espnId))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { feed?: NewsItem[] }) => {
        const feed = (body.feed ?? []).filter((n) => n.headline);
        newsCache.set(espnId, feed);
        if (!cancelled) setItems(feed);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [espnId]);

  const shown = (items ?? []).slice(0, all ? 6 : 2);
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-divider)' }}>
      <SectionTitle>NEWS</SectionTitle>
      {failed ? (
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-600)' }}>News couldn&apos;t load right now.</p>
      ) : !items ? (
        <div aria-busy="true" style={{ display: 'grid', gap: 6, marginTop: 8, animation: 'blip 1.6s infinite' }}>
          <span style={{ height: 12, width: '90%', background: 'var(--color-neutral-200)' }} />
          <span style={{ height: 12, width: '70%', background: 'var(--color-neutral-200)' }} />
        </div>
      ) : items.length === 0 ? (
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-600)' }}>No recent news.</p>
      ) : (
        <>
          {shown.map((n) => {
            const isOpen = open === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpen(isOpen ? null : n.id)}
                aria-expanded={isOpen}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '9px 0 0',
                  color: 'inherit', font: 'inherit', cursor: n.story ? 'pointer' : 'default',
                }}
              >
                <div style={{ font: '800 9px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-neutral-600)' }}>
                  {ago(n.published).toUpperCase()}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>{n.headline}</div>
                {n.story && (
                  <div
                    style={{
                      fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-neutral-700)', marginTop: 3,
                      ...(isOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
                    }}
                  >
                    {n.story}
                  </div>
                )}
              </button>
            );
          })}
          {items.length > 2 && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              style={{
                marginTop: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer',
                font: '800 10px var(--font-heading)', letterSpacing: '.08em', color: 'var(--color-accent-700)',
              }}
            >
              {all ? 'SHOW LESS' : `MORE NEWS (${Math.min(items.length, 6) - 2})`}
            </button>
          )}
          <div style={{ marginTop: 8, fontSize: 9.5, color: 'var(--color-neutral-500)' }}>via ESPN{items[0]?.type ? ` · ${items[0].type}` : ''}</div>
        </>
      )}
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
  /** Lower is better (interceptions). */
  invert?: boolean;
}
interface Block { title: string; cols: Col[] }

const n = (s: Stats, k: string) => s[k] ?? 0;
const per = (num: string, den: string) => (s: Stats) => (n(s, den) > 0 ? n(s, num) / n(s, den) : null);
const stat = (k: string) => (s: Stats) => n(s, k);

const PASSING: Block = { title: 'PASSING', cols: [
  { label: 'ATT', value: stat('pass_att') }, { label: 'CMP', value: stat('pass_cmp') },
  { label: 'YD', value: stat('pass_yd') }, { label: 'TD', value: stat('pass_td') },
  { label: 'INT', value: stat('pass_int'), invert: true },
] };
const RUSHING_SHORT: Block = { title: 'RUSHING', cols: [
  { label: 'ATT', value: stat('rush_att') }, { label: 'YD', value: stat('rush_yd') }, { label: 'TD', value: stat('rush_td') },
] };
const RUSHING_RB: Block = { title: 'RUSHING', cols: [
  { label: 'ATT', value: stat('rush_att') }, { label: 'YD', value: stat('rush_yd') },
  { label: 'YPC', value: per('rush_yd', 'rush_att'), rate: true }, { label: 'TD', value: stat('rush_td') },
] };
const RECEIVING_RB: Block = { title: 'RECEIVING', cols: [
  { label: 'TAR', value: stat('rec_tgt') }, { label: 'REC', value: stat('rec') },
  { label: 'YD', value: stat('rec_yd') }, { label: 'TD', value: stat('rec_td') },
] };
const RECEIVING_WR: Block = { title: 'RECEIVING', cols: [
  { label: 'TAR', value: stat('rec_tgt') }, { label: 'REC', value: stat('rec') }, { label: 'YD', value: stat('rec_yd') },
  { label: 'YPT', value: per('rec_yd', 'rec_tgt'), rate: true }, { label: 'YPC', value: per('rec_yd', 'rec'), rate: true },
  { label: 'TD', value: stat('rec_td') },
] };
const RETURNS: Block = { title: 'RETURNS', cols: [
  { label: 'KR', value: stat('kr') }, { label: 'KR YD', value: stat('kr_yd') },
  { label: 'PR', value: stat('pr') }, { label: 'PR YD', value: stat('pr_yd') }, { label: 'TD', value: stat('st_td') },
] };

const BLOCKS: Record<PlayerCardData['pos'], [Block, Block]> = {
  QB: [PASSING, RUSHING_SHORT],
  RB: [RUSHING_RB, RECEIVING_RB],
  WR: [RECEIVING_WR, RUSHING_SHORT],
  TE: [RECEIVING_WR, RUSHING_SHORT],
};

/** Season totals across played weeks. */
function totals(log: PlayerCardWeek[]): Stats {
  const out: Stats = {};
  for (const w of log) for (const [k, v] of Object.entries(w.game?.stats ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

const TINT = { good: 'var(--color-good-tint)', mid: 'var(--color-mid-tint)', bad: 'var(--color-bad-tint)' };

/** Green/yellow/red against the player's own season average. */
function tint(v: number | null, avg: number | null, invert = false): string | undefined {
  if (v === null || avg === null) return undefined;
  if (avg <= 0) return v > 0 ? (invert ? TINT.bad : TINT.good) : undefined;
  const r = v / avg;
  const level = r >= 1.15 ? 'good' : r <= 0.85 ? 'bad' : 'mid';
  return TINT[invert ? (level === 'good' ? 'bad' : level === 'bad' ? 'good' : 'mid') : level];
}

const W = { wk: 30, opp: 54, fpts: 52 };
const cellBase: CSSProperties = {
  height: 34, padding: '0 6px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  borderBottom: '1px solid var(--color-divider)', font: '500 12px var(--font-body)',
};
const headBase: CSSProperties = {
  ...cellBase, height: 24, font: '800 8.5px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-neutral-600)',
  borderBottom: '1px solid var(--color-neutral-300)',
};
const sticky = (left: number, width: number, bg = 'var(--color-bg)', edge = false): CSSProperties => ({
  position: 'sticky', left, zIndex: 1, background: bg, minWidth: width, maxWidth: width, width,
  boxShadow: edge ? 'inset -1px 0 0 var(--color-divider)' : undefined,
});

function GameLog({ p }: { p: PlayerCardData }) {
  const played = p.log.filter((w) => w.game);
  const season = totals(p.log);
  const gp = played.length;

  const [primary, secondary] = BLOCKS[p.pos];
  const nonzero = (b: Block) => b.cols.some((c) => (c.value(season) ?? 0) > 0);
  const blocks = [primary, ...(nonzero(secondary) ? [secondary] : []), ...(nonzero(RETURNS) ? [RETURNS] : [])];

  // Per-game averages to color against; rates use the season rate.
  const avgOf = (c: Col) => (gp === 0 ? null : c.rate ? c.value(season) : (c.value(season) ?? 0) / gp);
  const fptsAvg = gp ? played.reduce((t, w) => t + w.game!.fpts, 0) / gp : null;
  const ranked = played.filter((w) => w.game!.rank !== null);
  const rankAvg = ranked.length ? ranked.reduce((t, w) => t + w.game!.rank!, 0) / ranked.length : null;
  const snapped = played.filter((w) => w.game!.snp !== null);
  const snpAvg = snapped.length ? snapped.reduce((t, w) => t + w.game!.snp!, 0) / snapped.length : null;

  const fmt = (v: number | null, rate?: boolean) => (v === null ? '—' : rate ? v.toFixed(1) : String(Math.round(v * 10) / 10));

  return (
    <div style={{ padding: '12px 0 0' }}>
      <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionTitle>GAME LOG</SectionTitle>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums' }}>
          {gp} GP · {p.season.fpts.toFixed(2)} FPTS{gp ? ` · ${(p.season.fpts / gp).toFixed(1)} PPG` : ''}
          {p.season.rank ? ` · ${p.pos}${p.season.rank}` : ''}
        </span>
      </div>
      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th colSpan={3} style={{ ...headBase, ...sticky(0, W.wk + W.opp + W.fpts, 'var(--color-bg)', true), textAlign: 'left', paddingLeft: 14, color: 'var(--color-text)' }}>
                FANTASY
              </th>
              <th colSpan={2} style={{ ...headBase, color: 'var(--color-text)', textAlign: 'center' }} />
              {blocks.map((b) => (
                <th key={b.title} colSpan={b.cols.length} style={{ ...headBase, textAlign: 'center', color: 'var(--color-text)', borderLeft: '1px solid var(--color-divider)' }}>
                  {b.title}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ ...headBase, ...sticky(0, W.wk), textAlign: 'left', paddingLeft: 14 }}>WK</th>
              <th style={{ ...headBase, ...sticky(W.wk, W.opp), textAlign: 'left' }}>OPP</th>
              <th style={{ ...headBase, ...sticky(W.wk + W.opp, W.fpts, 'var(--color-bg)', true) }}>FPTS</th>
              <th style={headBase}>RANK</th>
              <th style={headBase}>SNP%</th>
              {blocks.map((b) => b.cols.map((c, i) => (
                <th key={b.title + c.label} style={{ ...headBase, minWidth: 40, borderLeft: i === 0 ? '1px solid var(--color-divider)' : undefined }}>{c.label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {p.log.map((w) => {
              const g = w.game;
              const bye = w.opp === null;
              const rowBg = bye ? 'var(--color-neutral-200)' : 'var(--color-bg)';
              const dash = bye ? '' : '—';
              return (
                <tr key={w.week}>
                  <td style={{ ...cellBase, ...sticky(0, W.wk, rowBg), textAlign: 'left', paddingLeft: 14, font: '800 11px var(--font-heading)' }}>{w.week}</td>
                  <td style={{ ...cellBase, ...sticky(W.wk, W.opp, rowBg), textAlign: 'left', font: '800 10.5px var(--font-heading)', color: bye ? 'var(--color-neutral-600)' : undefined }}>
                    {bye ? 'BYE' : w.opp}
                  </td>
                  <td style={{ ...cellBase, ...sticky(W.wk + W.opp, W.fpts, g ? (tint(g.fpts, fptsAvg) ?? rowBg) : rowBg, true), font: '800 12px var(--font-heading)' }}>
                    {g ? g.fpts.toFixed(2) : dash}
                  </td>
                  <td style={{ ...cellBase, background: g ? tint(g.rank, rankAvg, true) : bye ? rowBg : undefined }}>{g?.rank ?? dash}</td>
                  <td style={{ ...cellBase, background: g ? tint(g.snp, snpAvg) : bye ? rowBg : undefined }}>{g ? (g.snp ?? '—') : dash}</td>
                  {blocks.map((b) => b.cols.map((c, i) => {
                    const v = g ? c.value(g.stats) : null;
                    return (
                      <td
                        key={b.title + c.label}
                        style={{
                          ...cellBase,
                          borderLeft: i === 0 ? '1px solid var(--color-divider)' : undefined,
                          background: g ? tint(v, avgOf(c), c.invert) : bye ? rowBg : undefined,
                        }}
                      >
                        {g ? fmt(v, c.rate) : dash}
                      </td>
                    );
                  }))}
                </tr>
              );
            })}
            <tr>
              <td style={{ ...cellBase, ...sticky(0, W.wk), textAlign: 'left', paddingLeft: 14, font: '800 10px var(--font-heading)' }}>TOT</td>
              <td style={{ ...cellBase, ...sticky(W.wk, W.opp) }} />
              <td style={{ ...cellBase, ...sticky(W.wk + W.opp, W.fpts, 'var(--color-bg)', true), font: '800 12px var(--font-heading)' }}>{p.season.fpts.toFixed(2)}</td>
              <td style={cellBase}>{p.season.rank ?? '—'}</td>
              <td style={cellBase}>{snpAvg === null ? '—' : Math.round(snpAvg)}</td>
              {blocks.map((b) => b.cols.map((c, i) => (
                <td key={b.title + c.label} style={{ ...cellBase, font: '800 12px var(--font-body)', borderLeft: i === 0 ? '1px solid var(--color-divider)' : undefined }}>
                  {gp ? fmt(c.value(season), c.rate) : '—'}
                </td>
              )))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Skeleton() {
  const bar = (w: number | string, h: number): CSSProperties => ({ display: 'block', width: w, height: h, background: 'var(--color-neutral-200)' });
  return (
    <div aria-busy="true" aria-label="Loading player" style={{ padding: '14px', display: 'grid', gap: 10, animation: 'blip 1.6s infinite' }}>
      <span style={bar('40%', 12)} />
      {Array.from({ length: 10 }, (_, i) => <span key={i} style={bar('100%', 26)} />)}
    </div>
  );
}

/** For screens that want to open a card without a <PlayerLink>. */
export function usePlayerCard() {
  return useContext(Ctx);
}
