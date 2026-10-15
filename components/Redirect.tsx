'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Client-side redirect for an old route (a static export has no server redirects). */
export default function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return <meta httpEquiv="refresh" content={`0;url=${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${to}`} />;
}
