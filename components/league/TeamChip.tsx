import TeamAvatar from '@/components/TeamAvatar';

/** A team's logo in a 26px rounded square, initials on a tint without one. */
export default function TeamChip({ name, icon, size = 26 }: { name: string; icon: string | null; size?: number }) {
  return <TeamAvatar name={name} icon={icon} size={size} />;
}

/** Your row: raised with a 3px volt left edge. */
export const MINE_ROW = { background: 'var(--bg-200)', boxShadow: 'inset 3px 0 0 var(--volt)' } as const;
