import Link from 'next/link';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader from '@/components/ScoreHeader';
import StatusBar from '@/components/StatusBar';
import { BENCH, FINALS, STARTERS, genSide, type BenchTuple, type GenPlayer, type PlayerTuple } from '@/lib/mock/boxscore';
import { pctBar, winPct } from '@/lib/mock/derive';
import { matchupList } from '@/lib/mock/matchups';
import { phaseForWeek } from '@/lib/mock/weeks';
import type { Phase } from '@/lib/types';

interface Row {
  pos: string;
  hName: string;
  hPts: string;
  hProj: string;
  hLine: string;
  aName: string;
  aPts: string;
  aProj: string;
  aLine: string;
}

/** One starter/bench cell for the user's own authored roster. */
function authoredSide(x: PlayerTuple, phase: Phase) {
  if (phase === 'pre') {
    return {
      line: `${x[1]} · ${x[2].indexOf('4:25') === 0 ? '4:25 ET' : '1:00 ET'}`,
      pts: '—',
      proj: `proj ${x[4]}`,
    };
  }
  if (phase === 'final') {
    const f = FINALS[x[0]];
    return { line: f ? f[0] : x[2], pts: f ? f[1] : x[3], proj: `proj ${x[4]}` };
  }
  return { line: x[2].split(' · ')[1] || 'yet to play', pts: x[3], proj: `proj ${x[4]}` };
}

function authoredBench(b: BenchTuple, phase: Phase) {
  if (phase === 'pre') return { line: b[2], pts: '—', proj: `proj ${b[3]}` };
  if (phase === 'final') return { line: b[6], pts: b[7], proj: `proj ${b[3]}` };
  return { line: b[4], pts: b[5], proj: `proj ${b[3]}` };
}

/** A generated player formatted for the current phase. */
function genFmt(p: GenPlayer, phase: Phase) {
  if (phase === 'pre') return { pts: '—', line: 'SUN 1:00 ET', proj: `proj ${p.proj.toFixed(1)}` };
  if (phase === 'final') return { pts: p.fin.toFixed(1), line: 'FINAL', proj: `proj ${p.proj.toFixed(1)}` };
  return {
    pts: p.live.toFixed(1),
    proj: `proj ${p.proj.toFixed(1)}`,
    line: p.state === 'pending' ? '4:25 ET · yet to play' : p.state === 'mid' ? 'Q3 8:22 · in play' : 'FINAL',
  };
}

