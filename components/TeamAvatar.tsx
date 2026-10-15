'use client';

import { useState } from 'react';

/** Two-letter-ish initials for a team name: "Ridge Runners" → "RR". */
export function teamInitials(name: string) {
  return name.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * A team's icon in a square chip, or its initials when it has none or it won't
 * load. `mine` paints the initials chip volt, the colour that always marks you.
 */
export default function TeamAvatar({ name, icon, size = 30, mine = false, code }: { name: string; icon: string | null; size?: number; mine?: boolean; code?: string }) {
  const [failed, setFailed] = useState(false);
  const showIcon = icon && !failed;
  return (
    <span style={{
      width: size, height: size, flex: 'none', borderRadius: 2, overflow: 'hidden',
      background: showIcon ? 'var(--bg-300)' : mine ? 'var(--volt)' : 'var(--bg-300)',
      color: mine ? 'var(--on-volt)' : 'var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      font: `800 ${Math.round(size * 0.42)}px/1 var(--font-display)`, letterSpacing: '.06em',
    }}>
      {showIcon ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote owner images in a static export
        <img src={icon} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (code ?? teamInitials(name))}
    </span>
  );
}
