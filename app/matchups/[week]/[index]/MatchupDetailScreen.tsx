'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar, { HeaderButton } from '@/components/HeaderBar';
import InjuryTag from '@/components/InjuryTag';
import PhoneFrame from '@/components/PhoneFrame';
import { PlayerLink } from '@/components/PlayerCard';
import ScoreSheet from '@/components/ScoreSheet';
import TeamAvatar from '@/components/TeamAvatar';
import WeekMenu from '@/components/WeekMenu';
import { posColor, posRank } from '@/components/pos';
import { applyLineupsToDetail, applyLiveToDetail, applyStatsToDetail } from '@/lib/live';
import { lineupIssue, type LineupIssue } from '@/lib/lineupAlerts';
import { detailMineOnLeft, useMyTeam } from '@/lib/myTeam';
import type { BoxPlayerView, MatchupDetailView, SideView, WeekOption } from '@/lib/types';
import { gameLine, useNflScores } from '@/lib/nflGames';
import { useLive, useLiveStats } from '@/lib/useLive';

type Side = 'home' | 'away';
/** Which player's breakdown is open: section, side, and the row's index in its source list. */
type Open = { bench: boolean; side: Side; row: number } | null;
/** A player on one side, with where he came from so an open sheet follows live updates. */
type Slot = { p: BoxPlayerView; row: number };

const DISPLAY = (size: number, weight = 700) => `${weight} ${size}px/1 var(--font-display)`;
const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

const notStarted = (p: BoxPlayerView) => p.pts === '—' || p.line.includes('yet to play');
const num = (s: string) => Number(s.replace(/[^\d.-]/g, '')) || 0;

/**
 * One roster's players stacked on their own: QB → RB → WR → TE, highest
 * scoring first within a position, players yet to play last (by projection).
 */
function stack(rows: Array<Record<Side, BoxPlayerView>>, side: Side): Slot[] {
  return rows
    .map((r, row) => ({ p: r[side], row }))
    .filter((s) => s.p.name)
    .sort((a, b) => {
      const pa = a.p.live?.position, pb = b.p.live?.position;
      if (posRank(pa) !== posRank(pb)) return posRank(pa) - posRank(pb);
      const ya = notStarted(a.p), yb = notStarted(b.p);
      if (ya !== yb) return ya ? 1 : -1;
      return ya ? num(b.p.proj) - num(a.p.proj) : num(b.p.pts) - num(a.p.pts);
    });
}

/** "SEA · FINAL" → status "Final"; "in play" → "Live" (red); kickoff loses "· yet to play"; TBD is a bye. */
function status(p: BoxPlayerView): { text: string; live: boolean } {
  const [, ...rest] = p.line.split(' · ');
  const s = rest.filter((t) => t !== 'yet to play').join(' · ');
  if (/^FINAL$/i.test(s)) return { text: 'Final', live: false };
  if (/in play/i.test(s)) return { text: 'Live', live: true };
  if (s === 'TBD') return { text: 'Bye', live: false };
  return { text: s, live: false };
}

