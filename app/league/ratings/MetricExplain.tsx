'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { DISPLAY } from '@/components/team/format';
import type { RatingsView } from '@/lib/types';
import type { Metric } from './metrics';

type Row = RatingsView['rows'][number];

/** Small "i" after a column name, so people know it can be tapped. */
export function InfoDot() {
  return (
    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, marginLeft: 3, borderRadius: '50%', border: '1px solid currentColor', font: '700 8px/1 var(--font-body)', opacity: 0.8, verticalAlign: 1 }}>i</span>
  );
}

/** Version A: a short tooltip under the column name. Tap anywhere to close. */
export function MetricTooltip({ metric, anchor, onClose }: { metric: Metric; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(anchor.left);
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 280;
    const mid = anchor.left + anchor.width / 2;
    setLeft(Math.max(12, Math.min(window.innerWidth - w - 12, mid - w / 2)));
  }, [anchor]);
  useEffect(() => {
    const close = () => onClose();
    // Ignore the scroll that brings a half-hidden column into view as it's tapped.
    const opened = Date.now();
    const onScroll = () => { if (Date.now() - opened > 400) onClose(); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('scroll', onScroll, true); };
  }, [onClose]);
  const arrow = anchor.left + anchor.width / 2 - left - 6;
  return (
    <div ref={ref} role="tooltip" style={{ position: 'fixed', top: anchor.bottom + 8, left, zIndex: 30, width: 'min(300px, calc(100vw - 24px))', padding: '10px 12px 11px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-300)', color: 'var(--ink)', border: '1px solid var(--edge)', boxShadow: '0 8px 24px rgba(0,0,0,.35)', whiteSpace: 'normal', textAlign: 'left' }}>
      <span aria-hidden style={{ position: 'absolute', top: -6, left: arrow, width: 10, height: 10, background: 'var(--bg-300)', borderLeft: '1px solid var(--edge)', borderTop: '1px solid var(--edge)', transform: 'rotate(45deg)' }} />
      <div style={{ font: DISPLAY(11), letterSpacing: '.1em', color: 'var(--volt)', marginBottom: 5 }}>{metric.label}{metric.name.toUpperCase() !== metric.label && ` · ${metric.name.toUpperCase()}`}</div>
      <div style={{ font: '600 13px/1.4 var(--font-body)', marginBottom: 6 }}>{metric.short}</div>
      <div style={{ font: '500 12px/1.45 var(--font-body)', color: 'var(--ink-2)' }}>{metric.how.slice(0, 2).join(' ')}</div>
    </div>
  );
}

/** Version B: a full card that rises from the bottom, with your number and the league's high and low. */
export function MetricCard({ metric, rows, mine, onClose }: { metric: Metric; rows: Row[]; mine: string | null; onClose: () => void }) {
  const me = rows.find((r) => r.franchiseId === mine);
  const sorted = rows.slice().sort((a, b) => metric.value(b) - metric.value(a));
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  const h = { font: DISPLAY(10), letterSpacing: '.12em', color: 'var(--ink-3)', margin: '0 0 6px' } as const;
  const header = (
    <div style={{ padding: '8px 0 0 20px' }}>
      {metric.name.toUpperCase() !== metric.label && <div style={{ font: DISPLAY(11), letterSpacing: '.12em', color: 'var(--volt)' }}>{metric.label}</div>}
      <div style={{ font: DISPLAY(22, 800), marginTop: 4 }}>{metric.name}</div>
    </div>
  );
  return (
    <BottomSheet label={`What ${metric.label} means`} onClose={onClose} header={header} fixed>
      <div style={{ padding: '6px 20px 24px', font: '500 13.5px/1.5 var(--font-body)', color: 'var(--ink-2)' }}>
        <p style={{ margin: '0 0 16px', font: '600 15px/1.45 var(--font-body)', color: 'var(--ink)' }}>{metric.short}</p>

        {me && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', marginBottom: 18, borderRadius: 8, background: 'var(--bg-200)', boxShadow: 'inset 3px 0 0 var(--volt)' }}>
            <span style={{ font: DISPLAY(22, 800), color: 'var(--ink)', minWidth: 56 }}>{metric.show(me)}</span>
            <span style={{ font: '500 12.5px/1.4 var(--font-body)' }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>Your team.</b> {metric.example(me)}</span>
          </div>
        )}

        <h3 style={h}>HOW IT WORKS</h3>
        {metric.how.map((p) => <p key={p} style={{ margin: '0 0 8px' }}>{p}</p>)}

        <h3 style={{ ...h, marginTop: 16 }}>HOW TO READ IT</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 6, alignItems: 'baseline', marginBottom: 16 }}>
          {metric.scale.map(([v, m]) => (
            <span key={v} style={{ display: 'contents' }}>
              <span style={{ font: DISPLAY(13), color: 'var(--ink)', whiteSpace: 'nowrap' }}>{v}</span>
              <span>{m}</span>
            </span>
          ))}
        </div>

        <h3 style={h}>THIS SEASON</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 10, rowGap: 6, alignItems: 'center' }}>
          {([['HIGH', hi], ['LOW', lo]] as const).map(([k, r]) => (
            <span key={k} style={{ display: 'contents' }}>
              <span style={{ font: DISPLAY(10), letterSpacing: '.1em', color: 'var(--ink-3)' }}>{k}</span>
              <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ font: DISPLAY(14), color: 'var(--ink)' }}>{metric.show(r)}</span>
            </span>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
