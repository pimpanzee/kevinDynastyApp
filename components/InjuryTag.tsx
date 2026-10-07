/**
 * A player's NFL injury designation beside their name: Q, D, O or IR. Q reads
 * as a caution; the rest, which mean the player won't (or likely won't) play,
 * as the accent red.
 */

const LABEL: Record<string, string> = { Q: 'Questionable', D: 'Doubtful', O: 'Out', IR: 'Injured reserve' };

export default function InjuryTag({ tag }: { tag?: string }) {
  if (!tag) return null;
  const color = tag === 'Q' ? 'var(--color-accent-2-600)' : 'var(--color-accent-700)';
  return (
    <span
      title={LABEL[tag]}
      aria-label={LABEL[tag]}
      style={{
        flex: 'none',
        font: '800 8.5px/1 var(--font-heading)',
        letterSpacing: '.04em',
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '2px 3px 1.5px',
      }}
    >
      {tag}
    </span>
  );
}