export default function MatchupDetailScreen({ view: built, weeks }: { view: MatchupDetailView; weeks: WeekOption[] }) {
  const live = useLive(built.week, built.liveWindow);
  const stats = useLiveStats(built.scoring?.statsUrl, built.liveWindow);
  const nfl = useNflScores(built.scoresUrl, built.liveWindow);
  const game = (p: BoxPlayerView) => gameLine(p, nfl, !!built.simulatedAt);
  // Scores once games are under way; lineups (and pre-game projections) any time.
  const lived = live?.started ? applyLiveToDetail(built, live) : built;
  const scored = live ? applyLineupsToDetail(lived, live) : lived;
  const team = useMyTeam(built.myFranchiseId);
  const isMine = built.home.franchiseId === team || built.away.franchiseId === team;
  // Your own matchup always has you on the left, home or away.
  const view = detailMineOnLeft(stats ? applyStatsToDetail(scored, stats) : scored, team);
  const mySide: Side | null = view.home.franchiseId === team ? 'home' : view.away.franchiseId === team ? 'away' : null;
  const final = view.tag === 'FINAL';
  const pre = view.tag.startsWith('KICKOFF');
  const alerts = mySide && !final
    ? view.starters.map((r) => r[mySide]).flatMap((p) => {
        const issue = rowIssue(p);
        return issue ? [{ name: p.name, issue }] : [];
      })
    : [];

  // The picker's per-week results are the viewer's team's.
  const personalWeeks = weeks.map((w) => ({ ...w, note: w.notes ? (w.notes[team] ?? '') : w.note }));
  const router = useRouter();
  const [weekOpen, setWeekOpen] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const openPlayer: BoxPlayerView | undefined =
    open ? (open.bench ? view.bench : view.starters)[open.row]?.[open.side] : undefined;
  const pageHref = (n: number) => `/matchups/${view.week}/${(n + view.total) % view.total}/`;
  // Changing the week keeps you on this slot: your game for yours (resolved by the list page).
  const pickWeek = (n: number) => {
    setWeekOpen(false);
    if (n === view.week) return;
    router.push(isMine ? `/matchups/${n}/?open=mine` : `/matchups/${n}/${view.index}/`);
  };

  const L = stack(view.starters, 'home'), R = stack(view.starters, 'away');
  const BL = stack(view.bench, 'home'), BR = stack(view.bench, 'away');

  return (
    <PhoneFrame style={{ position: 'relative' }}>
      <HeaderBar
        back={`/matchups/${view.week}/`}
        right={<HeaderButton aria-expanded={weekOpen} onClick={() => setWeekOpen((v) => !v)}>WEEK {view.week}</HeaderButton>}
      />
      {weekOpen && <WeekMenu weeks={personalWeeks} current={view.week} onPick={pickWeek} onClose={() => setWeekOpen(false)} />}

      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', height: 44, borderBottom: '1px solid var(--line)', background: 'var(--bg-100)' }}>
        <Link href={pageHref(view.index - 1)} aria-label="Previous matchup" style={pager}><Chev d="m15 18-6-6 6-6" /></Link>
        <div style={{ textAlign: 'center', font: DISPLAY(12), letterSpacing: '.12em', color: 'var(--ink-3)' }}>
          MATCHUP {view.index + 1} OF {view.total}{isMine ? ' · YOURS' : ''}
        </div>
        <Link href={pageHref(view.index + 1)} aria-label="Next matchup" style={pager}><Chev d="m9 18 6-6-6-6" /></Link>
      </div>

      <ScoreBlock view={view} mine={mySide === 'home'} pre={pre} final={final} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {alerts.length > 0 && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 16px 4px', padding: '9px 12px', background: 'var(--bg-100)', border: '1px solid var(--line)', borderRadius: 6 }}>
            <span style={{ flex: 'none', font: DISPLAY(10), letterSpacing: '.08em', padding: '3px 5px', background: 'var(--live)', color: '#fff', borderRadius: 2 }}>LINEUP</span>
            <span style={{ font: '500 13px/1.3 var(--font-body)' }}>{alerts.map((a) => `${a.name} ${ISSUE[a.issue]}`).join('. ')}</span>
          </div>
        )}

        <SectionHead label="STARTERS" right={`${L.length} · ${R.length}`} mark />
        <Columns
          left={L.map((s) => <StarterCell key={s.row} slot={s} side="home" game={game(s.p)} pre={pre} onScore={() => setOpen({ bench: false, side: 'home', row: s.row })} />)}
          right={R.map((s) => <StarterCell key={s.row} slot={s} side="away" game={game(s.p)} pre={pre} onScore={() => setOpen({ bench: false, side: 'away', row: s.row })} />)}
        />

        <div style={{ marginTop: 12 }}><SectionHead label="BENCH" muted /></div>
        <Columns
          muted
          left={BL.map((s) => <BenchCell key={s.row} slot={s} side="home" game={game(s.p)} onScore={() => setOpen({ bench: true, side: 'home', row: s.row })} />)}
          right={BR.map((s) => <BenchCell key={s.row} slot={s} side="away" game={game(s.p)} onScore={() => setOpen({ bench: true, side: 'away', row: s.row })} />)}
        />
        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
      {openPlayer?.breakdown && <ScoreSheet week={view.week} player={openPlayer} game={game(openPlayer)} onClose={close} />}
    </PhoneFrame>
  );
}

const ISSUE: Record<LineupIssue, string> = { IR: 'is on IR', OUT: 'is out', BYE: 'is on bye', DOUBTFUL: 'is doubtful', 'NO PROJ': 'is not projected to play' };

