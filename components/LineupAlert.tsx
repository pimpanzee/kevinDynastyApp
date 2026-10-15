import Link from 'next/link';
import type { LineupIssue } from '@/lib/lineupAlerts';

const LABEL: Record<LineupIssue, string> = {
  IR: 'is on IR', OUT: 'is out', BYE: 'is on bye', DOUBTFUL: 'is doubtful', 'NO PROJ': 'is not projected to play',
};

/** "4:25" in ET, for "doubtful for the 4:25 kickoff". */
function kickoffTime(ms: number) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
    .format(new Date(ms)).replace(/\s?[AP]M$/, '');
}

/**
 * "Your lineup has a problem": starters who won't (or likely won't) score,
 * shown above the user's matchup in a card with a red LINEUP ALERT chip.
 * Red is the alert colour everywhere the alert appears.
 */
export default function LineupAlert({ alerts, href }: { alerts: Array<{ name: string; issue: LineupIssue; kickoff?: number | null }>; href?: string }) {
  if (!alerts.length) return null;
  const body = (
    <div role="alert" style={{ margin: '12px 16px', padding: '10px 12px', background: 'var(--bg-100)', border: '1px solid var(--line)', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: '700 10px/1 var(--font-display)', letterSpacing: '.08em', padding: '3px 5px', background: 'var(--live)', color: '#fff', borderRadius: 2 }}>LINEUP ALERT</span>
        <span style={{ font: '700 10px/1 var(--font-display)', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
          {alerts.length} {alerts.length === 1 ? 'STARTER' : 'STARTERS'}
        </span>
        {href && (
          <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--ink-3)', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </span>
        )}
      </div>
      <div style={{ marginTop: 7, font: '400 14px/1.4 var(--font-body)', color: 'var(--ink)' }}>
        {alerts.map((a, i) => (
          <span key={a.name + i}>
            {i > 0 && ' '}
            {a.name} {LABEL[a.issue]}
            {a.issue === 'DOUBTFUL' && a.kickoff ? ` for the ${kickoffTime(a.kickoff)} kickoff` : ''}.
          </span>
        ))}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ display: 'block', color: 'inherit' }}>{body}</Link> : body;
}
