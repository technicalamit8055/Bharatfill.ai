'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_DROP_FILES_PER_SESSION,
  MAX_UPLOAD_BYTES,
  isAllowedUploadMimeType,
} from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { formatBytes } from '@/lib/documents/format';

/**
 * The citizen's upload control.
 *
 * Built for the actual situation: somebody standing at a counter, on a mid-range Android, on a
 * congested mobile network, who has never seen this page before. That drives every choice here.
 *
 *   - **One file per request.** A batch that fails at 80% loses all four photos; a per-file loop
 *     loses one, tells them which, and keeps the rest.
 *   - **`capture` is not forced.** `accept` covers images and PDFs and the OS offers both camera
 *     and files — forcing the camera would block the citizen whose Aadhaar is already a PDF in
 *     their downloads.
 *   - **Size and type are checked before the request.** Not as security (the server sniffs the
 *     bytes regardless) but so a 30 MB scan fails in a second instead of after a minute of
 *     uploading over a 3G link.
 *   - **Bilingual completion.** The one message that has to land is "the operator has your
 *     documents, go to the counter", so it is shown in both languages at once rather than
 *     depending on a locale nobody set.
 */

type Status = { name: string; state: 'sending' | 'sent' | 'failed'; messageKey?: string };

/**
 * Where the session code for this visit is remembered across a reload.
 *
 * `sessionStorage`, not a cookie or `localStorage`, and the scope is exactly right by accident
 * of what it is: per-tab and per-origin, cleared when the tab closes. So one citizen's reload
 * keeps sending to their own session, and the next citizen at the same counter — a different
 * phone, a different tab — gets their own.
 */
const STORAGE_PREFIX = 'assistigo.drop.';

function rememberSession(scannedCode: string, sessionCode: string): void {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${scannedCode}`, sessionCode);
  } catch {
    // Private mode, or storage disabled. The upload already succeeded; only reload-resilience
    // is lost, and a reload then behaves as it would have without this at all.
  }
}

function recallSession(scannedCode: string): string | null {
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${scannedCode}`);
  } catch {
    return null;
  }
}

export function DropUploader({
  code,
  whatsappLink,
}: {
  /** The code as scanned — a desk session code, or a permanent counter code. */
  code: string;
  whatsappLink: string | null;
}) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement | null>(null);

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * The session the first upload landed in.
   *
   * Every file after the first is addressed to this rather than to the scanned code, because a
   * counter code resolves to a *new* session each time it is used — sending four photos to a
   * standee code would otherwise produce four one-file sessions and four queue rows for one
   * person, which is the exact mixing this feature exists to prevent.
   */
  const sessionCode = useRef<string | null>(null);

  // Pick up the session from before a reload, so a citizen who refreshes mid-upload keeps
  // sending into the same intake instead of starting a second one.
  useEffect(() => {
    sessionCode.current = recallSession(code);
  }, [code]);

  const sentCount = statuses.filter((status) => status.state === 'sent').length;

  async function upload(file: File): Promise<Status> {
    // Checked here purely so the citizen finds out now rather than after a minute of uploading
    // over a counter's mobile connection. The server sniffs the bytes regardless.
    if (!isAllowedUploadMimeType(file.type)) {
      return { name: file.name, state: 'failed', messageKey: 'documentDrop.public.wrongType' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { name: file.name, state: 'failed', messageKey: 'documentDrop.public.tooLarge' };
    }

    const target = sessionCode.current ?? code;

    const body = new FormData();
    body.set('file', file);

    try {
      const response = await fetch(`/api/document-drop/public/${encodeURIComponent(target)}`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        // A remembered session that has since been claimed or swept returns 404. Fall back to
        // the scanned code once, which opens a fresh session, rather than stranding the citizen.
        if (response.status === 404 && sessionCode.current !== null) {
          sessionCode.current = null;
          return upload(file);
        }
        return { name: file.name, state: 'failed', messageKey: 'documentDrop.public.failed' };
      }

      const json = (await response.json()) as { data?: { sessionCode?: string } };
      const resolved = json.data?.sessionCode;
      if (resolved) {
        sessionCode.current = resolved;
        rememberSession(code, resolved);
      }

      return { name: file.name, state: 'sent' };
    } catch {
      return { name: file.name, state: 'failed', messageKey: 'documentDrop.public.failed' };
    }
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    if (chosen.length === 0) return;

    // The server enforces the same ceiling per session; trimming here means the citizen is not
    // told "too many documents" after waiting for the eleventh one to upload.
    const files = chosen.slice(0, MAX_DROP_FILES_PER_SESSION);

    setBusy(true);
    setStatuses((current) => [
      ...current,
      ...files.map((file): Status => ({ name: file.name, state: 'sending' })),
    ]);

    // Sequential, not parallel: four concurrent uploads over a counter's mobile connection is
    // slower than four in a row, and the progress line stays honest.
    for (const file of files) {
      const result = await upload(file);
      setStatuses((current) => {
        const next = [...current];
        const index = next.findIndex(
          (status) => status.name === file.name && status.state === 'sending',
        );
        if (index >= 0) next[index] = result;
        return next;
      });
    }

    setBusy(false);
    // Cleared so choosing the same file again re-fires `change`.
    if (input.current) input.current.value = '';
  }

  return (
    <div className="space-y-4">
      {whatsappLink ? (
        <a
          href={whatsappLink}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-base font-semibold text-white shadow-sm active:brightness-95"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="currentColor"
          >
            <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.4A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.9 1.2-.6 0-1.9-.2-3.9-1.4-2.3-1.4-3.7-3.9-3.8-4.1-.6-1-.7-2 .1-2.9.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3 0 .6.3.5.8 1.2 1.5 1.7.8.6 1.3.8 1.6.9.2 0 .4 0 .5-.2l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.3.1.4.3.4.4.1.2 0 .8-.2 1.3Z" />
          </svg>
          {t('documentDrop.public.whatsappCta')}
        </a>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm active:brightness-95 disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('documentDrop.public.uploadCta')}
        </button>

        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
          onChange={(event) => void onChange(event)}
        />

        <p className="mt-2 text-center text-xs text-slate-500">
          {t('documentDrop.public.uploadHint', {
            size: formatBytes(MAX_UPLOAD_BYTES),
            count: MAX_DROP_FILES_PER_SESSION,
          })}
        </p>
      </div>

      {statuses.length > 0 ? (
        <ul className="space-y-1.5" aria-live="polite">
          {statuses.map((status, index) => (
            <li
              key={`${status.name}-${index}`}
              className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span aria-hidden className="mt-0.5">
                {status.state === 'sent' ? '✅' : status.state === 'failed' ? '⚠️' : '⏳'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800">{status.name}</span>
                {status.messageKey ? (
                  <span className="block text-xs text-red-600">
                    {t(status.messageKey, { size: formatBytes(MAX_UPLOAD_BYTES) })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {sentCount > 0 && !busy ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-emerald-900">
            {t('documentDrop.public.sent', { count: sentCount })}
          </p>
          {/* Both languages, because this is the instruction that has to be understood. */}
          <p className="mt-1 text-sm text-emerald-800">{t('documentDrop.public.doneHi')}</p>
          <p className="text-xs text-emerald-700">{t('documentDrop.public.done')}</p>
        </div>
      ) : null}
    </div>
  );
}
