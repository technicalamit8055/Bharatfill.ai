import { useEffect, useState } from 'react';
import {
  formatGrantRemaining,
  type RoamingAccessView,
  type RoamingAppRequestView,
} from '@assistigo/core';
import { send } from './send';
import { AlertIcon, CheckIcon, ShieldIcon } from './Brand';
import type { CustomerSummary } from './messages';

/**
 * The roaming unlock flow, rendered above the fill controls in the side panel (§7.4.3,
 * migration 0024). Everything an operator can do from a government portal tab without ever
 * switching back to the dashboard: see why a locked profile is worth pursuing, ask for the
 * citizen's consent, type back the code, and end the session early.
 *
 * Consent comes one of two ways (migration 0039):
 *   app  a request to the citizen's BharatDoc app. The citizen picks how long (1, 2 or 4 hours,
 *        or 30 days to trust this centre — migration 0042), so there is no duration picker
 *        here; the panel polls until they answer.
 *   otp  a code sent to the citizen's phone, for a window the operator picks.
 */

const DURATIONS = [60, 120, 240] as const;
type DurationMinutes = (typeof DURATIONS)[number];

type Method = 'app' | 'otp';
type Stage = 'idle' | 'sent' | 'waiting';

/** How often the panel asks whether the citizen has answered in the app. */
const APPROVAL_POLL_MS = 3_000;

