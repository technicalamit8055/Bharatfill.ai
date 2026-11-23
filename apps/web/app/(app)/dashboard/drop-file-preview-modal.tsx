'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spinner } from '@assistigo/ui';
import { DOCUMENT_TYPE_LABELS, isDocumentType } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { formatBytes } from '@/lib/documents/format';

/**
 * A look at one staged walk-in file before it becomes anybody's document (§9.1).
 *
 * The operator has to answer one question here — whose document is this, and is it the one they
 * meant to send — and the modal is built for exactly that. There is no rotate, no crop and no
 * annotate: the moment a file is worth editing it is worth taking in first, and the document
 * tools already do that job properly on a real document.
 *
 * The bytes never enter component state. A short-lived signed URL is minted per open and used as
 * an `<img>` or `<iframe>` source, so the file lives in the browser's cache for five minutes and
 * nowhere else — the same handling as a document read, because a staged Aadhaar is no less
 * sensitive for not having been claimed yet.
 */

type PreviewFile = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  suggestedDocumentType: string;
};

type SignedPreview = { url: string; mimeType: string; filename: string };

export function DropFilePreviewModal({
  sessionId,
  file,
  onClose,
}: {
  sessionId: string;
  file: PreviewFile;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [preview, setPreview] = useState<SignedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const sign = useCallback(async (): Promise<SignedPreview | null> => {
    const response = await fetch(
      `/api/document-drop/sessions/${sessionId}/files/${file.id}/signed-url`,
      { method: 'POST' },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { data: SignedPreview };
    return json.data ?? null;
  }, [sessionId, file.id]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const signed = await sign();
        if (cancelled) return;
        if (!signed) {
          setError('documentDrop.queue.previewFailed');
          return;
        }
        setPreview(signed);
      } catch {
        if (!cancelled) setError('documentDrop.queue.previewFailed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sign]);

  // Focus lands on the close button so the modal is escapable from the keyboard immediately.
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * A second signed URL rather than a reuse of the preview one. The preview URL may be minutes
   * old by the time the operator decides to keep a copy, and each issue is separately audited —
   * which is the point: a download is a different act from a look.
   */
  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const signed = await sign();
      if (!signed) {
        setError('documentDrop.queue.downloadFailed');
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = signed.url;
      anchor.download = signed.filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError('documentDrop.queue.downloadFailed');
    } finally {
      setDownloading(false);
    }
  }

  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  const typeLabel = isDocumentType(file.suggestedDocumentType)
    ? DOCUMENT_TYPE_LABELS[file.suggestedDocumentType][locale]
    : DOCUMENT_TYPE_LABELS.unknown[locale];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.filename}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{file.filename}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {typeLabel} · {formatBytes(file.sizeBytes)}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor">
              <path d="M5 5l10 10M15 5L5 15" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4">
          {error ? (
            <Alert tone="danger">{t(error)}</Alert>
          ) : preview === null ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : isImage ? (
            // A plain <img>, not next/image: the optimiser would fetch and cache a citizen's
            // identity document on the server, which is exactly what private storage and a
            // five-minute signed URL exist to prevent.
            <img
              src={preview.url}
              alt={file.filename}
              className="mx-auto max-h-[60vh] w-auto rounded-md bg-white object-contain shadow-sm"
            />
          ) : isPdf ? (
            <iframe
              src={preview.url}
              title={file.filename}
              className="h-[60vh] w-full rounded-md border border-slate-200 bg-white"
            />
          ) : (
            // Nothing else can arrive — the intake MIME allow-list is images and PDF — but a
            // future type must degrade to "download it" rather than to a blank box.
            <Alert tone="info">{t('documentDrop.queue.previewUnavailable')}</Alert>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" size="sm" loading={downloading} onClick={() => void download()}>
            {t('documentDrop.queue.download')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
