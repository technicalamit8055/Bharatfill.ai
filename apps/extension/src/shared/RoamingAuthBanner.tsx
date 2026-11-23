import { useEffect, useState } from 'react';
import {
  formatGrantRemaining,
  type RoamingAccessRequestResult,
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
 * One "Request access" (migration 0046) — the server decides how the citizen says yes:
 *   app  they have the BharatDoc app: the request goes there. The citizen picks how long (1, 2
 *        or 4 hours, or 30 days to trust this centre — migration 0042); the panel polls.
 *   otp  they do not: a WhatsApp code for the window picked here, typed back at the counter.
 * While waiting on the app the operator can still fall back to a code.
 */

const DURATIONS = [60, 120, 240] as const;
type DurationMinutes = (typeof DURATIONS)[number];

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

  /** The app when the customer has it, otherwise a WhatsApp code — the server decides. */
  async function sendRequest() {
    setPending(true);
    setError(null);
    const response = await send<RoamingAccessRequestResult>({
      type: 'REQUEST_ROAMING_ACCESS',
      customerId: customer.id,
      purpose: 'form_filling',
      durationMinutes,
    });
    setPending(false);
    if (!response.ok) {
      setError('Could not send the request. Try again.');
      return;
    }
    const result = response.data;
    if (result.method === 'app') {
      setRequest({ id: result.requestId, expiresAt: result.expiresAt });
      setStage('waiting');
    } else {
      setMobileLast4(result.mobileLast4);
      setStage('sent');
    }
  }

  async function cancelAppRequest() {
    const current = request;
    setStage('idle');
    setRequest(null);
    if (current) {
      await send({
        type: 'CANCEL_ROAMING_APPROVAL',
        customerId: customer.id,
        requestId: current.id,
      });
    }
  }

  /** A WhatsApp code directly: the fallback while waiting on the app, and Resend. */
  async function sendCode() {
    if (request) await cancelAppRequest();
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
        <span className="grow">🟢 Access open{remaining ? ` (${remaining} remaining)` : ''}</span>
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
          {access?.lockedByCustomer
            ? '🔒 The customer locked your centre in the BharatDoc app'
            : '🔒 Profile locked — ask the customer for access'}
          {mobileLast4 && stage === 'sent' ? ` — code sent to •••••• ${mobileLast4}` : ''}
        </span>
      </div>

      {access?.topSchemes && access.topSchemes.length > 0 ? (
        <p className="tiny row" style={{ gap: 4 }}>
          <CheckIcon size={12} className="muted" />
          <span>
            Eligible for{' '}
            {access.topSchemes
              .slice(0, 3)
              .map((scheme) => scheme.title.en)
              .join(', ')}
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="tiny row" style={{ gap: 4, color: 'var(--danger)' }}>
          <AlertIcon size={12} />
          <span>{error}</span>
        </p>
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
            disabled={pending}
            onClick={() => void sendCode()}
          >
            Customer can&rsquo;t open the app? Send a WhatsApp code
          </button>
          <button type="button" className="btn-ghost tiny" onClick={() => void cancelAppRequest()}>
            Cancel request
          </button>
        </>
      ) : stage === 'idle' ? (
        <>
          <p className="tiny muted">
            Goes to the customer&rsquo;s BharatDoc app if they have it (they choose how long),
            otherwise a WhatsApp code. Time for a code:
          </p>
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
            onClick={() => void sendRequest()}
          >
            🔐 Request access
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
