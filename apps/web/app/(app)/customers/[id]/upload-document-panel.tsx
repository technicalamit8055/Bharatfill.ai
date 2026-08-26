'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, ProgressBar, Select } from '@assistigo/ui';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  MAX_UPLOAD_BYTES,
  isAllowedUploadMimeType,
  type DocumentType,
} from '@assistigo/core';
import type { ExtractionMode } from '@assistigo/ai/types';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { ExtractionModeSelect } from '@/components/documents/extraction-mode-select';
import { ActiveAiVendorNote } from '@/components/documents/active-ai-vendor-note';
import { formatBytes } from '@/lib/documents/format';
import { ExtractionReview, type ReviewField } from '../../documents/[id]/extraction-review';

/**
 * Upload a document straight from the customer profile (§9.3, §7.3.4).
 *
 * The same three-step upload as the standalone `/documents/upload` page — reserve, PUT the bytes
 * to storage, then ask the server to verify and queue extraction. `POST /api/documents/:id/process`
 * already runs that job in-request in most deployments (`JOB_INLINE_RUNNER=on`), so this panel
 * polls `GET /api/documents/:id/extraction` right after upload and, as soon as a result lands,
 * renders the same accept/edit/reject table the standalone document page uses
 * (`../../documents/[id]/extraction-review.tsx`) — matching the paste-text panel's inline review
 * instead of sending the operator away to review it later.
 */

const POLL_INTERVAL_MS = 3000;
const PENDING_STATUSES = new Set(['uploaded', 'processing']);

type Warning = { code: string; messageKey: string; fieldKey?: string };

type ExtractionGetResponse = {
  documentId: string;
  documentStatus: string;
  customerId: string | null;
  extraction: {
    id: string;
    status: 'pending' | 'completed' | 'review_required' | 'failed' | 'accepted' | 'rejected';
    documentType: string;
    provider: string;
    confidence: number | null;
    reviewedAt: string | null;
    warnings: Warning[];
    fields: ReviewField[];
  } | null;
};

