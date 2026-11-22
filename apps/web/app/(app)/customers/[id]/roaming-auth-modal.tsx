'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, SegmentedControl, TextField } from '@assistigo/ui';
import {
  ROAMING_PURPOSE_LABELS,
  type RoamingAppRequestView,
  type RoamingPurpose,
} from '@assistigo/core';
import { localised } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';

type DurationMinutes = 60 | 120 | 240;

const PURPOSES: readonly RoamingPurpose[] = [
  'form_filling',
  'scheme_application',
  'profile_update',
  'document_access',
];
const DURATIONS: readonly DurationMinutes[] = [60, 120, 240];

/** app: request to the citizen's BharatDoc app (0039). otp: WhatsApp code (0024). */
type Method = 'app' | 'otp';
type Stage = 'closed' | 'form' | 'sent' | 'waiting';

/** How often the modal asks whether the citizen has answered in the app. */
const APPROVAL_POLL_MS = 3_000;

async function readErrorKey(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as {
    error?: { messageKey: string };
  } | null;
  return json?.error?.messageKey ?? 'errors.internal';
}

/** "4:59": the time left on a request. Cosmetic; the server decides when it has run out. */
function formatCountdown(expiresAt: string): string {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The consent flow for a `roaming_locked` customer.
 * Master spec §19.2; migrations 0024 (OTP) and 0039 (approval in the BharatDoc app).
 *
 * The citizen says yes one of two ways, and there is no path in this component that unlocks the
 * profile without them:
 *   app  a request to their BharatDoc app. They see the centre and purpose, pick how long
 *        (1, 2 or 4 hours) and tap Approve, so there is no duration picker here; we poll.
 *   otp  a WhatsApp code for a window the operator picks, which the citizen reads back.
 * The server answers the same way whether or not the person uses the app.
 */
export function RoamingAuthModal({ customerId }: { customerId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('closed');
  const [method, setMethod] = useState<Method>('app');
  const [purpose, setPurpose] = useState<RoamingPurpose>('form_filling');
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(120);
  const [otp, setOtp] = useState('');
  const [mobileLast4, setMobileLast4] = useState<string | null>(null);
  const [request, setRequest] = useState<{ id: string; expiresAt: string } | null>(null);
  const [countdown, setCountdown] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While waiting on the app: tick the countdown and poll for the citizen's answer.
  useEffect(() => {
    if (stage !== 'waiting' || !request) return;
    let cancelled = false;
    const tick = () => setCountdown(formatCountdown(request.expiresAt));
    const poll = async () => {
      const response = await fetch(
        `/api/customers/${customerId}/roaming/app-request/${request.id}`,
        { cache: 'no-store' },
      ).catch(() => null);
      if (cancelled || !response?.ok) return;
      const { data: view } = (await response.json()) as { data: RoamingAppRequestView };
      if (cancelled || view.status === 'pending') return;
      setRequest(null);
      if (view.status === 'approved') {
        setStage('closed');
        router.refresh();
        return;
      }
      setStage('form');
      setError(
        view.status === 'denied' ? 'customers.roaming.appDeclined' : 'customers.roaming.appExpired',
      );
    };
    tick();
    const ticker = setInterval(tick, 1_000);
    const poller = setInterval(() => void poll(), APPROVAL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(ticker);
      clearInterval(poller);
    };
  }, [stage, request, customerId, router]);

  /** Tells the server we stopped waiting, so the citizen can no longer approve that request. */
  function cancelRequest() {
    if (!request) return;
    const id = request.id;
    setRequest(null);
    void fetch(`/api/customers/${customerId}/roaming/app-request/${id}`, {
      method: 'DELETE',
    }).catch(() => undefined);
  }

  function reset() {
    cancelRequest();
    setStage('closed');
    setOtp('');
    setError(null);
    setPending(false);
  }

  function chooseMethod(next: Method) {
    cancelRequest();
    setMethod(next);
    setStage('form');
    setError(null);
  }

  async function sendAppRequest() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming/app-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose }),
      });
      if (!response.ok) {
        setError(await readErrorKey(response));
        return;
      }
      const body = (await response.json()) as { data: { requestId: string; expiresAt: string } };
      setRequest({ id: body.data.requestId, expiresAt: body.data.expiresAt });
      setStage('waiting');
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  async function sendOtp() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming/request-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose, durationMinutes, channel: 'whatsapp' }),
      });
      if (!response.ok) {
        setError(await readErrorKey(response));
        return;
      }
      const body = (await response.json()) as { data: { mobileLast4: string | null } };
      setMobileLast4(body.data.mobileLast4);
      setStage('sent');
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming/verify-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otp }),
      });
      if (!response.ok) {
        setError(await readErrorKey(response));
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  if (stage === 'closed') {
    return <Button onClick={() => setStage('form')}>{t('customers.roaming.requestAccess')}</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <Card
        title={t('customers.roaming.modalTitle')}
        className="w-full max-w-md"
        actions={
          <button
            type="button"
            aria-label={t('common.cancel')}
            className="text-slate-400 hover:text-slate-700"
            onClick={reset}
          >
            ✕
          </button>
        }
      >
        {error ? (
          <Alert tone="danger" className="mb-4">
            {t(error)}
          </Alert>
        ) : null}

        {stage === 'form' ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-800">
                {t('customers.roaming.methodLabel')}
              </p>
              <SegmentedControl
                ariaLabel={t('customers.roaming.methodLabel')}
                options={[
                  { value: 'app', label: t('customers.roaming.methodApp') },
                  { value: 'otp', label: t('customers.roaming.methodOtp') },
                ]}
                value={method}
                onValueChange={(value) => chooseMethod(value as Method)}
              />
            </div>

            <p className="text-sm text-slate-600">
              {t(method === 'app' ? 'customers.roaming.appHelp' : 'customers.roaming.modalHelp')}
            </p>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-800">
                {t('customers.roaming.purposeLabel')}
              </p>
              <SegmentedControl
                ariaLabel={t('customers.roaming.purposeLabel')}
                options={PURPOSES.map((value) => ({
                  value,
                  label: localised(ROAMING_PURPOSE_LABELS[value], locale),
                }))}
                value={purpose}
                onValueChange={setPurpose}
              />
            </div>

            {method === 'otp' ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-800">
                  {t('customers.roaming.durationLabel')}
                </p>
                <SegmentedControl
                  ariaLabel={t('customers.roaming.durationLabel')}
                  options={DURATIONS.map((value) => ({
                    value: String(value),
                    label: t('customers.roaming.durationOption', { hours: value / 60 }),
                  }))}
                  value={String(durationMinutes)}
                  onValueChange={(value) => setDurationMinutes(Number(value) as DurationMinutes)}
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                {t('common.cancel')}
              </Button>
              {method === 'app' ? (
                <Button type="button" loading={pending} onClick={() => void sendAppRequest()}>
                  {t('customers.roaming.sendAppRequest')}
                </Button>
              ) : (
                <Button type="button" loading={pending} onClick={() => void sendOtp()}>
                  {t('customers.roaming.sendCode')}
                </Button>
              )}
            </div>
          </div>
        ) : stage === 'waiting' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600" aria-live="polite">
              ⏳ {t('customers.roaming.appWaiting', { countdown })}
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="link" onClick={() => chooseMethod('otp')}>
                {t('customers.roaming.appUseOtp')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => chooseMethod('app')}>
                {t('customers.roaming.appCancel')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
          >
            <p className="text-sm text-slate-600">
              {t('customers.roaming.codeSentTo', {
                mobile: mobileLast4 ? `•••••• ${mobileLast4}` : t('customers.roaming.theirPhone'),
              })}
            </p>
            <TextField
              label={t('customers.roaming.codeLabel')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              required
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D+/g, '').slice(0, 6))}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="link"
                disabled={pending}
                onClick={() => void sendOtp()}
              >
                {t('customers.roaming.resendCode')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={pending} disabled={otp.length !== 6}>
                  {t('customers.roaming.verifyAndUnlock')}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
