'use client';

import { useEffect } from 'react';
import { resync } from '@/lib/push';
import { useAccount } from '@/lib/relay';

/**
 * Re-registers this device's push alerts with the relay on launch and
 * whenever the signed-in owner changes (lib/push.ts `resync`).
 */
export default function PushSync() {
  const account = useAccount();
  const token = account?.token;
  useEffect(() => {
    if (token) resync().catch(() => {});
  }, [token]);
  return null;
}
