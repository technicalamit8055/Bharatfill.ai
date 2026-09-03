import { useEffect, useState } from 'react';
import type { RoamingAccessView } from '@assistigo/core';
import { send } from './send';
import { AlertIcon, CheckIcon, ShieldIcon } from './Brand';
import type { CustomerSummary } from './messages';

/**
 * The roaming unlock flow, rendered above the fill controls in the side panel (§7.4.3,
 * migration 0024). Everything an operator can do from a government portal tab without ever
 * switching back to the dashboard: see why a locked profile is worth pursuing, ask for the
 * citizen's consent, type back the code, and end the session early.
 */

const DURATIONS = [60, 120, 240] as const;
type DurationMinutes = (typeof DURATIONS)[number];

type Stage = 'idle' | 'sent';

/** Cosmetic only — the server is what actually stops answering once the grant lapses. */
function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}h ${pad(minutes)}m` : `${pad(minutes)}m`;
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
          {mobileLast4 ? ` — code goes to •••••• ${mobileLast4}` : ''}
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

      {stage === 'idle' ? (
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
