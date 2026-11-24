'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card, Select } from '@assistigo/ui';
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
import { SkipReadingToggle, storeOnlyState } from '@/components/documents/skip-reading-toggle';
import { AppCopyAlert, type AppCopy } from '@/components/documents/app-copy-alert';
import { formatBytes } from '@/lib/documents/format';

type UploadIntent = {
  documentId: string;
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
};

/** `fromApp`: a BharatDoc app customer — the file also goes to their phone (0047). */
type CustomerOption = { id: string; label: string; fromApp?: boolean };

/**
 * Three steps, one button (§9.3):
 *
 *   1. ask the server to reserve a document row and a one-time upload URL,
 *   2. PUT the bytes straight to storage — they never pass through a route handler,
 *   3. tell the server to verify the bytes and queue extraction — or, for a photograph, a
 *      signature or anything the operator ticked "Just save — don't read" for, to verify them and
 *      save the file without reading it (§12.4).
 *
 * The file itself is never held in component state beyond the upload; there is no reason for a
 * customer's Aadhaar scan to outlive the request that stored it.
 */
export function UploadForm({
  customers,
  defaultCustomerId,
}: {
  customers: CustomerOption[];
  defaultCustomerId?: string | null;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('auto');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipReading, setSkipReading] = useState(false);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '');
  /** An app customer's upload stays here to say whether their app got it, then links on. */
  const [done, setDone] = useState<{ documentId: string; appCopy: AppCopy } | null>(null);
  const toApp = customers.some((customer) => customer.id === customerId && customer.fromApp);

  const { storeOnly, needsType } = storeOnlyState(documentType, skipReading);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || needsType) return;

    setPending(true);
    setError(null);

    try {
      const intentResponse = await fetch('/api/documents/upload-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          customerId: customerId === '' ? null : customerId,
          ...(documentType === '' ? {} : { documentType }),
        }),
      });

      const intentJson = (await intentResponse.json()) as
        { data: UploadIntent } | { error: { messageKey: string } };

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
      // magic bytes against what we claimed, and only then queues extraction — or, for a file
      // kept as it is, saves it unread.
      const processResponse = await fetch(`/api/documents/${intent.documentId}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(storeOnly ? { storeOnly: true } : { extractionMode }),
      });

      const processJson = (await processResponse.json()) as
        { data: { appCopy?: AppCopy } } | { error: { messageKey: string } };

      if (!processResponse.ok || 'error' in processJson) {
        setError('error' in processJson ? processJson.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }

      if (processJson.data.appCopy) {
        setDone({ documentId: intent.documentId, appCopy: processJson.data.appCopy });
        setPending(false);
        router.refresh();
        return;
      }

      router.push(`/documents/${intent.documentId}`);
      router.refresh();
    } catch {
      setError('errors.internal');
      setPending(false);
    }
  }

  if (done) {
    return (
      <Card>
        <div className="space-y-4">
          <AppCopyAlert appCopy={done.appCopy} />
          <Link href={`/documents/${done.documentId}`} className="text-sm font-medium underline">
            {t('documents.view')}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="file" className="text-sm font-medium text-slate-800">
            {t('documents.file')}
          </label>
          <input
            id="file"
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
          <label htmlFor="customerId" className="text-sm font-medium text-slate-800">
            {t('documents.customer')}
          </label>
          <Select
            id="customerId"
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">{t('documents.noCustomer')}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">{t('documents.customerHint')}</p>
          {toApp ? <Alert tone="info">{t('documents.appCustomerUploadNote')}</Alert> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="documentType" className="text-sm font-medium text-slate-800">
            {t('documents.type')}
          </label>
          <Select
            id="documentType"
            name="documentType"
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
          {storeOnly ? null : <p className="text-xs text-slate-500">{t('documents.typeHint')}</p>}
        </div>

        <SkipReadingToggle
          id="skipReading"
          documentType={documentType}
          checked={skipReading}
          onChange={setSkipReading}
          disabled={pending}
        />

        {storeOnly ? null : (
          <ExtractionModeSelect
            id="extractionMode"
            value={extractionMode}
            onChange={setExtractionMode}
            disabled={pending}
          />
        )}

        {error ? <Alert tone="danger">{t(error)}</Alert> : null}

        <div className="flex gap-2">
          <Button type="submit" loading={pending} disabled={!file || needsType}>
            {t(storeOnly ? 'common.save' : 'documents.upload')}
          </Button>
          <Link
            href="/documents"
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </Card>
  );
}
