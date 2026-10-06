import type { MetadataRoute } from 'next';

/**
 * Installable web app. `standalone` is what makes a Home Screen launch open
 * full-screen instead of as a Safari tab. Paths carry the Pages base path,
 * which Next does not add inside the manifest itself.
 */
export const dynamic = 'force-static';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GRIDLOCK',
    short_name: 'GRIDLOCK',
    description: 'Dynasty fantasy football league hub',
    id: `${base}/`,
    start_url: `${base}/matchups/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3f2f2',
    theme_color: '#f3f2f2',
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
