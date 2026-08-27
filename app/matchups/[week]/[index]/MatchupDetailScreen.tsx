import Link from 'next/link';
import PhoneFrame from '@/components/PhoneFrame';
import ScoreHeader from '@/components/ScoreHeader';
import StatusBar from '@/components/StatusBar';
import type { BoxRowView, MatchupDetailView } from '@/lib/types';

export default function MatchupDetailScreen({
  view,
  nowOverride,
}: {
  view: MatchupDetailView;
  nowOverride: string | null;
}) {
  const withNow = (path: string) =>
    nowOverride ? `${path}${path.includes('?') ? '&' : '?'}now=${encodeURIComponent(nowOverride)}` : path;

  const pageHref = (n: number) => withNow(`/matchups/${view.week}/${(n + view.total) % view.total}`);

  return (
    <PhoneFrame>
      <StatusBar label={view.clock} simulatedAt={view.simulatedAt} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 14px', borderBottom: '2px solid var(--color-divider)' }}>
        {/* Back returns to the week this matchup was opened from. */}
        <Link
          href={withNow(`/matchups?week=${view.week}`)}
          aria-label="Back to matchups"
          style={{ display: 'flex', alignItems: 'center', height: 44, paddingRight: 4, font: '800 15px/1 var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          ←
        </Link>
        <span style={{ font: '800 11px var(--font-heading)', letterSpacing: '.12em' }}>WEEK {view.week} MATCHUP</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          {view.liveDot && <span style={{ width: 6, height: 6, background: 'var(--color-accent)', animation: 'blip 1.4s infinite' }} />}
          <span style={{ font: '800 10px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>{view.tag}</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', borderBottom: '1px solid var(--color-divider)' }}>
        <Link href={pageHref(view.index - 1)} aria-label="Previous matchup" style={pagerStyle('right')}>‹</Link>
        <div style={{ textAlign: 'center', font: '800 9.5px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-neutral-600)' }}>
          MATCHUP {view.index + 1} OF {view.total}
          {view.isMine ? ' · YOURS' : ''}
        </div>
        <Link href={pageHref(view.index + 1)} aria-label="Next matchup" style={pagerStyle('left')}>›</Link>
      </div>

      <div style={{ padding: '12px 14px 14px', borderBottom: '2px solid var(--color-divider)' }}>
        <ScoreHeader
          home={{ name: view.home.name, meta: view.home.meta, num: view.home.num, sub: view.home.sub }}
          away={{ name: view.away.name, meta: view.away.meta, num: view.away.num, sub: view.away.sub }}
          win={[view.home.win, view.away.win]}
          bar={view.bar}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {view.starters.map((r, i) => (
          <PlayerRow key={`s-${i}-${r.home.name}-${r.away.name}`} row={r} />
        ))}

        <div style={{
          borderTop: '2px solid var(--color-divider)', borderBottom: '2px solid var(--color-divider)',
          padding: '11px 14px 7px', font: '800 10px var(--font-heading)', letterSpacing: '.14em',
          color: 'var(--color-neutral-600)',
        }}>
          BENCH
        </div>

        {view.bench.map((r, i) => (
          <PlayerRow key={`b-${i}-${r.home.name}-${r.away.name}`} row={r} bench />
        ))}

        <div style={{ height: 20 }} />
      </div>
    </PhoneFrame>
  );
}

function pagerStyle(border: 'left' | 'right'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44,
    [border === 'right' ? 'borderRight' : 'borderLeft']: '1px solid var(--color-divider)',
    font: '800 13px var(--font-heading)', color: 'var(--color-text)', cursor: 'pointer',
  };
}

/** Home player | position | away player. Bench rows are de-emphasised. */
function PlayerRow({ row, bench = false }: { row: BoxRowView; bench?: boolean }) {
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
          <div style={{ fontSize: nameSize, fontWeight: 600, color: nameTone, ...clip }}>{row.home.name}</div>
          <div style={{ ...sub, ...clip }}>{row.home.line}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: ptsFont, fontVariantNumeric: 'tabular-nums', color: ptsTone }}>{row.home.pts}</div>
          <div style={sub}>{row.home.proj}</div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: '800 9.5px var(--font-heading)', letterSpacing: '.06em', color: 'var(--color-neutral-600)',
        borderLeft: '1px solid var(--color-divider)', borderRight: '1px solid var(--color-divider)',
      }}>
        {row.pos}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px 10px 10px', minWidth: 0 }}>
        <div>
          <div style={{ font: ptsFont, fontVariantNumeric: 'tabular-nums', color: awayPtsTone }}>{row.away.pts}</div>
          <div style={sub}>{row.away.proj}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: nameSize, fontWeight: 600, color: awayNameTone, ...clip }}>{row.away.name}</div>
          <div style={{ ...sub, ...clip }}>{row.away.line}</div>
        </div>
      </div>
    </div>
  );
}
