'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/client';
import { DownloadIcon, ViewIcon } from '../icons';
import { ICON_BUTTON } from './detail-card';

/**
 * A document row's actions on the customer profile: open its detail page, or fetch the file.
 *
 * The file goes through `POST /api/documents/:id/signed-url` — the same short-lived, audited
 * route the document page uses (docs/SECURITY.md §4) — never a stored or guessable URL.
 */
export function DocumentRowActions({
  documentId,
  fileName,
  canDownload,
}: {
  documentId: string;
  fileName: string;
  canDownload: boolean;
}) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/signed-url`, { method: 'POST' });
      const json = (await response.json()) as { data?: { url: string } };
      if (json.data?.url) window.open(json.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/documents/${documentId}`}
        aria-label={t('documents.viewNamed', { name: fileName })}
        title={t('documents.view')}
        className={ICON_BUTTON}
      >
        <ViewIcon className="h-4 w-4" />
      </Link>
      {canDownload ? (
        <button
          type="button"
          onClick={() => void download()}
          disabled={pending}
          aria-label={t('documents.downloadNamed', { name: fileName })}
          title={t('documents.download')}
          className={ICON_BUTTON}
        >
          <DownloadIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
