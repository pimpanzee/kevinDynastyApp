/**
 * A player's NFL injury designation beside their name: Q, D, O or IR, as a
 * small outlined chip in --fall. Also used for BYE / NO PROJ lineup flags.
 */

const LABEL: Record<string, string> = { Q: 'Questionable', D: 'Doubtful', O: 'Out', IR: 'Injured reserve', BYE: 'On bye this week', 'NO PROJ': 'Not projected to play' };

export default function InjuryTag({ tag }: { tag?: string }) {
  if (!tag) return null;
  return (
    <span
      title={LABEL[tag]}
      aria-label={LABEL[tag]}
      style={{
        flex: 'none', font: '700 9.5px/1 var(--font-display)', letterSpacing: '.06em',
        color: 'var(--fall)', border: '1px solid var(--fall)', borderRadius: 2, padding: '2px 3px',
      }}
    >
      {tag}
    </span>
  );
}
