'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, EmptyState, type Tone } from '@assistigo/ui';
import {
  DOCUMENT_TYPE_LABELS,
  isDocumentType,
  type DropChannel,
} from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { formatBytes } from '@/lib/documents/format';
import { InboxIcon, PhoneUploadIcon, QrIcon, WhatsappIcon } from './icons';

/**
 * The walk-in drop queue (§9.1).
 *
 * What the operator sees while somebody is standing at the counter: who has sent what, and one
 * button that turns it into a customer with their documents already reading. The whole point is
 * that the operator never opens WhatsApp Web, never digs through Downloads, and never renames a
 * file — so this widget deliberately offers nothing else.
 *
 * Polling, not realtime. A dashboard sits open all day at a counter, and a socket per open tab
 * across every centre is a lot of infrastructure for a list that changes a few times an hour.
 * Instead: a slow poll that speeds up when there is something live, stops entirely when the tab
 * is hidden, and stops when the browser goes offline.
 */

const IDLE_INTERVAL_MS = 15_000;
const LIVE_INTERVAL_MS = 5000;

type QueueFile = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  suggestedDocumentType: string;
};

type QueueSession = {
  id: string;
  sessionCode: string;
  channel: DropChannel;
  status: string;
  senderMasked: string | null;
  senderName: string | null;
  createdAt: string;
  files: QueueFile[];
};

type QueueResponse = { sessions: QueueSession[]; channels: DropChannel[] };

const CHANNEL_ICON: Record<DropChannel, React.ReactNode> = {
  whatsapp: <WhatsappIcon className="h-3.5 w-3.5" />,
  telegram: <QrIcon className="h-3.5 w-3.5" />,
  web: <PhoneUploadIcon className="h-3.5 w-3.5" />,
};

export function DocumentDropQueue({
  canIntake,
  canDiscard,
}: {
  /** `document.upload` — the permission that governs bringing documents into the org. */
  canIntake: boolean;
  /** `document.delete` — owners and managers, since discarding destroys the files now. */
  canDiscard: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [sessions, setSessions] = useState<QueueSession[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/document-drop/sessions');
      if (!response.ok) return;
      const json = (await response.json()) as { data: QueueResponse };
      setSessions(json.data?.sessions ?? []);
    } catch {
      // Offline, or a transient failure. The existing list stays on screen rather than being
      // replaced by an error — an operator mid-intake should not lose the queue to one bad poll.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasLive = (sessions?.length ?? 0) > 0;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        // A dashboard left open overnight should cost nothing.
        if (document.visibilityState === 'visible' && navigator.onLine !== false) void load();
      }, hasLive ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
    }

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Catch up immediately on return, then resume the interval.
        void load();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, hasLive]);

  async function intake(session: QueueSession) {
    setBusyId(session.id);
    setError(null);
    setNotice(null);

    // The messaging profile name, when there is a usable one. `fullName` has a two-character
    // minimum server-side, and a one-character WhatsApp display name would otherwise turn a
    // working intake into a validation error.
    const proposedName = session.senderName?.trim() ?? '';

    try {
      const response = await fetch(`/api/document-drop/sessions/${session.id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          proposedName.length >= 2 ? { fullName: proposedName.slice(0, 160) } : {},
        ),
      });

      const json = (await response.json()) as
        | { data: { customerId: string; failedFileIds: string[] } }
        | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'documentDrop.queue.intakeFailed');
        // The session may have been claimed by a colleague; refresh so the list tells the truth.
        void load();
        return;
      }

      if (json.data.failedFileIds.length > 0) {
        setNotice(
          t('documentDrop.queue.partial', { count: json.data.failedFileIds.length }),
        );
      }

      // Straight to the profile: extraction is already queued, and the review table is what the
      // operator does next. This is the step that replaces the whole download-and-rename detour.
      router.push(`/customers/${json.data.customerId}`);
    } catch {
      setError('documentDrop.queue.intakeFailed');
    } finally {
      setBusyId(null);
    }
  }

  async function discard(session: QueueSession) {
    if (!window.confirm(t('documentDrop.queue.discardConfirm'))) return;

    setBusyId(session.id);
    setError(null);
    try {
      const response = await fetch(`/api/document-drop/sessions/${session.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setError('documentDrop.queue.intakeFailed');
        return;
      }
      setSessions((current) => (current ?? []).filter((row) => row.id !== session.id));
    } catch {
      setError('documentDrop.queue.intakeFailed');
    } finally {
      setBusyId(null);
    }
  }

  const waiting = sessions ?? [];

  return (
    <Card
      className="animate-fade-in-up"
      title={t('documentDrop.queue.title')}
      description={t('documentDrop.queue.hint')}
      actions={
        waiting.length > 0 ? (
          <Badge tone={waiting.some((row) => row.files.length > 0) ? 'success' : 'info'}>
            {waiting.length}
          </Badge>
        ) : null
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-3">
          {t(error)}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="warning" className="mb-3">
          {notice}
        </Alert>
      ) : null}

      {waiting.length === 0 ? (
        <EmptyState
          title={t('documentDrop.queue.empty')}
          description={t('documentDrop.queue.emptyHint')}
          action={
            <a
              href="/dashboard?drop=1"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <QrIcon className="h-4 w-4" />
              {t('documentDrop.openButton')}
            </a>
          }
        />
      ) : (
        <ul className="-my-1 divide-y divide-slate-100">
          {waiting.map((session) => (
            <li key={session.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {CHANNEL_ICON[session.channel]}
                      {t(`documentDrop.queue.channelBadge.${session.channel}`)}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {session.sessionCode}
                    </span>
                    <Badge tone={statusTone(session)}>
                      {t(
                        session.status === 'ready'
                          ? 'documentDrop.queue.ready'
                          : 'documentDrop.queue.waitingLabel',
                      )}
                    </Badge>
                  </div>

                  {/*
                   * The sender is shown masked. An operator matching the queue row to the
                   * person in front of them needs the last four digits, not the number — and
                   * reading the number is a separate audited action everywhere else (§19.3).
                   */}
                  <p className="mt-1.5 truncate text-sm font-medium text-slate-900">
                    {session.senderMasked
                      ? t('documentDrop.queue.from', { number: session.senderMasked })
                      : t('documentDrop.queue.fromUnknown')}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {session.files.length === 0
                      ? t('documentDrop.queue.noFilesYet')
                      : t('documentDrop.queue.fileCount', { count: session.files.length })}
                  </p>

                  {session.files.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {session.files.map((file) => (
                        <li
                          key={file.id}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600 ring-1 ring-inset ring-slate-200"
                          title={`${file.filename} · ${formatBytes(file.sizeBytes)}`}
                        >
                          <InboxIcon className="h-3 w-3" />
                          {isDocumentType(file.suggestedDocumentType)
                            ? DOCUMENT_TYPE_LABELS[file.suggestedDocumentType][locale]
                            : DOCUMENT_TYPE_LABELS.unknown[locale]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {canIntake ? (
                    <Button
                      size="sm"
                      loading={busyId === session.id}
                      disabled={session.files.length === 0 || busyId !== null}
                      onClick={() => void intake(session)}
                    >
                      {busyId === session.id
                        ? t('documentDrop.queue.intakeBusy')
                        : t('documentDrop.queue.intake')}
                    </Button>
                  ) : null}
                  {canDiscard ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void discard(session)}
                      className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
                    >
                      {t('documentDrop.queue.discard')}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function statusTone(session: QueueSession): Tone {
  if (session.status === 'ready') return 'success';
  return session.files.length > 0 ? 'info' : 'neutral';
}
