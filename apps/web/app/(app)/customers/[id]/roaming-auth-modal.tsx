'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, SegmentedControl, TextField } from '@assistigo/ui';
import { ROAMING_PURPOSE_LABELS, type RoamingPurpose } from '@assistigo/core';
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

type Stage = 'closed' | 'form' | 'sent';

async function readErrorKey(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as {
    error?: { messageKey: string };
  } | null;
  return json?.error?.messageKey ?? 'errors.internal';
}

/**
 * The consent flow for a `roaming_locked` customer.
 * Master spec §19.2; migration 0024.
 *
 * Two steps, and the operator cannot skip either: choose why access is needed and for how long
 * (both travel to the citizen in the WhatsApp message and into `consent_records`), then type back
 * the code the citizen reads off their own phone. There is no path in this component that unlocks
 * the profile without that round trip.
 */
export function RoamingAuthModal({ customerId }: { customerId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('closed');
  const [purpose, setPurpose] = useState<RoamingPurpose>('form_filling');
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(120);
  const [otp, setOtp] = useState('');
  const [mobileLast4, setMobileLast4] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage('closed');
    setOtp('');
    setError(null);
    setPending(false);
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
            <p className="text-sm text-slate-600">{t('customers.roaming.modalHelp')}</p>

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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                {t('common.cancel')}
              </Button>
              <Button type="button" loading={pending} onClick={() => void sendOtp()}>
                {t('customers.roaming.sendCode')}
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
