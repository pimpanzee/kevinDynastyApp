'use client';

import { useState } from 'react';

/** A team's icon in a circle, or its initials when it has none or it won't load. */
export default function TeamAvatar({ name, icon, size = 30 }: { name: string; icon: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-neutral-300)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      font: `800 ${Math.round(size / 3)}px var(--font-heading)`, color: 'var(--color-neutral-800)',
    }}>
      {icon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote owner images in a static export
        <img src={icon} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initials}
    </span>
  );
}
