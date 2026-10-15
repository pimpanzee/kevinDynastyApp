import type { CSSProperties, ReactNode } from 'react';

/**
 * The 390px mobile column every screen sits in. Matches the outer div of
 * each design file: full viewport height, flex column, hairline side rules.
 */
export default function PhoneFrame({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: 390,
        maxWidth: '100%',
        margin: '0 auto',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-000)', overflow: 'hidden', boxSizing: 'border-box',
        borderLeft: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
