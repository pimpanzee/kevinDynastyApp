'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader, { MatchupNote } from '@/components/ScoreHeader';
import StatusBar from '@/components/StatusBar';
import { getWeekMatchups } from '@/lib/mock/matchups';
import { CURRENT_WEEK, WEEKS, getWeek, isKnownWeek, phaseForWeek } from '@/lib/mock/weeks';
import type { Game } from '@/lib/types';

/** Final-score bar split, matching the Past design's unclamped calculation. */
function finalBar(h: string, a: string): string {
  return Math.round((Number(h) / (Number(h) + Number(a))) * 100) + '%';
}

/** A win-probability string as a bar width; "—" means no bar to draw. */
function barWidth(win: string): string {
  return win === '—' || win === '' ? '0%' : win;
}

export default function MatchupsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [weekOpen, setWeekOpen] = useState(false);

  const requested = Number(params.get('week'));
  const week = isKnownWeek(requested) ? requested : CURRENT_WEEK;
  const phase = phaseForWeek(week);
  const data = getWeekMatchups(week);
  const isLive = phase === 'live';
  const isFinal = phase === 'final';
  const isPre = phase === 'pre';

  const pickWeek = (n: number) => {
    setWeekOpen(false);
    if (n !== week) router.push(`/matchups?week=${n}`);
  };

  // The user's own game is always index 0 of the pager on Matchup Detail.
  const detailHref = (index: number) => `/matchups/${week}/${index}`;

  return (
    <PhoneFrame>
      <StatusBar label={data.clock} />

      <HeaderBar
        right={
          <button
            onClick={() => setWeekOpen((v) => !v)}
            aria-expanded={weekOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              background: 'none',
              border: '1px solid var(--color-divider)',
              padding: '0 11px',
              font: '800 11px var(--font-heading)',
              letterSpacing: '.06em',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            WEEK {week} <span style={{ fontSize: 8 }}>▼</span>
          </button>
        }
      />

      {weekOpen && (
        <div style={{ borderBottom: '2px solid var(--color-divider)', background: 'var(--color-neutral-200)' }}>
          {WEEKS.map((w) => (
            <div
              key={w.n}
              onClick={() => pickWeek(w.n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') pickWeek(w.n);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 44,
                padding: '0 14px',
                borderBottom: '1px solid var(--color-divider)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span>{w.label}</span>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 10, letterSpacing: '.08em' }}>
                {w.note}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px 6px' }}>
          {isLive && (
            <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />
          )}
          <span
            style={{
              font: '800 10px var(--font-heading)',
              letterSpacing: '.14em',
              color: isLive ? 'var(--color-accent)' : 'var(--color-neutral-600)',
            }}
          >
            {data.head}
          </span>
          {data.playersLeft && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--color-neutral-600)' }}>
              {data.playersLeft}
            </span>
          )}
        </div>

        <Link
          href={detailHref(0)}
          style={{
            display: 'block',
            borderTop: '2px solid var(--color-divider)',
            borderBottom: '2px solid var(--color-divider)',
            padding: '12px 14px 14px',
            cursor: 'pointer',
          }}
        >
          <ScoreHeader
            home={{
              name: data.home.name,
              meta: `${data.home.rec} · ${data.home.left} YTP`,
              num: isPre ? data.home.proj : data.home.score,
              sub: isPre ? 'projected total' : data.home.proj,
            }}
            away={{
              name: data.away.name,
              meta: `${data.away.rec} · ${data.away.left} YTP`,
              num: isPre ? data.away.proj : data.away.score,
              sub: isPre ? 'projected total' : data.away.proj,
            }}
            win={isFinal ? null : [data.home.win, data.away.win]}
            /* Future weeks show no probability bar — nothing has happened. */
            bar={isPre ? null : isFinal ? finalBar(data.home.score, data.away.score) : barWidth(data.home.win)}
            awayTone={isFinal ? 'var(--color-neutral-600)' : 'var(--color-neutral-800)'}
            subSize={isPre ? 9.5 : 11.5}
          >
            {data.note && <MatchupNote>{data.note}</MatchupNote>}
          </ScoreHeader>
        </Link>

        <div
          style={{
            padding: '11px 14px 7px',
            font: '800 10px var(--font-heading)',
            letterSpacing: '.14em',
            color: 'var(--color-neutral-600)',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          AROUND THE LEAGUE
        </div>

        {data.games.map((g, i) => (
          <GameRow key={`${g.home}-${g.away}`} game={g} phase={phase} href={detailHref(i + 1)} />
        ))}

        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}

/**
 * One "around the league" row. The mockups left these inert on the past and
 * future week states; here every row drills into that matchup's boxscore.
 */
function GameRow({ game, phase, href }: { game: Game; phase: string; href: string }) {
  const isFinalWeek = phase === 'final';
  const isPre = phase === 'pre';
  const gameFinal = game.state === 'FINAL';

  // On a finished week the winner keeps full ink and the loser steps back.
  const homeWon = Number(game.hScore) > Number(game.aScore);
  const hCol = isFinalWeek ? (homeWon ? 'var(--color-text)' : 'var(--color-neutral-600)') : 'var(--color-text)';
  const aCol = isFinalWeek
    ? homeWon
      ? 'var(--color-neutral-600)'
      : 'var(--color-text)'
    : 'var(--color-neutral-800)';

  const hs = isPre ? game.hPre : game.hScore;
  const as = isPre ? game.aPre : game.aScore;
  const hSub = isPre ? 'projected' : gameFinal && !isFinalWeek ? game.hPre : game.hProj;
  const aSub = isPre ? 'projected' : gameFinal && !isFinalWeek ? game.aPre : game.aProj;
  const hMeta = `${game.hRec} · ${game.hLeft} YTP`;
  const aMeta = `${game.aRec} · ${game.aLeft} YTP`;

  const showBar = !isFinalWeek && !isPre && !gameFinal;
  const showFinalTail = isFinalWeek || (!isPre && gameFinal);

  const line = (name: string, meta: string, score: string, sub: string, colour: string, first: boolean) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 58px',
        gap: 10,
        alignItems: 'center',
        marginTop: first ? undefined : 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: colour, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>{meta}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ font: '800 18px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: colour }}>
          {score}
        </div>
        <div style={{ font: '400 11.5px/1 var(--font-body)', color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
          {sub}
        </div>
      </div>
    </div>
  );

  return (
    <Link href={href} style={{ display: 'block', borderBottom: '1px solid var(--color-divider)', padding: '10px 14px', cursor: 'pointer' }}>
      {line(game.home, hMeta, hs, hSub, hCol, true)}
      {line(game.away, aMeta, as, aSub, aCol, false)}

      {showBar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, display: 'flex', height: 4, background: 'var(--color-neutral-300)' }}>
            <span style={{ background: 'var(--color-text)', width: barWidth(game.hWin) }} />
          </div>
          <span style={{ font: '800 9.5px var(--font-heading)', color: 'var(--color-neutral-600)', width: 54, textAlign: 'right' }}>
            {game.hWin} / {game.aWin}
          </span>
        </div>
      )}

      {showFinalTail && (
        <div style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)', marginTop: 8 }}>
          FINAL
        </div>
      )}

      {isPre && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>
            {game.kick}
          </span>
          <span style={{ marginLeft: 'auto', font: '800 9.5px var(--font-heading)', color: 'var(--color-neutral-600)' }}>
            {game.hWin} / {game.aWin}
          </span>
        </div>
      )}
    </Link>
  );
}
