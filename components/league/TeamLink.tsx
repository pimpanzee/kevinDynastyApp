'use client';

import Link from 'next/link';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

/** Where a team name leads: your own team opens My Team, any other its League team page. */
export const teamHref = (id: string, mine?: string) => (id === mine ? '/team/' : `/league/team/${id}/`);

/**
 * A team's name (or logo) that opens that team's roster. Tapping it never
 * also triggers the row or card it sits in. `underline` marks it as a link
 * where it reads as plain text in a sentence.
 */
export default function TeamLink({ id, mine, children, underline, style, label, onNavigate }: {
  id: string | undefined;
  mine?: string;
  children: ReactNode;
  underline?: boolean;
  style?: CSSProperties;
  label?: string;
  onNavigate?: () => void;
}) {
  if (!id) return <>{children}</>;
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    onNavigate?.();
  };
  return (
    <Link
      href={teamHref(id, mine)}
      aria-label={label}
      onClick={click}
      style={{
        color: 'inherit',
        ...(underline ? { textDecoration: 'underline', textDecorationColor: 'var(--edge)', textUnderlineOffset: 3 } : { textDecoration: 'none' }),
        ...style,
      }}
    >
      {children}
    </Link>
  );
}
