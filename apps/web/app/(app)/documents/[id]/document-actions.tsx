'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Select } from '@assistigo/ui';
import { EXTRACTION_MODES, type ExtractionMode } from '@assistigo/ai/types';
import { useTranslations } from '@/lib/i18n/client';

/**
 * View / re-process / delete for one document.
 *
 * "View" fetches a fresh signed URL every time rather than embedding one in the page: the URL
 * expires in five minutes and each issue is audited, so a link sitting in rendered HTML would
 * be both stale and unlogged (docs/SECURITY.md §4).
 *
 * "Read again" carries a reading-method picker because the commonest reason to press it is that
 * the last read came back empty — a photograph the basic reader cannot see, or a scan whose
 * labels did not match. Re-uploading the file to change the method would be busywork, so the
 * method is chosen here and applied to the queued job (docs/AI_PIPELINE.md §2).
 *
 * It stays available while the document says "Reading", which is deliberate. That state means a
 * job is queued; if nothing ever ran it, this button is the only thing that will.
 */
export function DocumentActions({
  documentId,
  canDownload,
  canDelete,
  canProcess,
}: {
  documentId: string;
  canDownload: boolean;
  canDelete: boolean;
  canProcess: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<'view' | 'process' | 'delete' | null>(null);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('auto');

  async function view() {
    setBusy('view');
    try {
      const response = await fetch(`/api/documents/${documentId}/signed-url`, { method: 'POST' });
      const json = (await response.json()) as { data?: { url: string } };
      if (json.data?.url) window.open(json.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  }

  async function reprocess() {
    setBusy('process');
    try {
      await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extractionMode }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(t('documents.deleteConfirm'))) return;
    setBusy('delete');
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
      if (response.ok) router.push('/documents');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canDownload ? (
        <Button size="sm" variant="secondary" loading={busy === 'view'} onClick={view}>
          {t('documents.view')}
        </Button>
      ) : null}
      {canProcess ? (
        <>
          <Select
            aria-label={t('documents.extractionMode.label')}
            className="h-9 w-auto py-0 text-xs"
            value={extractionMode}
            disabled={busy !== null}
            onChange={(event) => setExtractionMode(event.target.value as ExtractionMode)}
          >
            {EXTRACTION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`documents.extractionMode.options.${mode}`)}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" loading={busy === 'process'} onClick={reprocess}>
            {t('documents.reprocess')}
          </Button>
        </>
      ) : null}
      {canDelete ? (
        <Button size="sm" variant="ghost" loading={busy === 'delete'} onClick={remove}>
          {t('common.delete')}
        </Button>
      ) : null}
    </div>
  );
}
