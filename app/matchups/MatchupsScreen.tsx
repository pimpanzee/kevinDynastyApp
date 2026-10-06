'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeaderBar from '@/components/HeaderBar';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader from '@/components/ScoreHeader';
import StatusBar from '@/components/StatusBar';
import type { MatchupView, WeekView } from '@/lib/types';

export default function MatchupsScreen({ view }: { view: WeekView }) {
  const router = useRouter();
  const [weekOpen, setWeekOpen] = useState(false);

  const isLive = view.phase === 'live';
  const isFinal = view.phase === 'final';
  const isPre = view.phase === 'pre';

  const pickWeek = (n: number) => {
    setWeekOpen(false);
    if (n !== view.week) router.push(`/matchups/${n}/`);
  };

  const mine = view.matchups[0];
  const rest = view.matchups.slice(1);

  return (
    <PhoneFrame>
      <StatusBar label={view.clock} simulatedAt={view.simulatedAt} />

      <HeaderBar
        right={
          <button
            onClick={() => setWeekOpen((v) => !v)}
            aria-expanded={weekOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32,
              background: 'none', border: '1px solid var(--color-divider)', padding: '0 11px',
              font: '800 11px var(--font-heading)', letterSpacing: '.06em',
              color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            WEEK {view.week} <span style={{ fontSize: 8 }}>▼</span>
          </button>
        }
      />

      {weekOpen && (
        <div style={{ borderBottom: '2px solid var(--color-divider)', background: 'var(--color-neutral-200)' }}>
          {view.weeks.map((w) => (
            <div
              key={w.n}
              onClick={() => pickWeek(w.n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickWeek(w.n); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                height: 44, padding: '0 14px', borderBottom: '1px solid var(--color-divider)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <span>{w.label}</span>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 10, letterSpacing: '.08em' }}>{w.note}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px 6px' }}>
          {isLive && <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />}
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: isLive ? 'var(--color-accent)' : 'var(--color-neutral-600)' }}>
            {view.head}
          </span>
          {view.playersLeft && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--color-neutral-600)' }}>{view.playersLeft}</span>
          )}
        </div>

        {mine && (
          <Link
            href={`/matchups/${view.week}/0/`}
            style={{
              display: 'block',
              borderTop: '2px solid var(--color-divider)',
              borderBottom: '2px solid var(--color-divider)',
              padding: '12px 14px 14px',
              cursor: 'pointer',
            }}
          >
            <ScoreHeader
              home={{ name: mine.home.name, meta: mine.home.meta, num: mine.home.num, sub: mine.home.sub }}
              away={{ name: mine.away.name, meta: mine.away.meta, num: mine.away.num, sub: mine.away.sub }}
              win={isFinal ? null : [mine.home.win, mine.away.win]}
              bar={mine.bar}
              awayTone={isFinal ? 'var(--color-neutral-600)' : 'var(--color-neutral-800)'}
              subSize={isPre ? 9.5 : 11.5}
            />
          </Link>
        )}

        <div style={{
          padding: '11px 14px 7px', font: '800 10px var(--font-heading)', letterSpacing: '.14em',
          color: 'var(--color-neutral-600)', borderBottom: '2px solid var(--color-divider)',
        }}>
          AROUND THE LEAGUE
        </div>

        {rest.map((m) => (
          <GameRow key={m.index} matchup={m} finalWeek={isFinal} pre={isPre} href={`/matchups/${view.week}/${m.index}/`} />
        ))}

        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </PhoneFrame>
  );
}

function GameRow({
  matchup, finalWeek, pre, href,
}: {
  matchup: MatchupView; finalWeek: boolean; pre: boolean; href: string;
}) {
  const homeWon = matchup.home.scoreValue > matchup.away.scoreValue;
  const hCol = finalWeek ? (homeWon ? 'var(--color-text)' : 'var(--color-neutral-600)') : 'var(--color-text)';
  const aCol = finalWeek ? (homeWon ? 'var(--color-neutral-600)' : 'var(--color-text)') : 'var(--color-neutral-800)';

  const line = (name: string, meta: string, score: string, sub: string, colour: string, first: boolean) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px', gap: 10, alignItems: 'center', marginTop: first ? undefined : 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: colour, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>{meta}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ font: '800 18px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: colour }}>{score}</div>
        <div style={{ font: '400 11.5px/1 var(--font-body)', color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
          {pre ? 'projected' : sub}
        </div>
      </div>
    </div>
  );

  return (
    <Link href={href} style={{ display: 'block', borderBottom: '1px solid var(--color-divider)', padding: '10px 14px', cursor: 'pointer' }}>
      {line(matchup.home.name, matchup.home.meta, matchup.home.num, matchup.home.sub, hCol, true)}
      {line(matchup.away.name, matchup.away.meta, matchup.away.num, matchup.away.sub, aCol, false)}

      {matchup.bar && !matchup.final && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, display: 'flex', height: 4, background: 'var(--color-neutral-300)' }}>
            <span style={{ background: 'var(--color-text)', width: matchup.bar }} />
          </div>
          <span style={{ font: '800 9.5px var(--font-heading)', color: 'var(--color-neutral-600)', width: 54, textAlign: 'right' }}>
            {matchup.home.win} / {matchup.away.win}
          </span>
        </div>
      )}

      {matchup.tail && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)' }}>{matchup.tail}</span>
          {pre && (
            <span style={{ marginLeft: 'auto', font: '800 9.5px var(--font-heading)', color: 'var(--color-neutral-600)' }}>
              {matchup.home.win} / {matchup.away.win}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
