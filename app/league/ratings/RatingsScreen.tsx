'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LeagueFrame from '@/components/league/LeagueFrame';
import TeamChip from '@/components/league/TeamChip';
import { DISPLAY } from '@/components/team/format';
import { useMyTeam } from '@/lib/myTeam';
import type { RatingsView } from '@/lib/types';
import { InfoDot, MetricCard, MetricTooltip } from './MetricExplain';
import { METRICS, type MetricKey } from './metrics';

const COLS = '200px 52px 58px 76px 66px';
const head = { textAlign: 'right', paddingRight: 8 } as const;

/** League › Ratings: power rankings with PWR, ELO, all-play record and luck. */
export default function RatingsScreen({ view }: { view: RatingsView }) {
  const mine = useMyTeam(view.myFranchiseId);
  // Mockup switch: ?explain=card shows the pop-up card, otherwise the tooltip.
  const [style, setStyle] = useState<'tip' | 'card'>('tip');
  useEffect(() => { if (new URLSearchParams(location.search).get('explain') === 'card') setStyle('card'); }, []);
  const [open, setOpen] = useState<{ key: MetricKey; anchor: DOMRect } | null>(null);
  const metric = open && METRICS.find((m) => m.key === open.key);
  const headBtn = (key: MetricKey, extra?: React.CSSProperties) => {
    const m = METRICS.find((x) => x.key === key)!;
    const on = open?.key === key;
    return (
      <button
        type="button"
        aria-label={`What ${m.label} means`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (on) return setOpen(null);
          const el = e.currentTarget;
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          requestAnimationFrame(() => setOpen({ key, anchor: el.getBoundingClientRect() }));
        }}
        style={{ ...head, ...extra, height: '100%', border: 0, background: 'none', font: 'inherit', letterSpacing: 'inherit', color: on ? 'var(--volt)' : extra?.color ?? 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: `0 ${extra?.paddingRight ?? 8}px 0 0` }}
      >
        {m.label}<InfoDot />
      </button>
    );
  };
  return (
    <LeagueFrame>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-100)' }}>
        <div style={{ width: 'max-content', minWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 16px', borderBottom: '1px solid var(--edge)', background: 'var(--bg-000)' }}>
            <span style={{ position: 'sticky', left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ width: 6, height: 12, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
              <span style={{ font: DISPLAY(12), letterSpacing: '.12em' }}>POWER RANKINGS · WEEK {view.week}</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 26, background: 'var(--bg-200)', borderBottom: '1px solid var(--line)', font: DISPLAY(10), letterSpacing: '.08em', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 16, background: 'var(--bg-200)', boxShadow: '1px 0 0 var(--line)' }}>TEAM</span>
            {headBtn('pwr', { color: 'var(--ink)' })}{headBtn('elo')}{headBtn('allPlay')}{headBtn('luck', { paddingRight: 16 })}
          </div>
          {view.rows.map((t) => {
            const me = t.franchiseId === mine;
            const move = t.move > 0 ? `▲${t.move}` : t.move < 0 ? `▼${-t.move}` : '–';
            const luckTone = t.luck >= 0.5 ? 'var(--rise)' : t.luck <= -0.5 ? 'var(--fall)' : 'var(--ink-3)';
            return (
              <Link key={t.franchiseId} href={`/league/team/${t.franchiseId}/`} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 44, borderBottom: '1px solid var(--line)', background: me ? 'var(--bg-200)' : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <span style={{ position: 'sticky', left: 0, zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 16px', boxSizing: 'border-box', minWidth: 0, background: me ? 'var(--bg-200)' : 'var(--bg-100)', boxShadow: `${me ? 'inset 3px 0 0 var(--volt), ' : ''}1px 0 0 var(--line)` }}>
                  <span style={{ flex: 'none', width: 22, textAlign: 'right', font: DISPLAY(18, 800), color: t.rank === 1 ? 'var(--volt)' : 'var(--ink)' }}>{t.rank}</span>
                  <span style={{ flex: 'none', width: 24, font: DISPLAY(10), letterSpacing: '.02em', color: t.move > 0 ? 'var(--rise)' : t.move < 0 ? 'var(--fall)' : 'var(--ink-3)' }}>{move}</span>
                  <TeamChip name={t.name} icon={t.icon} />
                  <span style={{ minWidth: 0, font: `${me ? 700 : 600} 13.5px/1.25 var(--font-body)`, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                </span>
                <span style={{ ...head, font: DISPLAY(17) }}>{t.pwr}</span>
                <span style={{ ...head, font: '500 13px/1 var(--font-body)', color: 'var(--ink-2)' }}>{t.elo.toLocaleString('en-US')}</span>
                <span style={{ ...head, font: '500 13px/1 var(--font-body)', color: 'var(--ink-2)' }}>{t.allPlay}</span>
                <span style={{ ...head, paddingRight: 16, font: '600 13px/1 var(--font-body)', color: luckTone }}>{t.luck > 0 ? '+' : t.luck < 0 ? '−' : ''}{Math.abs(t.luck).toFixed(1)}</span>
              </Link>
            );
          })}
          <div style={{ width: 358, maxWidth: '100vw', position: 'sticky', left: 0, padding: '10px 16px 14px', boxSizing: 'border-box', font: '500 11.5px/1.45 var(--font-body)', color: 'var(--ink-3)' }}>
            Tap a column name to see what it means.
          </div>
        </div>
      </div>
      {metric && open && style === 'tip' && <MetricTooltip metric={metric} anchor={open.anchor} onClose={() => setOpen(null)} />}
      {metric && style === 'card' && <MetricCard metric={metric} rows={view.rows} mine={mine} onClose={() => setOpen(null)} />}
    </LeagueFrame>
  );
}
