/**
 * The design's status strip. `label` is the contextual right-hand text (clock
 * or screen name). On a simulated clock the left slot shows that date so you
 * can tell which scenario you are looking at; otherwise it stays empty — the
 * design's mock 9:41 just sat under the phone's real clock.
 */
export default function StatusBar({
  label,
  simulatedAt,
}: {
  label: string;
  simulatedAt?: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '9px 14px 3px',
        fontSize: 10,
        letterSpacing: '.1em',
        color: 'var(--color-neutral-600)',
      }}
    >
      <span title={simulatedAt ? 'Simulated clock' : undefined}>
        {simulatedAt ? `SIM ${simulatedAt}` : ''}
      </span>
      <span>{label}</span>
    </div>
  );
}
