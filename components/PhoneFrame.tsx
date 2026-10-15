import type { CSSProperties, ReactNode } from 'react';

/**
 * The 390px mobile column every screen sits in. Matches the outer div of
 * each design file: full viewport height, flex column, hairline side rules
 * (desktop only, see .phone-frame in globals.css; on a phone they'd sit on the screen edge).
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
      className="phone-frame"
      style={{
        width: 390,
        maxWidth: '100%',
        margin: '0 auto',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-000)', overflow: 'hidden', boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
