'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmtScore } from '@/lib/format';
import type { WeekView } from '@/lib/types';

/**
 * The weekly scoring race. This league awards a victory point to the top half
 * of the week's scorers (MFL `victoryPointsBuckets: "1 0"`), so every team is
 * also racing the whole league, not just its opponent. One horizontal track:
 * a tick per team placed by score, the cut between the last team in and the
 * first team out, the qualifying side shaded, and the user's tick in the
 * accent. Each team is shown by its franchise icon so it's recognisable at a
 * glance; scores bunch within a point of each other, so icons that would
 * collide are spread apart along one row and a leader line runs from each to
 * its exact score on the baseline.
 *
 * Before kickoff it races the projections. Once games are under way each
 * team is placed by its projected final (points banked plus what its starters
 * still to play are projected to add) until all its players are done, when
 * its actual score takes over. It follows the live overlay throughout.
 */

interface Team {
  id: string;
  name: string;
  score: number;
  icon?: string;
}

const AVATAR = 22;
const MY_AVATAR = 26;
/** Centre-to-centre spacing when icons have to be spread apart. */
const GAP = AVATAR + 2;
const ROW_Y = MY_AVATAR / 2 + 1;
const BASE_Y = MY_AVATAR + 13;
const TRACK_H = BASE_Y + 5;
const PAD_PCT = 4;

/**
 * Where each icon sits, in px. Overlapping icons are grouped and each group is
 * centred on the mean of its members' true positions, so a cluster stays as
 * close as it can to where its scores are; then the row is kept on the track.
 */
function spread(trueX: number[], width: number): number[] {
  type Cluster = { idx: number[]; centre: number };
  const order = trueX.map((_, i) => i).sort((a, b) => trueX[a] - trueX[b]);
  let clusters: Cluster[] = order.map((i) => ({ idx: [i], centre: trueX[i] }));
  const half = (c: Cluster) => ((c.idx.length - 1) * GAP) / 2;
  for (let merged = true; merged; ) {
    merged = false;
    for (let k = 0; k < clusters.length - 1; k++) {
      const a = clusters[k];
      const b = clusters[k + 1];
      if (b.centre - half(b) - (a.centre + half(a)) < GAP) {
        const idx = [...a.idx, ...b.idx];
        clusters = [
          ...clusters.slice(0, k),
          { idx, centre: idx.reduce((t, i) => t + trueX[i], 0) / idx.length },
          ...clusters.slice(k + 2),
        ];
        merged = true;
        break;
      }
    }
  }
  const out: number[] = [];
  for (const c of clusters) c.idx.forEach((i, j) => (out[i] = c.centre - half(c) + j * GAP));
  // Keep the row on the track: push in from the edges, preserving spacing.
  const lo = MY_AVATAR / 2;
  const hi = width - MY_AVATAR / 2;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    out[i] = Math.max(out[i], k === 0 ? lo : out[order[k - 1]] + GAP);
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    out[i] = Math.min(out[i], k === order.length - 1 ? hi : out[order[k + 1]] - GAP);
  }
  return out;
}

