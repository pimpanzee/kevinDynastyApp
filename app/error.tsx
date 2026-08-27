'use client';

import PhoneFrame from '@/components/PhoneFrame';
import StatusBar from '@/components/StatusBar';
import HeaderBar from '@/components/HeaderBar';

/**
 * The prototypes modelled no error state, but a live API needs one — MFL rate
 * limits, and a league can be mid-update. Rendered in the design's own
 * language rather than Next's default error page.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const rateLimited = /rate limit/i.test(error.message);

  return (
    <PhoneFrame>
      <StatusBar label="ERROR" />
      <HeaderBar />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 14px' }}>
        <div style={{ font: '800 11px var(--font-heading)', letterSpacing: '.14em', color: 'var(--color-accent)' }}>
          {rateLimited ? 'RATE LIMITED' : 'COULD NOT LOAD'}
        </div>
        <p style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
          {rateLimited
            ? 'MyFantasyLeague is throttling requests. Wait a moment before trying again — retrying immediately makes it worse.'
            : 'MyFantasyLeague did not return the data this screen needs.'}
        </p>
        <p style={{
          marginTop: 12, fontSize: 11, lineHeight: 1.5, color: 'var(--color-neutral-600)',
          borderLeft: '2px solid var(--color-divider)', paddingLeft: 9,
        }}>
          {error.message}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 20, height: 36, padding: '0 14px', cursor: 'pointer',
            background: 'var(--color-accent)', color: 'var(--color-bg)', border: 0,
            font: '800 11px var(--font-heading)', letterSpacing: '.06em',
          }}
        >
          TRY AGAIN
        </button>
      </div>
    </PhoneFrame>
  );
}
