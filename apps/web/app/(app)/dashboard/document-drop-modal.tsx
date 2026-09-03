'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Spinner } from '@assistigo/ui';
import {
  DROP_QR_VALIDITY_MINUTES,
  SIMULATED_DROP_FIXTURES,
  type DropChannel,
  type SimulatedDropFixture,
} from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { qrToSvg } from '@/lib/document-drop/qr';
import { QrIcon } from './icons';

/**
 * The walk-in QR dialog (§9.1).
 *
 * One screen the operator turns toward the counter. It has to work at arm's length in a room
 * with a tube light, which drives most of the decisions here: the QR is rendered large and pure
 * black on pure white regardless of theme, the code is printed underneath in a size an operator
 * can read out loud, and the live status is a single line rather than a log.
 *
 * A session is opened lazily — nothing is minted until the operator actually opens the dialog,
 * because a code that exists is a code that can receive documents.
 *
 * Two triggers open this: the hero pill next to it, and the power-tools tile, which links to
 * `?drop=1`. The URL param is read here so both routes land on one dialog instead of two
 * copies of this state.
 */

type DropLinks = { whatsapp: string | null; telegram: string | null; web: string };

type SessionResponse = {
  session: { id: string; sessionCode: string; channel: DropChannel; expiresAt: string };
  links: DropLinks;
};

type QueueResponse = {
  sessions: { id: string; files: { id: string }[]; senderMasked: string | null; status: string }[];
  channels: DropChannel[];
};

/** How often the dialog asks whether the citizen has sent anything yet. */
const WATCH_INTERVAL_MS = 4000;

const CHANNEL_ORDER: DropChannel[] = ['whatsapp', 'telegram', 'web'];

