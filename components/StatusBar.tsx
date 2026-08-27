/**
 * Mock device status bar. The 9:41 on the left is fixed chrome from the
 * design; `label` is the contextual right-hand text (clock or screen name).
 */
export default function StatusBar({ label }: { label: string }) {
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
      <span>9:41</span>
      <span>{label}</span>
    </div>
  );
}
