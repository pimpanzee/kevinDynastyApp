import type { ReactNode } from 'react';

/** Shown in place of a score before kickoff, in a light tone so it reads as empty. */
export const NO_SCORE = '—';
const NO_SCORE_TONE = 'var(--color-neutral-400)';

export interface ScoreSide {
  name: string;
  /** Record + players-yet-to-play line under the name. */
  meta: string;
  /** The big number: live score, final score or projected total. */
  num: string;
  /** The small line under the big number. */
  sub: string;
}

/**
 * The score block shared by the matchups card and the Matchup Detail header:
 * names row → big-number row → win-probability bar.
 *
 * `win` is null on the Past (final) layout, which drops the centre column and
 * splits the row 1fr/1fr instead. `awayTone` is the muted colour the away side
 * takes — neutral-800 on live/pre screens, neutral-600 once a week is final.
 */
export default function ScoreHeader({
  home,
  away,
  win,
  bar,
  awayTone = 'var(--color-neutral-800)',
  subSize = 11.5,
  children,
}: {
  home: ScoreSide;
  away: ScoreSide;
  win: [string, string] | null;
  bar: string | null;
  awayTone?: string;
  subSize?: number;
  children?: ReactNode;
}) {
  const subStyle = {
    fontSize: subSize,
    color: 'var(--color-neutral-600)',
    fontVariantNumeric: 'tabular-nums' as const,
    marginTop: 3,
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '600 14.5px/1.15 var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {home.name}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 3 }}>{home.meta}</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div style={{ font: '600 14.5px/1.15 var(--font-body)', color: awayTone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {away.name}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 3 }}>{away.meta}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: win ? '1fr auto 1fr' : '1fr 1fr',
          alignItems: 'center',
          marginTop: 11,
        }}
      >
        <div>
          <div style={{ font: '800 42px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: home.num === NO_SCORE ? NO_SCORE_TONE : undefined }}>{home.num}</div>
          {home.sub && <div style={subStyle}>{home.sub}</div>}
        </div>
        {win && (
          <div style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-neutral-600)', padding: '0 10px' }}>
            {win[0]} / {win[1]}
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '800 42px/1 var(--font-heading)', fontVariantNumeric: 'tabular-nums', color: away.num === NO_SCORE ? NO_SCORE_TONE : awayTone }}>{away.num}</div>
          {away.sub && <div style={subStyle}>{away.sub}</div>}
        </div>
      </div>

      {bar && (
        <div style={{ display: 'flex', height: 7, background: 'var(--color-neutral-300)', marginTop: 12 }}>
          <span style={{ background: 'var(--color-text)', width: bar }} />
        </div>
      )}

      {children}
    </>
  );
}

/** The italic-adjacent trash-talk note with its left accent rule. */
export function MatchupNote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '12px 0 0',
        fontSize: 11.5,
        lineHeight: 1.45,
        color: 'var(--color-neutral-700)',
        borderLeft: '2px solid var(--color-accent)',
        paddingLeft: 9,
      }}
    >
      {children}
    </p>
  );
}
