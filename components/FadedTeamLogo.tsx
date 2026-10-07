'use client';

import { useState } from 'react';

/**
 * A team's icon pinned to the left edge of its row at full row height, fading
 * out to the right so a name can sit over its faded end — or the team's
 * initials, faint, when it has no icon or it won't load. Sits under the
 * content of a `position: relative; overflow: hidden` parent; content above
 * it needs `position: relative`.
 */
export default function FadedTeamLogo({ name, icon }: { name: string; icon?: string | null }) {
  const [failed, setFailed] = useState(false);
  const fade = 'linear-gradient(to right, #000 15%, transparent 88%)';
  return icon && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote, unknown-size owner images in a static export
    <img
      src={icon}
      alt=""
      aria-hidden
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        position: 'absolute', top: 0, left: 0, height: '100%', aspectRatio: '1', objectFit: 'cover',
        opacity: 0.45, maskImage: fade, WebkitMaskImage: fade,
      }}
    />
  ) : (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: 8, font: '800 18px var(--font-heading)', color: 'var(--color-neutral-300)',
      }}
    >
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
