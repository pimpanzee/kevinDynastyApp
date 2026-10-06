'use client';

import { useState } from 'react';

/**
 * Each franchise's icon, large and faded, behind its side of the score block:
 * home at the left edge, away at the right, both fading out toward the middle
 * so the numbers stay legible. Sits under the content of a `position:
 * relative; overflow: hidden` parent; content above it needs `position:
 * relative`.
 */
export default function TeamWatermarks({ home, away }: { home?: string; away?: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {home && <Mark src={home} side="left" />}
      {away && <Mark src={away} side="right" />}
    </div>
  );
}

function Mark({ src, side }: { src: string; side: 'left' | 'right' }) {
  // Owner-hosted images go missing; drop a broken one rather than show its frame.
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const fade = `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, #000 35%, transparent 92%)`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, unknown-size owner images in a static export
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        position: 'absolute', top: 0, bottom: 0, [side]: 0, height: '100%', aspectRatio: '1', maxWidth: '50%',
        objectFit: 'cover', opacity: 0.2, filter: 'saturate(.8)',
        maskImage: fade, WebkitMaskImage: fade,
      }}
    />
  );
}