function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function MedianRace({ view }: { view: WeekView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 360);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const teams: Team[] = useMemo(
    () =>
      view.matchups
        .flatMap((m) => [m.home, m.away])
        .map((s) => ({
          id: s.franchiseId,
          name: s.name,
          score: !s.done && s.projectedFinal !== undefined ? s.projectedFinal : s.scoreValue,
          icon: s.icon,
        }))
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
  const truePx = teams.map((t) => (x(t.score) / 100) * width);
  const iconPx = spread(truePx, width);
  const myRank = rankOf(view.myFranchiseId);
  const me = teams[myRank - 1];

  const marginLine = (t: Team, rank: number) =>
    rank <= qualifiers
      ? `+${fmtScore(t.score - firstOut.score)} clear of ${ordinal(qualifiers + 1).toLowerCase()}`
      : `${fmtScore(lastIn.score - t.score)} back of ${ordinal(qualifiers).toLowerCase()}`;

  const pick = teams.find((t) => t.id === selected) ?? null;
  const phaseLabel = view.phase === 'pre' ? 'PROJECTED' : view.phase === 'live' ? 'LIVE · PROJECTED' : 'FINAL';

  /** Nearest icon to the pointer, so a tap anywhere on the track picks one. */
  const nearest = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < teams.length; i++) if (Math.abs(iconPx[i] - px) < Math.abs(iconPx[best] - px)) best = i;
    return teams[best].id;
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
          position: 'relative', height: TRACK_H, marginTop: 7, touchAction: 'pan-y',
          cursor: 'pointer', outlineOffset: 2,
        }}
      >
        {/* The qualifying side, shaded. */}
        <div style={{ position: 'absolute', left: `${cutX}%`, right: 0, top: 0, bottom: 0, background: 'var(--color-neutral-200)' }} />
        {/* Baseline the scores sit on. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: BASE_Y, height: 1, background: 'var(--color-neutral-300)' }} />
        {/* The cut: a hairline with end caps, so it never reads as a team. */}
        <div style={{ position: 'absolute', left: `${cutX}%`, top: 0, bottom: 0, width: 1, marginLeft: -0.5, background: 'var(--color-text)' }} />
        <div style={{ position: 'absolute', left: `${cutX}%`, top: 0, width: 9, height: 2, marginLeft: -4.5, background: 'var(--color-text)' }} />
        <div style={{ position: 'absolute', left: `${cutX}%`, bottom: 0, width: 9, height: 2, marginLeft: -4.5, background: 'var(--color-text)' }} />

        {/* Leader lines and exact-score ticks. */}
        <svg width={width} height={TRACK_H} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden>
          {teams.map((t, i) => {
            const mine = t.id === view.myFranchiseId;
            const inside = i < qualifiers;
            const ink = mine ? 'var(--color-accent)' : inside ? 'var(--color-text)' : 'var(--color-neutral-500)';
            const bottom = ROW_Y + (mine ? MY_AVATAR : AVATAR) / 2;
            return (
              <g key={t.id}>
                <line x1={iconPx[i]} y1={bottom} x2={truePx[i]} y2={BASE_Y - 3} stroke={ink} strokeWidth={mine ? 1.5 : 1} opacity={mine ? 1 : 0.55} />
                <rect x={truePx[i] - (mine ? 1.5 : 1)} y={BASE_Y - 3} width={mine ? 3 : 2} height={7} rx={1} fill={ink} />
              </g>
            );
          })}
        </svg>

        {teams
          .map((t, i) => ({ t, i }))
          // Paint the user's icon last so it's never covered.
          .sort((a, b) => Number(a.t.id === view.myFranchiseId) - Number(b.t.id === view.myFranchiseId))
          .map(({ t, i }) => (
            <Avatar
              key={t.id}
              team={t}
              left={iconPx[i]}
              mine={t.id === view.myFranchiseId}
              active={t.id === selected}
              inside={i < qualifiers}
            />
          ))}
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

/**
 * One team's franchise icon, or its initials when there is none or it fails to
 * load. Teams outside the cut are greyed so in-or-out reads at a glance; the
 * user's icon is larger and ringed in the accent.
 */
function Avatar({
  team, left, mine, active, inside,
}: {
  team: Team; left: number; mine: boolean; active: boolean; inside: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = mine ? MY_AVATAR : AVATAR;
  const ring = mine
    ? '0 0 0 1.5px var(--color-bg), 0 0 0 3px var(--color-accent)'
    : active
      ? '0 0 0 1.5px var(--color-bg), 0 0 0 3px var(--color-text)'
      : '0 0 0 1.5px var(--color-bg)';
  return (
    <div
      title={`${team.name} ${fmtScore(team.score)}`}
      style={{
        position: 'absolute', left, top: ROW_Y, width: size, height: size,
        marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%', overflow: 'hidden',
        background: 'var(--color-neutral-300)', boxShadow: ring,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: inside || mine ? undefined : 'grayscale(1)',
        opacity: inside || mine || active ? 1 : 0.6,
        zIndex: mine ? 3 : active ? 2 : 1,
        transition: 'left .4s ease, opacity .2s',
      }}
    >
      {team.icon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, unknown-size owner images in a static export
        <img
          src={team.icon}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ font: `800 ${mine ? 9.5 : 8.5}px var(--font-heading)`, letterSpacing: '-.02em', color: 'var(--color-neutral-800)' }}>
          {initials(team.name)}
        </span>
      )}
    </div>
  );
}
