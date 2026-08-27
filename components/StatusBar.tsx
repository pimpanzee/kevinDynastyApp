/**
 * Mock device status bar. `label` is the contextual right-hand text (clock or
 * screen name). When the app is running on a simulated clock, the left slot
 * shows that date instead of the design's fixed 9:41 — otherwise there is no
 * way to tell which scenario you are looking at.
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
        {simulatedAt ? `SIM ${simulatedAt}` : '9:41'}
      </span>
      <span>{label}</span>
    </div>
  );
}