const pager = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, color: 'var(--ink-2)' } as const;
function Chev({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

function SectionHead({ label, right, mark, muted }: { label: string; right?: string; mark?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', marginTop: mark ? 8 : 0 }}>
      {mark && <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />}
      <span style={{ font: DISPLAY(12), letterSpacing: '.12em', color: muted ? 'var(--ink-3)' : 'var(--ink)' }}>{label}</span>
      {right && <span style={{ marginLeft: 'auto', font: DISPLAY(12), letterSpacing: '.1em', color: 'var(--ink-3)' }}>{right}</span>}
    </div>
  );
}

function Columns({ left, right, muted }: { left: React.ReactNode[]; right: React.ReactNode[]; muted?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start', color: muted ? 'var(--ink-2)' : undefined }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      <div style={{ minWidth: 0, borderLeft: '1px solid var(--line)' }}>{right}</div>
    </div>
  );
}

/** The score block: chips, names, records, big scores, odds or FINAL, and the bar. */
function ScoreBlock({ view, mine, pre, final }: { view: MatchupDetailView; mine: boolean; pre: boolean; final: boolean }) {
  const homeLeads = view.home.scoreValue >= view.away.scoreValue;
  const tone = (side: SideView, isHome: boolean) => {
    if (pre) return 'var(--ink-3)';
    if (isHome && mine) return 'var(--volt)';
    return (isHome ? homeLeads : !homeLeads) ? 'var(--ink)' : 'var(--ink-2)';
  };
  const nameTone = (isHome: boolean) => (pre || (isHome && mine) ? 'var(--ink)' : (isHome ? homeLeads : !homeLeads) ? 'var(--ink)' : 'var(--ink-2)');
  const total = view.home.scoreValue + view.away.scoreValue;
  const pct = final ? (total > 0 ? Math.round((view.home.scoreValue / total) * 100) : 50) : parseInt(view.bar, 10);
  const big = (side: SideView) => (pre ? '—' : side.num);
  const proj = (side: SideView) => (pre ? side.num : final ? '' : side.sub.replace(/^proj\s*/i, ''));
  const scoreFont = `800 ${pre ? 28 : 52}px/47px var(--font-display)`;
  const sub = { font: '500 12px/1 var(--font-body)', color: 'var(--ink-3)', marginTop: 5, fontVariantNumeric: 'tabular-nums' } as const;
  const head = (side: SideView, isHome: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexDirection: isHome ? 'row' : 'row-reverse', textAlign: isHome ? 'left' : 'right' }}>
      <TeamAvatar name={side.name} icon={side.icon ?? null} size={30} mine={isHome && mine} />
      <div style={{ minWidth: 0 }}>
        <div style={{ font: DISPLAY(17), letterSpacing: '.04em', color: nameTone(isHome), ...clip }}>{side.name.toUpperCase()}</div>
        <div style={{ font: '500 11px/1.2 var(--font-body)', color: 'var(--ink-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{side.meta}</div>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 'none', padding: '12px 16px 14px', background: 'var(--bg-100)', borderBottom: '1px solid var(--edge)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'end', gap: 12 }}>
        {head(view.home, true)}
        {head(view.away, false)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginTop: 12 }}>
        <div>
          <div style={{ font: scoreFont, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: tone(view.home, true) }}>{big(view.home)}</div>
          {proj(view.home) && <div style={sub}>{proj(view.home)}</div>}
        </div>
        <div style={{ padding: '0 10px', textAlign: 'center', font: DISPLAY(13), letterSpacing: '.1em', fontVariantNumeric: 'tabular-nums', color: final ? 'var(--ink)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          {final ? 'FINAL' : `${view.home.win} / ${view.away.win}`}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: scoreFont, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: tone(view.away, false) }}>{big(view.away)}</div>
          {proj(view.away) && <div style={sub}>{proj(view.away)}</div>}
        </div>
      </div>
      {Number.isFinite(pct) && (
        <div style={{ display: 'flex', gap: 2, height: 7, marginTop: 12 }}>
          <span style={{ width: `${pct}%`, background: pct >= 50 ? 'var(--ink)' : 'var(--bg-300)' }} />
          <span style={{ flex: 1, background: pct >= 50 ? 'var(--bg-300)' : 'var(--ink)' }} />
        </div>
      )}
    </div>
  );
}

/** `POS · TM · Status` — position in its colour, team grey, a live game in red. */
function StatusLine({ p, right }: { p: BoxPlayerView; right?: boolean }) {
  const st = status(p);
  const pos = p.live?.position ?? '';
  return (
    <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', marginTop: 2, textAlign: right ? 'right' : undefined, ...clip }}>
      {pos && <span style={{ fontWeight: 700, color: posColor(pos) }}>{pos}</span>}
      {pos && ' · '}
      {p.live?.team ?? p.line.split(' · ')[0]}
      {st.text && <span style={{ color: st.live ? 'var(--live)' : undefined }}> · {st.text}</span>}
    </div>
  );
}

function StarterCell({ slot, side, game, pre, onScore }: { slot: Slot; side: Side; game: string; pre: boolean; onScore: () => void }) {
  const { p } = slot;
  const right = side === 'away';
  const issue = rowIssue(p);
  const flag = issue === 'BYE' ? 'BYE' : issue === 'NO PROJ' ? 'NO PROJ' : undefined;
  const name = (
    <div style={{ flex: 1, minWidth: 0, textAlign: right ? 'right' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: right ? 'flex-end' : undefined }}>
        {right && <><InjuryTag tag={p.injury} /><InjuryTag tag={flag} /></>}
        <span style={{ font: '600 13.5px/1.25 var(--font-body)', minWidth: 0, ...clip }}>
          <PlayerLink playerId={p.live?.id}>{p.name}</PlayerLink>
        </span>
        {!right && <><InjuryTag tag={p.injury} /><InjuryTag tag={flag} /></>}
      </div>
      <StatusLine p={p} right={right} />
      {game && <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', marginTop: 1, fontVariantNumeric: 'tabular-nums', ...clip }}>{game}</div>}
    </div>
  );
  const yet = notStarted(p);
  const scoreInner = (
    <>
      <div style={{ font: DISPLAY(19), fontVariantNumeric: 'tabular-nums', color: yet ? 'var(--ink-3)' : 'var(--ink)', paddingBottom: 2, borderBottom: p.breakdown ? '1px dotted var(--edge)' : undefined }}>{p.pts}</div>
      <div style={{ font: '500 10.5px/1 var(--font-body)', color: 'var(--ink-3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{p.proj.replace(/^proj\s*/i, '')}</div>
    </>
  );
  const score = p.breakdown ? (
    <button type="button" onClick={onScore} aria-label={`${p.name}: ${p.pts} points. Show score breakdown`}
      style={{ flex: 'none', border: 0, background: 'none', padding: 0, color: 'inherit', textAlign: right ? 'left' : 'right', cursor: 'pointer' }}>
      {scoreInner}
    </button>
  ) : <div style={{ flex: 'none', textAlign: right ? 'left' : 'right' }}>{scoreInner}</div>;
  return (
    <div style={{ padding: right ? '9px 16px 9px 10px' : '9px 10px 9px 16px', minWidth: 0, borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {right ? <>{score}{name}</> : <>{name}{score}</>}
      </div>
      {!pre && !yet && p.byline && (
        <div style={{ marginTop: 5, font: '500 10.5px/1.35 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', textAlign: right ? 'right' : undefined, ...clip }}>
          {p.byline.replace(/ /g, ' ')}
        </div>
      )}
    </div>
  );
}

function BenchCell({ slot, side, game, onScore }: { slot: Slot; side: Side; game: string; onScore: () => void }) {
  const { p } = slot;
  const right = side === 'away';
  const pts = p.breakdown ? (
    <button type="button" onClick={onScore} aria-label={`${p.name}: ${p.pts} points. Show score breakdown`}
      style={{ flex: 'none', border: 0, background: 'none', padding: 0, color: 'inherit', font: DISPLAY(16), fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>{p.pts}</button>
  ) : <div style={{ flex: 'none', font: DISPLAY(16), fontVariantNumeric: 'tabular-nums' }}>{p.pts}</div>;
  const name = (
    <div style={{ flex: 1, minWidth: 0, textAlign: right ? 'right' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: right ? 'flex-end' : undefined }}>
        {right && <InjuryTag tag={p.injury} />}
        <span style={{ font: '500 13px/1.25 var(--font-body)', minWidth: 0, ...clip }}><PlayerLink playerId={p.live?.id}>{p.name}</PlayerLink></span>
        {!right && <InjuryTag tag={p.injury} />}
      </div>
      <StatusLine p={p} right={right} />
      {game && <div style={{ font: '500 11px/1.3 var(--font-body)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', ...clip }}>{game}</div>}
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: right ? '8px 16px 8px 10px' : '8px 10px 8px 16px', minWidth: 0, borderBottom: '1px solid var(--line)' }}>
      {right ? <>{pts}{name}</> : <>{name}{pts}</>}
    </div>
  );
}

/** A starter's lineup problem, while his game hasn't kicked off. */
function rowIssue(p: BoxPlayerView): LineupIssue | null {
  if (!p.live || !p.name) return null;
  if (!notStarted(p)) return null;
  return lineupIssue({ injury: p.injury, bye: p.live.kickoff === 'TBD', proj: num(p.proj) });
}
