'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Check,
  Clock,
  FileText,
  Folder,
  Info,
  Landmark,
  LoaderCircle,
  Pencil,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Button, TextField, cn } from '@assistigo/ui';
import {
  ROAMING_PURPOSE_LABELS,
  type RoamingAccessRequestResult,
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

const PURPOSE_ICONS: Record<RoamingPurpose, LucideIcon> = {
  form_filling: FileText,
  scheme_application: Landmark,
  profile_update: Pencil,
  document_access: Folder,
};

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
 * The consent flow for a `roaming_locked` customer — linked from another centre, or this
 * centre's own record the citizen locked (0046).
 * Master spec §19.2; migrations 0024 (OTP), 0039 (approval in the BharatDoc app), 0046.
 *
 * One "Send request": the server picks how the citizen says yes, and there is no path in this
 * component that unlocks the profile without them:
 *   app  they have the BharatDoc app — the request goes there; they see the centre and purpose,
 *        pick how long and tap Approve. We poll.
 *   otp  they do not — a WhatsApp code for the window picked here, read back at the counter.
 * While waiting on the app, the operator can still fall back to a WhatsApp code.
 */
export function RoamingAuthModal({ customerId }: { customerId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('closed');
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

  // Escape closes the popup, the same as the ✕ button.
  useEffect(() => {
    if (stage === 'closed') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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

  function backToForm() {
    cancelRequest();
    setStage('form');
    setError(null);
  }

  /** The app when the customer has it, otherwise a WhatsApp code — the server decides. */
  async function sendRequest() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/roaming/request-access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose, durationMinutes }),
      });
      if (!response.ok) {
        setError(await readErrorKey(response));
        return;
      }
      const { data } = (await response.json()) as { data: RoamingAccessRequestResult };
      if (data.method === 'app') {
        setRequest({ id: data.requestId, expiresAt: data.expiresAt });
        setStage('waiting');
      } else {
        setMobileLast4(data.mobileLast4);
        setStage('sent');
      }
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  /** A WhatsApp code directly: the fallback while waiting on the app, and Resend. */
  async function sendOtp() {
    cancelRequest();
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) reset();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roaming-auth-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* Soft wash behind the illustration. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-bl from-blue-100/80 via-blue-50/50 to-transparent blur-2xl"
        />
        <ConsentIllustration className="pointer-events-none absolute right-10 top-5 w-20" />

        <button
          type="button"
          aria-label={t('common.cancel')}
          className="absolute right-2.5 top-2.5 z-10 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          onClick={reset}
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div className="relative p-6">
          <span aria-hidden="true" className="mb-3 block h-1 w-8 rounded-full bg-blue-600" />
          <h2 id="roaming-auth-title" className="text-xl font-bold tracking-tight text-slate-950">
            {t('customers.roaming.modalTitle')}
          </h2>
          <p className="mt-1 max-w-[70%] text-sm text-slate-500">
            {t('customers.roaming.modalSubtitle')}
          </p>

          {error ? (
            <Alert tone="danger" className="mt-4">
              {t(error)}
            </Alert>
          ) : null}

          {stage === 'form' ? (
            <>
              <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
                <span>{t('customers.roaming.requestHelp')}</span>
              </p>

              <hr className="my-4 border-slate-200" />

              <section>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t('customers.roaming.purposeLabel')}
                </h3>
                <div
                  role="radiogroup"
                  aria-label={t('customers.roaming.purposeLabel')}
                  className="mt-2 grid grid-cols-2 gap-2.5"
                >
                  {PURPOSES.map((value) => {
                    const Icon = PURPOSE_ICONS[value];
                    const selected = purpose === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPurpose(value)}
                        className={cn(
                          'relative flex items-center gap-2.5 rounded-xl border p-2.5 pr-7 text-left transition',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                          selected
                            ? 'border-blue-600 bg-blue-50/70'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        {selected ? (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                          </span>
                        ) : null}
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800 ring-1 ring-blue-100">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="text-sm font-medium leading-tight text-slate-800">
                          {localised(ROAMING_PURPOSE_LABELS[value], locale)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  {t('customers.roaming.durationLabel')}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('customers.roaming.durationHelp')}
                </p>
                <div
                  role="radiogroup"
                  aria-label={t('customers.roaming.durationLabel')}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {DURATIONS.map((value) => {
                    const selected = durationMinutes === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDurationMinutes(value)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                          selected
                            ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {t('customers.roaming.durationOption', { hours: value / 60 })}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  {t('common.cancel')}
                </Button>
                <PrimaryAction
                  pending={pending}
                  onClick={() => void sendRequest()}
                  label={t('customers.roaming.sendAppRequest')}
                />
              </div>
            </>
          ) : stage === 'waiting' ? (
            <div className="mt-5 space-y-4">
              <div
                className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5"
                aria-live="polite"
              >
                <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />
                <p className="text-sm text-slate-700">
                  {t('customers.roaming.appWaiting', { countdown })}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="link"
                  disabled={pending}
                  onClick={() => void sendOtp()}
                >
                  {t('customers.roaming.appUseOtp')}
                </Button>
                <Button type="button" variant="ghost" onClick={backToForm}>
                  {t('customers.roaming.appCancel')}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyOtp();
              }}
            >
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <Image
                  src="/customers/whatsapp-logo.webp"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 shrink-0"
                />
                <span>
                  {t('customers.roaming.codeSentTo', {
                    mobile: mobileLast4
                      ? `•••••• ${mobileLast4}`
                      : t('customers.roaming.theirPhone'),
                  })}
                </span>
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
        </div>
      </div>
    </div>
  );
}

function PrimaryAction({
  pending,
  label,
  onClick,
}: {
  pending: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white',
        'shadow-md shadow-blue-600/25 transition hover:from-blue-500 hover:to-blue-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-70',
      )}
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" strokeWidth={2} />
      )}
      {label}
    </button>
  );
}

/** Decorative: a document guarded by a shield. Hidden from screen readers. */
function ConsentIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 220" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="rq-blob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="1" stopColor="#bfdbfe" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="rq-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <filter id="rq-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#1e40af" floodOpacity="0.18" />
        </filter>
      </defs>
      <path
        d="M30 120c0-46 34-78 80-82 40-4 64 14 92 30 26 15 34 48 18 76-18 31-60 44-104 42-50-2-86-24-86-66z"
        fill="url(#rq-blob)"
      />
      <g transform="rotate(6 120 110)" filter="url(#rq-shadow)">
        <rect x="70" y="36" width="110" height="140" rx="14" fill="#ffffff" />
        <path d="M156 36h10a14 14 0 0 1 14 14v10z" fill="#dbeafe" />
        <rect x="86" y="60" width="56" height="9" rx="4.5" fill="#fb923c" />
        <rect x="86" y="80" width="76" height="9" rx="4.5" fill="#93c5fd" />
        <rect x="86" y="100" width="62" height="9" rx="4.5" fill="#22c55e" />
        <rect x="86" y="124" width="34" height="7" rx="3.5" fill="#bfdbfe" />
        <rect x="86" y="140" width="26" height="7" rx="3.5" fill="#bfdbfe" />
      </g>
      <g filter="url(#rq-shadow)">
        <path
          d="M172 108l36 13v26c0 24-16 40-36 48-20-8-36-24-36-48v-26z"
          fill="url(#rq-shield)"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M156 150l11 11 22-24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g strokeLinecap="round" strokeWidth="6">
        <path d="M186 22l-6 16" stroke="#fbbf24" />
        <path d="M200 40l-12 9" stroke="#22c55e" />
        <path d="M206 58l-14 3" stroke="#22c55e" />
      </g>
    </svg>
  );
}
