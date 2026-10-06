'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmtScore } from '@/lib/format';
import type { WeekView } from '@/lib/types';

/**
 * The weekly scoring race. This league awards a victory point to the top half
 * of the week's scorers (MFL `victoryPointsBuckets: "1 0"`), so every team is
 * also racing the whole league, not just its opponent. One horizontal track:
 * a tick per team placed by score, the cut between the last team in and the
 * first team out, the qualifying side shaded, and the user's tick in the
 * accent. Ticks rather than dots because scores bunch within a point of each
 * other and dots would collide.
 *
 * Reads the same scores the matchup rows show, so it follows the live overlay
 * and, before kickoff, the projections.
 */

interface Team {
  id: string;
  name: string;
  score: number;
}

const TRACK_H = 26;
const PAD_PCT = 4;

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function MedianRace({ view }: { view: WeekView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const teams: Team[] = useMemo(
    () =>
      view.matchups
        .flatMap((m) => [m.home, m.away])
        .map((s) => ({ id: s.franchiseId, name: s.name, score: s.scoreValue }))
        .sort((a, b) => b.score - a.score),
    [view.matchups],
  );

  const qualifiers = Math.floor(teams.length / 2);
  const max = teams[0]?.score ?? 0;
  const min = teams[teams.length - 1]?.score ?? 0;
  // Nothing to race yet: no projections, or no teams.
  if (teams.length < 2 || max <= 0 || qualifiers < 1) return null;

  const span = Math.max(max - min, 1);
  const x = (score: number) => PAD_PCT + ((score - min) / span) * (100 - 2 * PAD_PCT);
  const lastIn = teams[qualifiers - 1];
  const firstOut = teams[qualifiers];
  const cutX = x((lastIn.score + firstOut.score) / 2);

  const rankOf = (id: string) => teams.findIndex((t) => t.id === id) + 1;
  const myRank = rankOf(view.myFranchiseId);
  const me = teams[myRank - 1];

  const marginLine = (t: Team, rank: number) =>
    rank <= qualifiers
      ? `+${fmtScore(t.score - firstOut.score)} clear of ${ordinal(qualifiers + 1).toLowerCase()}`
      : `${fmtScore(lastIn.score - t.score)} back of ${ordinal(qualifiers).toLowerCase()}`;

  const pick = teams.find((t) => t.id === selected) ?? null;
  const phaseLabel = view.phase === 'pre' ? 'PROJECTED' : view.phase === 'live' ? 'LIVE' : 'FINAL';

  /** Nearest tick to the pointer — a 2px tick is too small to have to hit. */
  const nearest = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    let best = teams[0];
    for (const t of teams) if (Math.abs(x(t.score) - pct) < Math.abs(x(best.score) - pct)) best = t;
    return best.id;
  };

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0) return;
    setSelected(nearest(e.clientX));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = teams.findIndex((t) => t.id === (selected ?? view.myFranchiseId));
    if (e.key === 'ArrowLeft') setSelected(teams[Math.min(teams.length - 1, i + 1)].id);
    else if (e.key === 'ArrowRight') setSelected(teams[Math.max(0, i - 1)].id);
    else if (e.key === 'Escape') setSelected(null);
    else return;
    e.preventDefault();
  };

  const readout = pick
    ? { lead: `${ordinal(rankOf(pick.id))} · ${pick.name}`, tail: fmtScore(pick.score) }
    : me
      ? { lead: `YOU · ${ordinal(myRank)}`, tail: marginLine(me, myRank) }
      : null;

  return (
    <div style={{ padding: '10px 14px 11px', borderBottom: '2px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 14 }}>
        <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>
          TOP {qualifiers} RACE
        </span>
        <span style={{ font: '800 8.5px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-500)' }}>
          {phaseLabel}
        </span>
        {readout && (
          <span
            aria-live="polite"
            style={{
              marginLeft: 'auto', minWidth: 0, display: 'flex', gap: 6, alignItems: 'baseline',
              fontSize: 10.5, color: 'var(--color-text)', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ font: '800 10.5px var(--font-heading)', letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {readout.lead}
            </span>
            <span style={{ color: 'var(--color-neutral-700)', fontVariantNumeric: 'tabular-nums' }}>{readout.tail}</span>
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`Top ${qualifiers} scoring race`}
        aria-valuemin={1}
        aria-valuemax={teams.length}
        aria-valuenow={pick ? rankOf(pick.id) : myRank || 1}
        aria-valuetext={readout ? `${readout.lead}, ${readout.tail}` : undefined}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onKeyDown={onKey}
        onBlur={() => setSelected(null)}
        style={{
          position: 'relative', height: TRACK_H, marginTop: 6, touchAction: 'pan-y',
          cursor: 'pointer', outlineOffset: 2,
        }}
      >
        {/* Baseline across the full track. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: TRACK_H / 2, height: 1, background: 'var(--color-neutral-300)' }} />
        {/* The qualifying side, shaded. */}
        <div style={{ position: 'absolute', left: `${cutX}%`, right: 0, top: 0, bottom: 0, background: 'var(--color-neutral-200)' }} />
        {/* The cut: a hairline with end caps, so it never reads as a team's tick. */}
        <div style={{ position: 'absolute', left: `${cutX}%`, top: 0, bottom: 0, width: 1, marginLeft: -0.5, background: 'var(--color-text)' }} />
        <div style={{ position: 'absolute', left: `${cutX}%`, top: 0, width: 9, height: 2, marginLeft: -4.5, background: 'var(--color-text)' }} />
        <div style={{ position: 'absolute', left: `${cutX}%`, bottom: 0, width: 9, height: 2, marginLeft: -4.5, background: 'var(--color-text)' }} />

        {teams
          .slice()
          .reverse()
          .map((t) => {
            const mine = t.id === view.myFranchiseId;
            const active = t.id === selected;
            const inside = rankOf(t.id) <= qualifiers;
            const h = mine || active ? 22 : 12;
            return (
              <div
                key={t.id}
                title={`${t.name} ${fmtScore(t.score)}`}
                style={{
                  position: 'absolute',
                  left: `${x(t.score)}%`,
                  top: (TRACK_H - h) / 2,
                  height: h,
                  width: mine ? 3 : 2,
                  marginLeft: mine ? -1.5 : -1,
                  borderRadius: 1,
                  background: mine ? 'var(--color-accent)' : inside ? 'var(--color-text)' : 'var(--color-neutral-600)',
                  // Surface gap so bunched ticks stay distinct.
                  boxShadow: '0 0 0 1px var(--color-bg)',
                  outline: active && !mine ? '2px solid var(--color-accent-300)' : undefined,
                  zIndex: mine ? 3 : active ? 2 : 1,
                  transition: 'left .4s ease, height .15s',
                }}
              />
            );
          })}
      </div>

      {/* Table view for screen readers. */}
      <ol style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: -1, padding: 0 }}>
        {teams.map((t, i) => (
          <li key={t.id}>
            {i + 1}. {t.name} {fmtScore(t.score)}
            {i === qualifiers - 1 ? ' (cut line)' : ''}
          </li>
        ))}
      </ol>
    </div>
  );
}
