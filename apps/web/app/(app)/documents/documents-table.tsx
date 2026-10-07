'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Checkbox, TBody, TD, TH, THead, TR, Table } from '@assistigo/ui';
import { DOCUMENT_TYPE_LABELS, formatIndianDate, isDocumentType } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { localised } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatBytes } from '@/lib/documents/format';

type DocumentListItem = {
  id: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  document_type: string | null;
  status: string | null;
  created_at: string | null;
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  uploaded: 'neutral',
  processing: 'info',
  extracted: 'info',
  review_required: 'warning',
  verified: 'success',
  stored: 'success',
  failed: 'danger',
};

/**
 * Interactive documents list — row selection plus a bulk-delete toolbar.
 *
 * Split out from the page so the page itself can stay a server component doing the initial
 * fetch; selection state and the delete call need a client boundary.
 */
export function DocumentsTable({
  documents,
  locale,
  canDelete,
}: {
  documents: DocumentListItem[];
  locale: Locale;
  canDelete: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const allSelected = documents.length > 0 && selected.size === documents.length;
  const someSelected = selected.size > 0 && !allSelected;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(documents.map((doc) => doc.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      t('documents.bulkDeleteConfirm', { count: selectedIds.length }),
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/documents/bulk', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        window.alert(t('documents.bulkDeleteFailed'));
        return;
      }
      const json = (await response.json()) as {
        data?: { deleted: string[]; failed: string[]; notFound: string[] };
      };
      if (json.data?.failed.length) {
        window.alert(t('documents.bulkDeleteFailed'));
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {canDelete && selected.size > 0 ? (
        <div className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
          <span className="text-sm font-medium text-slate-700">
            {t('documents.selectedCount', { count: selected.size })}
          </span>
          <Button size="sm" variant="danger" loading={deleting} onClick={bulkDelete}>
            {t('documents.bulkDelete', { count: selected.size })}
          </Button>
        </div>
      ) : null}

      <Table>
        <THead>
          <TR>
            {canDelete ? (
              <TH className="w-10">
                <Checkbox
                  aria-label={t('documents.selectAll')}
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                />
              </TH>
            ) : null}
            <TH>{t('documents.file')}</TH>
            <TH>{t('documents.type')}</TH>
            <TH>{t('documents.size')}</TH>
            <TH>{t('settings.status')}</TH>
            <TH>{t('customers.created')}</TH>
          </TR>
        </THead>
        <TBody>
          {documents.map((document) => (
            <TR key={document.id}>
              {canDelete ? (
                <TD>
                  <Checkbox
                    aria-label={document.original_filename ?? document.id}
                    checked={selected.has(document.id)}
                    onChange={() => toggleOne(document.id)}
                  />
                </TD>
              ) : null}
              <TD>
                <Link
                  href={`/documents/${document.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {document.original_filename}
                </Link>
              </TD>
              <TD className="text-slate-600">
                {isDocumentType(document.document_type)
                  ? localised(DOCUMENT_TYPE_LABELS[document.document_type], locale)
                  : '—'}
              </TD>
              <TD className="tabular-nums text-slate-500">
                {formatBytes(document.size_bytes ?? 0)}
              </TD>
              <TD>
                <Badge tone={STATUS_TONE[document.status ?? ''] ?? 'neutral'}>
                  {t(`documents.statuses.${document.status}`)}
                </Badge>
              </TD>
              <TD className="text-slate-500">
                {formatIndianDate(document.created_at?.slice(0, 10)) ?? '—'}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