export function DocumentDropModal({
  /** Rendered as the trigger. The hero passes its pill; nothing else needs to. */
  trigger,
  simulatorEnabled,
}: {
  trigger: React.ReactNode;
  /** False in production, where the simulator route returns 404 (§32.1). */
  simulatorEnabled: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const openedByUrl = params.get('drop') === '1';

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<DropChannel>('whatsapp');
  const [available, setAvailable] = useState<DropChannel[] | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [arrived, setArrived] = useState(0);
  const [senderSeen, setSenderSeen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const [fixtures, setFixtures] = useState<SimulatedDropFixture[]>(['aadhaar', 'marksheet_10']);
  const [simulating, setSimulating] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const closeButton = useRef<HTMLButtonElement | null>(null);

  const isOpen = open || openedByUrl;

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setCopied(false);
    setSimulated(false);
    // The session is deliberately left alive: the citizen may still be mid-upload, and their
    // documents land in the queue whether or not this dialog is on screen.
    if (openedByUrl) router.replace('/dashboard', { scroll: false });
  }, [openedByUrl, router]);

  const openSession = useCallback(
    async (forChannel: DropChannel) => {
      setPending(true);
      setError(null);
      setArrived(0);
      setSenderSeen(false);
      try {
        const response = await fetch('/api/document-drop/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel: forChannel }),
        });
        const json = (await response.json()) as
          | { data: SessionResponse }
          | { error: { messageKey: string } };

        if (!response.ok || 'error' in json) {
          setError('error' in json ? json.error.messageKey : 'documentDrop.qr.createFailed');
          setSession(null);
          return;
        }
        setSession(json.data);
      } catch {
        setError('documentDrop.qr.createFailed');
        setSession(null);
      } finally {
        setPending(false);
      }
    },
    [],
  );

  // Which channels this deployment can actually offer. Asked once per open, because a channel
  // with no credentials must not be shown as a tab that produces an unanswerable QR.
  useEffect(() => {
    if (!isOpen || available !== null) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/document-drop/sessions');
        const json = (await response.json()) as { data: QueueResponse };
        if (cancelled) return;
        const channels = json.data?.channels ?? ['web'];
        setAvailable(channels);
        setChannel(CHANNEL_ORDER.find((option) => channels.includes(option)) ?? 'web');
      } catch {
        if (!cancelled) setAvailable(['web']);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, available]);

  // Mint the session once the channel is settled.
  useEffect(() => {
    if (!isOpen || available === null || session || pending || error) return;
    void openSession(channel);
  }, [isOpen, available, session, pending, error, channel, openSession]);

  // The live watch. Polls the queue for this session rather than opening a realtime channel:
  // the dialog is open for a minute or two at a time, and one small request every four seconds
  // is cheaper than a socket for both the browser and the database.
  useEffect(() => {
    if (!isOpen || !session) return;

    const sessionId = session.session.id;

    async function check() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/document-drop/sessions');
        const json = (await response.json()) as { data: QueueResponse };
        const mine = json.data?.sessions.find((row) => row.id === sessionId);
        if (!mine) return;
        setArrived(mine.files.length);
        if (mine.senderMasked) setSenderSeen(true);
      } catch {
        // A dropped poll is not worth showing the operator; the next one tries again.
      }
    }

    void check();
    const timer = setInterval(() => void check(), WATCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, session]);

  // The countdown clock, and Escape to close.
  useEffect(() => {
    if (!isOpen) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);

    // Focus lands on the close control, so the dialog is escapable by keyboard from the moment
    // it opens rather than after tabbing through the QR.
    closeButton.current?.focus();

    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  const link = session ? pickLink(session.links, channel) : null;

  const qrSvg = useMemo(
    () =>
      link
        ? qrToSvg(link, { dark: '#000000', light: '#ffffff', margin: 3, title: 'Document drop QR' })
        : null,
    [link],
  );

  const remaining = useMemo(() => {
    if (!session || now === null) return null;
    // The QR is shown as valid for fifteen minutes while the session itself lives for two hours.
    // That is not a discrepancy: the countdown is a nudge to refresh a code that has been on
    // screen too long, not a deadline the citizen can miss mid-upload.
    const validUntil =
      new Date(session.session.expiresAt).getTime() -
      (120 - DROP_QR_VALIDITY_MINUTES) * 60_000;
    const ms = validUntil - now;
    if (ms <= 0) return 'expired';
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [session, now]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser with the clipboard blocked; the link is visible and selectable anyway.
    }
  }

  async function runSimulation() {
    if (!session || fixtures.length === 0) return;
    setSimulating(true);
    setSimulated(false);
    setError(null);
    try {
      const response = await fetch(
        `/api/document-drop/sessions/${session.session.id}/simulate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fixtures }),
        },
      );
      if (!response.ok) {
        setError('documentDrop.simulate.failed');
        return;
      }
      setSimulated(true);
    } catch {
      setError('documentDrop.simulate.failed');
    } finally {
      setSimulating(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-left">
        {trigger}
      </button>
    );
  }

  const channels = available ?? ['web'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-drop-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="document-drop-title"
              className="flex items-center gap-2 text-sm font-semibold text-slate-900"
            >
              <QrIcon className="h-4 w-4 text-brand-600" />
              {t('documentDrop.title')}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{t('documentDrop.subtitle')}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            aria-label={t('common.close')}
            onClick={close}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {channels.length > 1 ? (
            <div
              role="group"
              aria-label={t('documentDrop.channel.label')}
              className="flex gap-1 rounded-xl bg-slate-100 p-1"
            >
              {CHANNEL_ORDER.filter((option) => channels.includes(option)).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={channel === option}
                  onClick={() => {
                    if (option === channel) return;
                    setChannel(option);
                    // A new channel needs a link the citizen can actually open, and the session
                    // records which channel it was opened for.
                    setSession(null);
                    setError(null);
                    void openSession(option);
                  }}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    channel === option
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t(`documentDrop.channel.${option}`)}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <Alert tone="danger">{t(error)}</Alert> : null}

          {pending || !session ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner label={t('documentDrop.qr.creating')} />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-700">
                  {t(
                    channel === 'whatsapp'
                      ? 'documentDrop.qr.scanOnWhatsapp'
                      : channel === 'telegram'
                        ? 'documentDrop.qr.scanOnTelegram'
                        : 'documentDrop.qr.scanOnWeb',
                  )}
                </p>

                {/*
                 * Pure black on pure white, at a fixed size, ignoring every other surface
                 * treatment on this page. A tinted or scaled QR is a QR that takes three
                 * attempts to scan on a cheap phone across a counter.
                 */}
                <div
                  className="rounded-xl border-4 border-white bg-white p-2 shadow-md ring-1 ring-slate-200"
                  style={{ width: 232, height: 232 }}
                  // The SVG is generated in this browser from a link this component built.
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
                />

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {t('documentDrop.qr.codeLabel')}
                  </span>
                  <span className="font-mono text-2xl font-semibold tracking-widest text-slate-900">
                    {session.session.sessionCode}
                  </span>
                </div>

                {remaining === 'expired' ? (
                  <Alert tone="warning">{t('documentDrop.qr.expired')}</Alert>
                ) : (
                  <p className="text-xs text-slate-500">
                    {remaining
                      ? t('documentDrop.qr.expiresIn', { time: remaining })
                      : t('documentDrop.qr.validFor', { minutes: DROP_QR_VALIDITY_MINUTES })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {link ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
                      {copied ? t('documentDrop.qr.copied') : t('documentDrop.qr.copyLink')}
                    </Button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-brand-700 hover:underline"
                    >
                      {t('documentDrop.qr.openLink')}
                    </a>
                  </>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void openSession(channel)}>
                  {t('documentDrop.qr.newSession')}
                </Button>
              </div>

              {/* The live line. One sentence, because an operator glances at it. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      arrived > 0
                        ? 'bg-emerald-500'
                        : senderSeen
                          ? 'bg-amber-400 animate-live-pulse'
                          : 'bg-slate-300 animate-live-pulse'
                    }`}
                  />
                  <p className="text-sm font-medium text-slate-800">
                    {arrived > 0
                      ? t('documentDrop.waiting.filesArrived', { count: arrived })
                      : senderSeen
                        ? t('documentDrop.waiting.connected')
                        : t('documentDrop.waiting.title')}
                  </p>
                  {arrived > 0 ? <Badge tone="success">{arrived}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{t('documentDrop.waiting.hint')}</p>
              </div>

              {simulatorEnabled ? (
                <details className="rounded-xl border border-dashed border-slate-300 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    {t('documentDrop.simulate.tab')}
                  </summary>
                  <p className="mt-2 text-xs text-slate-500">{t('documentDrop.simulate.hint')}</p>
                  <div className="mt-3 space-y-1.5">
                    {SIMULATED_DROP_FIXTURES.map((fixture) => (
                      <label
                        key={fixture}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                          checked={fixtures.includes(fixture)}
                          onChange={(event) =>
                            setFixtures((current) =>
                              event.target.checked
                                ? [...current, fixture]
                                : current.filter((value) => value !== fixture),
                            )
                          }
                        />
                        {t(`documentDrop.simulate.${fixture}`)}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={simulating}
                      disabled={fixtures.length === 0}
                      onClick={() => void runSimulation()}
                    >
                      {simulating
                        ? t('documentDrop.simulate.sending')
                        : t('documentDrop.simulate.send')}
                    </Button>
                    {simulated ? (
                      <span className="text-xs font-medium text-emerald-700">
                        {t('documentDrop.simulate.sent')}
                      </span>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <div className="flex justify-between gap-2 border-t border-slate-100 pt-3">
                <a
                  href="/standee/print"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
                >
                  {t('documentDrop.standee.print')}
                </a>
                <Button variant="ghost" size="sm" onClick={close}>
                  {t('common.close')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pickLink(links: DropLinks, channel: DropChannel): string {
  if (channel === 'whatsapp' && links.whatsapp) return links.whatsapp;
  if (channel === 'telegram' && links.telegram) return links.telegram;
  return links.web;
}