export default function MatchupDetailScreen({ week, index }: { week: number; index: number }) {
  const phase = phaseForWeek(week) as Phase;
  const list = matchupList(week);
  const mi = Math.min(Math.max(Number.isFinite(index) ? index : 0, 0), list.length - 1);
  const M = list[mi];
  const mFinal = M.state === 'FINAL';

  let rows: Row[];
  let bench: Row[];

  if (M.yours) {
    /* Known mock limitation: the authored boxscore is Week 11's. A past or
       future week re-renders these players under that week's phase. */
    rows = STARTERS.map(([pos, h, a]) => {
      const H = authoredSide(h, phase);
      const A = authoredSide(a, phase);
      return {
        pos,
        hName: h[0], hPts: H.pts, hProj: H.proj, hLine: H.line,
        aName: a[0], aPts: A.pts, aProj: A.proj, aLine: A.line,
      };
    });
    bench = BENCH.map(([h, a]) => {
      const H = authoredBench(h, phase);
      const A = authoredBench(a, phase);
      return {
        pos: h[1] === a[1] ? h[1] : 'BN',
        hName: h[0], hPts: H.pts, hProj: H.proj, hLine: H.line,
        aName: a[0], aPts: A.pts, aProj: A.proj, aLine: A.line,
      };
    });
  } else {
    const seed = mi * 97 + 5;
    const fh0 = mFinal ? M.hScore : M.hProj;
    const fa0 = mFinal ? M.aScore : M.aProj;
    const tph = phase === 'pre' ? M.hPre : M.hProj;
    const tpa = phase === 'pre' ? M.aPre : M.aProj;
    const used: Record<string, number> = {};
    const allDone = phase === 'final' || (phase === 'live' && mFinal);
    const HS = genSide(seed, phase === 'pre' ? 9 : Number(M.hLeft), tph, M.hScore, fh0, 9, used, allDone);
    const AS = genSide(seed + 311, phase === 'pre' ? 9 : Number(M.aLeft), tpa, M.aScore, fa0, 9, used, allDone);
    const HB = genSide(seed + 601, 0, 0, 0, 0, 4, used, allDone);
    const AB = genSide(seed + 907, 0, 0, 0, 0, 4, used, allDone);

    const pair = (h: GenPlayer, a: GenPlayer, pos: string): Row => {
      const fh = genFmt(h, phase);
      const fa = genFmt(a, phase);
      return {
        pos,
        hName: h.name, hPts: fh.pts, hProj: fh.proj, hLine: `${h.team} · ${fh.line}`,
        aName: a.name, aPts: fa.pts, aProj: fa.proj, aLine: `${a.team} · ${fa.line}`,
      };
    };
    rows = HS.map((h, i) => pair(h, AS[i], h.slot));
    bench = HB.map((h, i) => pair(h, AB[i], 'BN'));
  }

  const sum = (k: 'hPts' | 'aPts') => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0).toFixed(1);
  const ytpCount = (s: 'h' | 'a') =>
    rows.filter((r) => (s === 'h' ? r.hLine : r.aLine).indexOf('yet to play') >= 0).length;

  const [pw1, pw2] = winPct(M.hPre, M.aPre);
  const fh = M.yours ? sum('hPts') : mFinal ? M.hScore : M.hProj;
  const fa = M.yours ? sum('aPts') : mFinal ? M.aScore : M.aProj;

  const head =
    phase === 'pre'
      ? {
          hs: M.hPre, as: M.aPre, hSub: 'projected total', aSub: 'projected total',
          hYtp: `${M.hRec} · 9 YTP`, aYtp: `${M.aRec} · 9 YTP`,
          hWin: pw1, aWin: pw2, bar: pw1, tag: 'KICKOFF 1:00 ET', liveDot: false,
        }
      : phase === 'final'
        ? {
            hs: fh, as: fa, hSub: M.hPre, aSub: M.aPre,
            hYtp: `${M.hRec} · 0 YTP`, aYtp: `${M.aRec} · 0 YTP`,
            hWin: Number(fh) >= Number(fa) ? 'W' : 'L',
            aWin: Number(fa) > Number(fh) ? 'W' : 'L',
            bar: pctBar(fh, fa), tag: 'FINAL', liveDot: false,
          }
        : {
            hs: M.hScore, as: M.aScore,
            hSub: mFinal ? M.hPre : M.hProj, aSub: mFinal ? M.aPre : M.aProj,
            hYtp: `${M.hRec} · ${mFinal ? 0 : ytpCount('h')} YTP`,
            aYtp: `${M.aRec} · ${mFinal ? 0 : ytpCount('a')} YTP`,
            hWin: mFinal ? (Number(M.hScore) >= Number(M.aScore) ? 'W' : 'L') : M.hWin,
            aWin: mFinal ? (Number(M.aScore) > Number(M.hScore) ? 'W' : 'L') : M.aWin,
            bar: mFinal ? pctBar(M.hScore, M.aScore) : M.hWin === '—' ? '0%' : M.hWin,
            tag: mFinal ? 'FINAL' : 'LIVE', liveDot: !mFinal,
          };

  const clock = phase === 'pre' ? 'SUN 11:52 ET' : phase === 'final' ? 'SUN 11:38 ET' : 'SUN 1:07 ET';
  const pageHref = (n: number) => `/matchups/${week}/${(n + list.length) % list.length}`;

  return (
    <PhoneFrame>
      <StatusBar label={clock} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          padding: '0 14px',
          borderBottom: '2px solid var(--color-divider)',
        }}
      >
        {/* Back returns to the week this matchup was opened from. */}
        <Link
          href={`/matchups?week=${week}`}
          aria-label="Back to matchups"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 44,
            paddingRight: 4,
            font: '800 15px/1 var(--font-heading)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          ←
        </Link>
        <span style={{ font: '800 11px var(--font-heading)', letterSpacing: '.12em' }}>
          WEEK {week} MATCHUP
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          {head.liveDot && (
            <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />
          )}
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>
            {head.tag}
          </span>
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 44px',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <Link href={pageHref(mi - 1)} aria-label="Previous matchup" style={pagerStyle('right')}>
          ‹
        </Link>
        <div style={{ textAlign: 'center', font: '800 9.5px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-600)' }}>
          MATCHUP {mi + 1} OF {list.length}
          {M.yours ? ' · YOURS' : ''}
        </div>
        <Link href={pageHref(mi + 1)} aria-label="Next matchup" style={pagerStyle('left')}>
          ›
        </Link>
      </div>

      <div style={{ padding: '12px 14px 14px', borderBottom: '2px solid var(--color-divider)' }}>
        <ScoreHeader
          home={{ name: M.home, meta: head.hYtp, num: head.hs, sub: head.hSub }}
          away={{ name: M.away, meta: head.aYtp, num: head.as, sub: head.aSub }}
          win={[head.hWin, head.aWin]}
          bar={head.bar}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {rows.map((r, i) => (
          <PlayerRow key={`s-${i}-${r.hName}-${r.aName}`} row={r} />
        ))}

        <div
          style={{
            borderTop: '2px solid var(--color-divider)',
            borderBottom: '2px solid var(--color-divider)',
            padding: '11px 14px 7px',
            font: '800 10px var(--font-heading)',
            letterSpacing: '.14em',
            color: 'var(--color-neutral-600)',
          }}
        >
          BENCH
        </div>

        {bench.map((r, i) => (
          <PlayerRow key={`b-${i}-${r.hName}-${r.aName}`} row={r} bench />
        ))}

        <div style={{ height: 20 }} />
      </div>
    </PhoneFrame>
  );
}

