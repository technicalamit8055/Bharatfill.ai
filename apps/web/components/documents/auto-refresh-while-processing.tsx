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
export function AutoRefreshWhileProcessing({
  isProcessing,
  intervalMs = POLL_INTERVAL_MS,
}: {
  isProcessing: boolean;
  /**
   * Slower than the default for a page that only might change — a BharatDoc app customer's
   * documents, which the citizen can add from the phone at any moment.
   */
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isProcessing) return;
    // A hidden tab has nobody to show the change to; it catches up when it is looked at again.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isProcessing, intervalMs, router]);

  return null;
}
