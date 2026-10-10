import Link from 'next/link';
import type { LineupIssue } from '@/lib/lineupAlerts';

const LABEL: Record<LineupIssue, string> = {
  IR: 'on IR', OUT: 'out', BYE: 'on bye', DOUBTFUL: 'doubtful', 'NO PROJ': 'not projected to play',
};

/**
 * "Your lineup has a problem": starters who won't (or likely won't) score,
 * shown above the user's matchup. Links to the matchup when given an href.
 */
export default function LineupAlert({ alerts, href }: { alerts: Array<{ name: string; issue: LineupIssue }>; href?: string }) {
  if (!alerts.length) return null;
  const body = (
    <div
      role="alert"
      style={{
        margin: '0 14px 10px', padding: '9px 11px', border: '1px solid var(--color-accent)',
        background: 'color-mix(in srgb, var(--color-accent) 7%, var(--color-bg))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '800 10px var(--font-heading)', letterSpacing: '.12em', color: 'var(--color-accent-700)' }}>
        <span aria-hidden>⚠</span>
        LINEUP ALERT · {alerts.length} {alerts.length === 1 ? 'STARTER' : 'STARTERS'}
        {href && <span aria-hidden style={{ marginLeft: 'auto', fontSize: 12 }}>›</span>}
      </div>
      <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-text)' }}>
        {alerts.map((a, i) => (
          <span key={a.name + i}>
            {i > 0 && ' · '}
            <b>{a.name}</b> {LABEL[a.issue]}
          </span>
        ))}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ display: 'block', color: 'inherit' }}>{body}</Link> : body;
}
