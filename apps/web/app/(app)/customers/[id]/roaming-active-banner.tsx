'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@assistigo/ui';
import { formatGrantRemaining, grantRemainingMs, type RoamingSessionView } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';

/**
 * "🟢 Roaming Access Active: 01h 48m remaining [Lock & End Session]" (§19.9, migration 0024).
 *
 * The countdown is cosmetic: the server is what actually stops answering once `expires_at`
 * passes (every RLS policy compares against `now()`), so a stopped clock here can under-count
 * the remaining time but can never grant a second of access the database would refuse.
 */
export function RoamingActiveBanner({
  customerId,
  session,
}: {
  customerId: string;
  session: RoamingSessionView;
}) {
  const t = useTranslations();
  const router = useRouter();
  // `RoamingSessionView` has no `status` field — it exists only because its session is active —
  // so the grant-arithmetic helpers, which read `status`, get a synthetic 'active' here.
  const expiresAt = session.expiresAt;
  const [remainingMs, setRemainingMs] = useState(() =>
    grantRemainingMs({ status: 'active', expiresAt }),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const remaining = grantRemainingMs({ status: 'active', expiresAt });
      setRemainingMs(remaining);
      // The window just ran out under the operator: hand the page back to the locked view.
      if (remaining <= 0) router.refresh();
    };
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [expiresAt, router]);

  async function endSession() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming/revoke`, {
        method: 'POST',
      });
      if (!response.ok && response.status !== 204) {
        const json = (await response.json().catch(() => null)) as {
          error?: { messageKey: string };
        } | null;
        setError(json?.error?.messageKey ?? 'errors.internal');
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError('errors.internal');
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Alert tone="success">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            🟢{' '}
            {t('customers.roaming.activeUntil', { remaining: formatGrantRemaining(remainingMs) })}
          </span>
          <Button size="sm" variant="danger" loading={pending} onClick={() => void endSession()}>
            🔒 {t('customers.roaming.endSession')}
          </Button>
        </div>
      </Alert>
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}
    </div>
  );
}