export function UploadDocumentPanel({
  customerId,
  canReview,
}: {
  customerId: string;
  canReview: boolean;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('auto');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentStatus, setDocumentStatus] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionGetResponse['extraction']>(null);
  const [reviewed, setReviewed] = useState(false);

  async function fetchExtraction(id: string) {
    try {
      const response = await fetch(`/api/documents/${id}/extraction`);
      const json = (await response.json()) as
        | { data: ExtractionGetResponse }
        | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) return;

      setDocumentStatus(json.data.documentStatus);
      if (json.data.extraction) setResult(json.data.extraction);
    } catch {
      // A transient network hiccup. The poll interval tries again.
    }
  }

  // Keeps polling while the job is still running elsewhere (a scheduler-owned queue, or an
  // inline run that lost its lease race) — the same situation `AutoRefreshWhileProcessing`
  // covers on the standalone document page.
  useEffect(() => {
    if (documentId === null || documentStatus === null || !PENDING_STATUSES.has(documentStatus)) {
      return;
    }

    const timer = setInterval(() => {
      void fetchExtraction(documentId);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [documentId, documentStatus]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    // Checked again on the server — this is only here so the operator finds out now rather
    // than after waiting for a 15 MB upload.
    if (!isAllowedUploadMimeType(selected.type)) {
      setFile(null);
      setError('validation.unsupported_file_type');
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError('validation.file_too_large');
      return;
    }

    setFile(selected);
  }

  function startOver() {
    setFile(null);
    setDocumentType('');
    setDocumentId(null);
    setDocumentStatus(null);
    setResult(null);
    setReviewed(false);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    setPending(true);
    setError(null);
    setResult(null);
    setReviewed(false);

    try {
      const intentResponse = await fetch('/api/documents/upload-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          customerId,
          ...(documentType === '' ? {} : { documentType }),
        }),
      });

      const intentJson = (await intentResponse.json()) as
        | { data: { documentId: string; uploadUrl: string } }
        | { error: { messageKey: string } };

      if (!intentResponse.ok || 'error' in intentJson) {
        setError('error' in intentJson ? intentJson.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }

      const intent = intentJson.data;

      const uploadResponse = await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        setError('documents.errors.uploadFailed');
        setPending(false);
        return;
      }

      // The server has not seen a byte until this call: it downloads the object, checks the
      // magic bytes against what we claimed, and only then queues extraction — and, in most
      // deployments, runs it in-request.
      const processResponse = await fetch(`/api/documents/${intent.documentId}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extractionMode }),
      });

      const processJson = (await processResponse.json()) as
        | { data: { status: string } }
        | { error: { messageKey: string } };

      if (!processResponse.ok || 'error' in processJson) {
        setError('error' in processJson ? processJson.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }

      setDocumentId(intent.documentId);
      setDocumentStatus(processJson.data.status);
      setFile(null);
      setDocumentType('');
      await fetchExtraction(intent.documentId);
      // The Documents card below reads from the same server component tree, so this is what
      // makes the new row (and its status) show up without a full page reload.
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  const isPending = documentStatus !== null && PENDING_STATUSES.has(documentStatus);
  const isFailed = documentStatus === 'failed';
  const alreadyReviewed =
    reviewed || result?.status === 'accepted' || result?.status === 'rejected';

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('customers.paste.uploadIntro')}</p>

      {documentId === null ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="profile-upload-file" className="text-sm font-medium text-slate-800">
              {t('documents.file')}
            </label>
            <input
              id="profile-upload-file"
              name="file"
              type="file"
              required
              accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
              onChange={handleFileChange}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-slate-500">
              {t('documents.fileHint', { size: formatBytes(MAX_UPLOAD_BYTES) })}
            </p>
            {file ? (
              <p className="text-xs text-slate-600">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-upload-type" className="text-sm font-medium text-slate-800">
              {t('documents.type')}
            </label>
            <Select
              id="profile-upload-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              <option value="">{t('documents.detectType')}</option>
              {DOCUMENT_TYPES.filter((type) => type !== 'unknown').map((type: DocumentType) => (
                <option key={type} value={type}>
                  {DOCUMENT_TYPE_LABELS[type][locale]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">{t('documents.typeHint')}</p>
          </div>

          <ExtractionModeSelect
            id="profile-upload-mode"
            value={extractionMode}
            onChange={setExtractionMode}
            disabled={pending}
          />
          {extractionMode !== 'non_ai' ? <ActiveAiVendorNote /> : null}

          {error ? <Alert tone="danger">{t(error)}</Alert> : null}

          <Button type="submit" loading={pending} disabled={!file}>
            {t('documents.upload')}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          {isPending ? (
            <Alert tone="info" title={t('documents.processingTitle')}>
              <p>{t('documents.processingHelp')}</p>
              <ProgressBar className="mt-2 max-w-xs" />
            </Alert>
          ) : null}

          {isFailed ? (
            <Alert tone="danger" title={t('documents.failedTitle')}>
              {t('documents.failedHelp')}
            </Alert>
          ) : null}

          {result && result.warnings.length > 0 ? (
            <Alert tone="warning" title={t('documents.warnings.title')}>
              <ul className="list-inside list-disc space-y-1">
                {result.warnings.map((warning) => (
                  <li key={`${warning.code}-${warning.fieldKey ?? ''}`}>{t(warning.messageKey)}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {alreadyReviewed ? (
            <Alert tone="success" title={t('documents.review.doneTitle')}>
              {t('customers.paste.uploadedHelp')}
            </Alert>
          ) : result && result.fields.length > 0 ? (
            <ExtractionReview
              documentId={documentId}
              fields={result.fields}
              hasCustomer
              canReview={canReview}
              onSaved={() => setReviewed(true)}
            />
          ) : result && !isPending && !isFailed ? (
            <p className="text-sm text-slate-500">{t('documents.review.noFields')}</p>
          ) : null}

          {error ? <Alert tone="danger">{t(error)}</Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={startOver}>
              {t('customers.paste.uploadAnother')}
            </Button>
            <Link href={`/documents/${documentId}`} className="text-sm font-medium underline">
              {t('documents.view')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
