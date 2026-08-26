'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 4000;

/**
 * Re-fetches the server component while any document on the page is still `processing`, so an
 * operator sees "Reading" resolve on its own instead of needing to refresh the page by hand.
 *
 * Stops polling as soon as the page re-renders with nothing left in `processing` — the caller
 * re-mounts this with a fresh `isProcessing` prop on every server refresh.
 */
export function AutoRefreshWhileProcessing({ isProcessing }: { isProcessing: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isProcessing, router]);

  return null;
}
