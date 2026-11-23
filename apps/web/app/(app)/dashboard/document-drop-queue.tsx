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
import { DropFilePreviewModal } from './drop-file-preview-modal';
import { DropCustomerPicker, type PickedCustomer } from './drop-customer-picker';

/**
 * The walk-in drop queue (§9.1).
 *
 * What the operator sees while somebody is standing at the counter, and what they can do about
 * it without leaving the dashboard: look at what arrived, keep a copy if they need one, and send
 * it to the right person — a new profile, a returning customer, or a citizen registered at
 * another centre who has consented to this counter.
 *
 * The original one-click intake is still here and still the default path: with nothing selected,
 * "Intake & extract" takes the whole session to a new profile in one press, which is the common
 * walk-in. Everything else is progressive — the row expands only if the operator asks it to.
 *
 * Polling, not realtime. A dashboard sits open all day at a counter, and a socket per open tab
 * across every centre is a lot of infrastructure for a list that changes a few times an hour.
 * Instead: a slow poll that speeds up when there is something live, stops entirely when the tab
 * is hidden, and stops when the browser goes offline. Polling is also paused while a modal is
 * open, so the list cannot shuffle underneath a decision the operator is in the middle of.
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

type SaveResult = {
  customerId: string;
  documentIds: string[];
  failedFileIds: string[];
  sessionRemainsOpen: boolean;
  target: 'local' | 'roaming';
};

const CHANNEL_ICON: Record<DropChannel, React.ReactNode> = {
  whatsapp: <WhatsappIcon className="h-3.5 w-3.5" />,
  telegram: <QrIcon className="h-3.5 w-3.5" />,
  web: <PhoneUploadIcon className="h-3.5 w-3.5" />,
};

export function DocumentDropQueue({
  canIntake,
  canDiscard,
  canPreview,
  canPickRoaming,
}: {
  /** `document.upload` — the permission that governs bringing documents into the org. */
  canIntake: boolean;
  /** `document.delete` — owners and managers, since discarding destroys the files now. */
  canDiscard: boolean;
  /** `document.download` — reading staged bytes is a heavier act than seeing the queue. */
  canPreview: boolean;
  /** `customer.roaming_link` — whether the "another centre" tab is offered at all. */
  canPickRoaming: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [sessions, setSessions] = useState<QueueSession[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** Per session, which files the operator has ticked. Absent means "all of them". */
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [previewing, setPreviewing] = useState<{ session: QueueSession; file: QueueFile } | null>(
    null,
  );
  const [picking, setPicking] = useState<QueueSession | null>(null);
  const [lastSaved, setLastSaved] = useState<{ customerId: string; label: string } | null>(null);

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
  // A refresh underneath an open modal would swap the file being looked at, or the session being
  // saved, for a different one. The queue can wait the few seconds that decision takes.
  const modalOpen = previewing !== null || picking !== null;

  useEffect(() => {
    if (modalOpen) return undefined;

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
  }, [load, hasLive, modalOpen]);

  /** The ticked files, or every file when nothing has been ticked. */
  function selectedFiles(session: QueueSession): QueueFile[] {
    const ids = selection[session.id];
    if (!ids || ids.length === 0) return session.files;
    return session.files.filter((file) => ids.includes(file.id));
  }

  function toggleFile(session: QueueSession, fileId: string) {
    setSelection((current) => {
      const existing = current[session.id] ?? [];
      const next = existing.includes(fileId)
        ? existing.filter((id) => id !== fileId)
        : [...existing, fileId];
      return { ...current, [session.id]: next };
    });
  }

  /**
   * The one-click path, unchanged: the whole session to a fresh profile.
   *
   * Still the default because it is still the common case — a first-time walk-in who sent their
   * documents and is standing at the counter. The picker exists for everything else.
   */
  async function intake(session: QueueSession) {
    // The messaging profile name, when there is a usable one. `fullName` has a two-character
    // minimum server-side, and a one-character WhatsApp display name would otherwise turn a
    // working intake into a validation error.
    const proposedName = session.senderName?.trim() ?? '';

    const result = await save(session, {
      body:
        proposedName.length >= 2 ? { fullName: proposedName.slice(0, 160) } : {},
      fileIds: null,
    });

    if (result) router.push(`/customers/${result.customerId}`);
  }

  /**
   * Sends the chosen files to the chosen destination.
   *
   * Returns the result so the caller decides what happens next: the one-click path navigates to
   * the new profile, while a partial or roaming save stays on the queue — there is either more
   * to do here, or nothing this operator can usefully open.
   */
  async function save(
    session: QueueSession,
    options: { body: Record<string, unknown>; fileIds: string[] | null },
  ): Promise<SaveResult | null> {
    setBusyId(session.id);
    setError(null);
    setNotice(null);
    setLastSaved(null);

    try {
      const response = await fetch(`/api/document-drop/sessions/${session.id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...options.body,
          // Omitted entirely when the whole session is going, so the server takes its "all files"
          // path rather than receiving a list that happens to be complete.
          ...(options.fileIds ? { fileIds: options.fileIds } : {}),
        }),
      });

      const json = (await response.json()) as
        | { data: SaveResult }
        | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'documentDrop.queue.intakeFailed');
        // The session may have been claimed by a colleague; refresh so the list tells the truth.
        void load();
        return null;
      }

      if (json.data.failedFileIds.length > 0) {
        setNotice(
          t('documentDrop.queue.partial', { count: json.data.failedFileIds.length }),
        );
      }

      // A saved session's ticks are meaningless afterwards, whether it stayed open or not.
      setSelection((current) => {
        const next = { ...current };
        delete next[session.id];
        return next;
      });

      return json.data;
    } catch {
      setError('documentDrop.queue.intakeFailed');
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function saveToPicked(session: QueueSession, picked: PickedCustomer) {
    const files = selectedFiles(session);
    if (files.length === 0) {
      setError('documentDrop.queue.noSelection');
      return;
    }

    const wholeSession = files.length === session.files.length;
    const proposedName = session.senderName?.trim() ?? '';

    const body: Record<string, unknown> = { target: picked.target };
    if (picked.customerId) {
      body.customerId = picked.customerId;
    } else if (proposedName.length >= 2) {
      body.fullName = proposedName.slice(0, 160);
    }

    const result = await save(session, {
      body,
      fileIds: wholeSession ? null : files.map((file) => file.id),
    });

    setPicking(null);
    if (!result) return;

    setNotice(
      result.sessionRemainsOpen
        ? t('documentDrop.queue.savedPartial')
        : t(
            result.target === 'roaming'
              ? 'documentDrop.queue.savedRoaming'
              : 'documentDrop.queue.savedLocal',
            { name: picked.displayName || t('documentDrop.queue.fromUnknown') },
          ),
    );

    // A roaming citizen's profile lives at their home centre and this operator can only reach it
    // while their grant lasts, so the queue does not offer to open it. A local save does.
    setLastSaved(
      result.target === 'local'
        ? { customerId: result.customerId, label: picked.displayName }
        : null,
    );

    void load();
  }

  async function downloadFile(session: QueueSession, file: QueueFile) {
    setError(null);
    try {
      const response = await fetch(
        `/api/document-drop/sessions/${session.id}/files/${file.id}/signed-url`,
        { method: 'POST' },
      );
      if (!response.ok) {
        setError('documentDrop.queue.downloadFailed');
        return;
      }
      const json = (await response.json()) as { data: { url: string; filename: string } };
      const anchor = document.createElement('a');
      anchor.href = json.data.url;
      anchor.download = json.data.filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError('documentDrop.queue.downloadFailed');
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
    <>
      <Card
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
            {lastSaved ? (
              <a
                href={`/customers/${lastSaved.customerId}`}
                className="ml-2 font-medium underline"
              >
                {t('documentDrop.queue.openProfile')}
              </a>
            ) : null}
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
            {waiting.map((session) => {
              const expanded = expandedId === session.id;
              const ticked = selection[session.id] ?? [];
              const chosen = selectedFiles(session);

              return (
                <li key={session.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
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
                        {ticked.length > 0
                          ? ` · ${t('documentDrop.queue.selectedCount', { count: ticked.length })}`
                          : ''}
                      </p>

                      {session.files.length > 0 && !expanded ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {session.files.map((file) => (
                            <li
                              key={file.id}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
                              title={`${file.filename} · ${formatBytes(file.sizeBytes)}`}
                            >
                              <InboxIcon className="h-3 w-3" />
                              {documentTypeLabel(file, locale)}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {session.files.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : session.id)}
                          className="mt-2 text-xs font-medium text-brand-700 hover:underline"
                        >
                          {t(
                            expanded
                              ? 'documentDrop.queue.collapse'
                              : 'documentDrop.queue.expand',
                          )}
                        </button>
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
                      {canIntake && session.files.length > 0 ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => setPicking(session)}
                          className="text-xs font-medium text-slate-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          {t('documentDrop.queue.save')}
                        </button>
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

                  {expanded && session.files.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                      <div className="mb-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setSelection((current) => ({
                              ...current,
                              [session.id]:
                                ticked.length === session.files.length
                                  ? []
                                  : session.files.map((file) => file.id),
                            }))
                          }
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                          {t(
                            ticked.length === session.files.length
                              ? 'documentDrop.queue.selectNone'
                              : 'documentDrop.queue.selectAll',
                          )}
                        </button>
                      </div>

                      <ul className="divide-y divide-slate-200">
                        {session.files.map((file) => (
                          <li key={file.id} className="flex items-center gap-2 py-2">
                            <input
                              type="checkbox"
                              checked={ticked.includes(file.id)}
                              onChange={() => toggleFile(session, file.id)}
                              aria-label={file.filename}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-800">
                                {documentTypeLabel(file, locale)}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {file.filename} · {formatBytes(file.sizeBytes)}
                              </p>
                            </div>
                            {canPreview ? (
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewing({ session, file })}
                                  className="text-xs font-medium text-brand-700 hover:underline"
                                >
                                  {t('documentDrop.queue.preview')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadFile(session, file)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                >
                                  {t('documentDrop.queue.download')}
                                </button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {canIntake ? (
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId !== null || chosen.length === 0}
                            onClick={() => setPicking(session)}
                          >
                            {t('documentDrop.queue.save')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {previewing ? (
        <DropFilePreviewModal
          sessionId={previewing.session.id}
          file={previewing.file}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      {picking ? (
        <DropCustomerPicker
          fileCount={selectedFiles(picking).length}
          canPickRoaming={canPickRoaming}
          busy={busyId === picking.id}
          onCancel={() => setPicking(null)}
          onConfirm={(pickedCustomer) => void saveToPicked(picking, pickedCustomer)}
        />
      ) : null}
    </>
  );
}

function documentTypeLabel(file: QueueFile, locale: 'en' | 'hi'): string {
  return isDocumentType(file.suggestedDocumentType)
    ? DOCUMENT_TYPE_LABELS[file.suggestedDocumentType][locale]
    : DOCUMENT_TYPE_LABELS.unknown[locale];
}

function statusTone(session: QueueSession): Tone {
  if (session.status === 'ready') return 'success';
  return session.files.length > 0 ? 'info' : 'neutral';
}