function pagerStyle(border: 'left' | 'right'): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    [border === 'right' ? 'borderRight' : 'borderLeft']: '1px solid var(--color-divider)',
    font: '800 13px var(--font-heading)',
    color: 'var(--color-text)',
    cursor: 'pointer',
  };
}

/** Home player | position | away player. Bench rows are de-emphasised. */
function PlayerRow({ row, bench = false }: { row: Row; bench?: boolean }) {
  const nameSize = bench ? 12 : 12.5;
  const ptsFont = bench ? '800 15px/1 var(--font-heading)' : '800 18px/1 var(--font-heading)';
  const nameTone = bench ? 'var(--color-neutral-700)' : undefined;
  const awayNameTone = bench ? 'var(--color-neutral-700)' : 'var(--color-neutral-800)';
  const ptsTone = bench ? 'var(--color-neutral-700)' : undefined;
  const awayPtsTone = bench ? 'var(--color-neutral-700)' : 'var(--color-neutral-800)';

  const sub = { fontSize: 9.5, color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums' as const, marginTop: 3 };
  const clip = { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px 1fr', borderBottom: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px 10px 14px', minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: nameSize, fontWeight: 600, color: nameTone, ...clip }}>{row.hName}</div>
          <div style={{ ...sub, ...clip }}>{row.hLine}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: ptsFont, fontVariantNumeric: 'tabular-nums', color: ptsTone }}>{row.hPts}</div>
          <div style={sub}>{row.hProj}</div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: '800 9.5px var(--font-heading)',
          letterSpacing: '.06em',
          color: 'var(--color-neutral-600)',
          borderLeft: '1px solid var(--color-divider)',
          borderRight: '1px solid var(--color-divider)',
        }}
      >
        {row.pos}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px 10px 10px', minWidth: 0 }}>
        <div>
          <div style={{ font: ptsFont, fontVariantNumeric: 'tabular-nums', color: awayPtsTone }}>{row.aPts}</div>
          <div style={sub}>{row.aProj}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: nameSize, fontWeight: 600, color: awayNameTone, ...clip }}>{row.aName}</div>
          <div style={{ ...sub, ...clip }}>{row.aLine}</div>
        </div>
      </div>
    </div>
  );
}