/** "4:59" — the time left on a request. Cosmetic; the server decides when it has run out. */
function formatCountdown(expiresAt: string): string {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Cosmetic only — the server is what actually stops answering once the grant lapses. */
function formatRemaining(expiresAt: string): string {
  // Days for a trusted centre's 30-day window ("29d 23h"), hours and minutes otherwise.
  return formatGrantRemaining(new Date(expiresAt).getTime() - Date.now());
}

export function RoamingAuthBanner({
  customer,
  onChange,
}: {
  customer: CustomerSummary;
  /** Called after a grant is issued or ended, so the panel can refresh session state. */
  onChange: () => void;
}) {
  const isActive = customer.accessStatus === 'granted';

  const [access, setAccess] = useState<RoamingAccessView | null>(null);
  const [method, setMethod] = useState<Method>('app');
  const [stage, setStage] = useState<Stage>('idle');
  const [request, setRequest] = useState<{ id: string; expiresAt: string } | null>(null);
  const [countdown, setCountdown] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(120);
  const [otp, setOtp] = useState('');
  const [mobileLast4, setMobileLast4] = useState<string | null>(customer.mobileLast4);
  const [remaining, setRemaining] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The masked card and its top scheme matches — fetched once while locked, never while active
  // (an active session already shows the real profile below this banner).
  useEffect(() => {
    if (isActive) return;
    let cancelled = false;
    void (async () => {
      const response = await send<RoamingAccessView>({
        type: 'GET_ROAMING_ACCESS',
        customerId: customer.id,
      });
      if (!cancelled && response.ok) setAccess(response.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer.id, isActive]);

  useEffect(() => {
    if (!isActive || !customer.grantExpiresAt) return;
    const expiresAt = customer.grantExpiresAt;
    const tick = () => {
      setRemaining(formatRemaining(expiresAt));
      if (new Date(expiresAt).getTime() - Date.now() <= 0) onChange();
    };
    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [isActive, customer.grantExpiresAt, onChange]);

  // While waiting on the app: poll for the citizen's answer and tick the countdown.
  useEffect(() => {
    if (stage !== 'waiting' || !request) return;
    let cancelled = false;
    const tick = () => setCountdown(formatCountdown(request.expiresAt));
    const poll = async () => {
      const response = await send<RoamingAppRequestView>({
        type: 'GET_ROAMING_APPROVAL',
        customerId: customer.id,
        requestId: request.id,
      });
      if (cancelled || !response.ok) return;
      const view = response.data;
      if (view.status === 'pending') return;
      setStage('idle');
      setRequest(null);
      if (view.status === 'approved') onChange();
      else if (view.status === 'denied') setError('The customer declined the request in the app.');
      else setError('The request expired. Send it again, or use OTP.');
    };
    tick();
    const ticker = setInterval(tick, 1_000);
    const poller = setInterval(() => void poll(), APPROVAL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(ticker);
      clearInterval(poller);
    };
  }, [stage, request, customer.id, onChange]);

  async function sendAppRequest() {
    setPending(true);
    setError(null);
    const response = await send<{ requestId: string; expiresAt: string }>({
      type: 'REQUEST_ROAMING_APPROVAL',
      customerId: customer.id,
      purpose: 'form_filling',
    });
    setPending(false);
    if (!response.ok) {
      setError('Could not send the request. Try again, or use OTP.');
      return;
    }
    setRequest({ id: response.data.requestId, expiresAt: response.data.expiresAt });
    setStage('waiting');
  }

  async function cancelAppRequest(switchTo: Method = 'app') {
    const current = request;
    setStage('idle');
    setRequest(null);
    setMethod(switchTo);
    if (current) {
      await send({
        type: 'CANCEL_ROAMING_APPROVAL',
        customerId: customer.id,
        requestId: current.id,
      });
    }
  }

  function chooseMethod(next: Method) {
    setMethod(next);
    setStage('idle');
    setError(null);
  }

  async function sendCode() {
    setPending(true);
    setError(null);
    const response = await send<{ mobileLast4: string | null }>({
      type: 'REQUEST_ROAMING_OTP',
      customerId: customer.id,
      purpose: 'form_filling',
      durationMinutes,
    });
    setPending(false);
    if (!response.ok) {
      setError('Could not send the code. Try again.');
      return;
    }
    setMobileLast4(response.data.mobileLast4);
    setStage('sent');
  }

  async function verify() {
    setPending(true);
    setError(null);
    const response = await send({ type: 'VERIFY_ROAMING_OTP', customerId: customer.id, otp });
    setPending(false);
    if (!response.ok) {
      setError('That code did not work.');
      return;
    }
    setStage('idle');
    setOtp('');
    onChange();
  }

  async function endSession() {
    setPending(true);
    await send({ type: 'REVOKE_ROAMING_SESSION', customerId: customer.id });
    setPending(false);
    onChange();
  }

  if (isActive) {
    return (
      <div className="notice notice-ok">
        <ShieldIcon size={13} />
        <span className="grow">
          🟢 Active roaming session{remaining ? ` (${remaining} remaining)` : ''}
        </span>
        <button
          type="button"
          className="btn-ghost tiny"
          disabled={pending}
          onClick={() => void endSession()}
        >
          🔒 Lock / End
        </button>
      </div>
    );
  }

  return (
    <div className="card stack-sm">
      <div className="notice notice-warn">
        <ShieldIcon size={13} />
        <span>
          🔒 Roaming customer (profile locked)
          {mobileLast4
            ? method === 'app'
              ? ` — request goes to the BharatDoc app on •••• ${mobileLast4}`
              : ` — code goes to •••••• ${mobileLast4}`
            : ''}
        </span>
      </div>

      {access?.topSchemes && access.topSchemes.length > 0 ? (
        <p className="tiny row" style={{ gap: 4 }}>
          <CheckIcon size={12} className="muted" />
          <span>Eligible for {access.topSchemes.map((scheme) => scheme.title.en).join(', ')}</span>
        </p>
      ) : null}

      {error ? (
        <p className="tiny row" style={{ gap: 4, color: 'var(--danger)' }}>
          <AlertIcon size={12} />
          <span>{error}</span>
        </p>
      ) : null}

      {stage !== 'waiting' ? (
        <div
          className="row"
          role="radiogroup"
          aria-label="How the customer approves"
          style={{ gap: 6 }}
        >
          {(
            [
              ['app', '📱 BharatDoc app'],
              ['otp', '🔢 OTP'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              className="btn-ghost tiny grow"
              style={
                method === value
                  ? { borderColor: 'var(--brand-600)', color: 'var(--brand-700)' }
                  : undefined
              }
              disabled={pending}
              onClick={() => chooseMethod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {stage === 'waiting' ? (
        <>
          <p className="tiny">
            ⏳ Waiting for the customer to approve in the BharatDoc app
            {countdown ? ` (${countdown} left)` : ''}. They choose how long you get access.
          </p>
          <button
            type="button"
            className="btn-ghost tiny"
            onClick={() => void cancelAppRequest('otp')}
          >
            Customer has no app? Use OTP instead
          </button>
          <button type="button" className="btn-ghost tiny" onClick={() => void cancelAppRequest()}>
            Cancel request
          </button>
        </>
      ) : method === 'app' ? (
        <>
          <p className="tiny muted">
            The customer approves on their phone and picks how long: 1, 2 or 4 hours, or 30 days if
            they trust your centre.
          </p>
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={pending}
            onClick={() => void sendAppRequest()}
          >
            📱 Send request to BharatDoc app
          </button>
        </>
      ) : stage === 'idle' ? (
        <>
          <div className="row" style={{ gap: 6 }}>
            {DURATIONS.map((value) => (
              <button
                key={value}
                type="button"
                className="btn-ghost tiny"
                aria-pressed={durationMinutes === value}
                style={
                  durationMinutes === value
                    ? { borderColor: 'var(--brand-600)', color: 'var(--brand-700)' }
                    : undefined
                }
                onClick={() => setDurationMinutes(value)}
              >
                {value / 60}h
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={pending}
            onClick={() => void sendCode()}
          >
            🔐 Request OTP to unlock autofill
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            aria-label="6-digit code"
            placeholder="6-digit code"
            onChange={(event) => setOtp(event.target.value.replace(/\D+/g, '').slice(0, 6))}
          />
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={pending || otp.length !== 6}
            onClick={() => void verify()}
          >
            Verify & unlock ({durationMinutes / 60}h)
          </button>
          <button
            type="button"
            className="btn-ghost tiny"
            disabled={pending}
            onClick={() => void sendCode()}
          >
            Resend code
          </button>
        </>
      )}
    </div>
  );
}
