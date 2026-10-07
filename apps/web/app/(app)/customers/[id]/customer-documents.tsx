import Link from 'next/link';
import { Badge, ProgressBar, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { DOCUMENT_TYPE_LABELS, formatIndianDate, isDocumentType } from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatBytes } from '@/lib/documents/format';
import { AutoRefreshWhileProcessing } from '@/components/documents/auto-refresh-while-processing';
import type { DocumentRow } from '@/lib/supabase/database.types';
import { DocumentsIcon, PlusIcon } from '../icons';
import { DetailCard, DetailEmpty, PRIMARY_BUTTON } from './detail-card';
import { DocumentRowActions } from './document-row-actions';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  uploaded: 'neutral',
  processing: 'info',
  extracted: 'info',
  review_required: 'warning',
  verified: 'success',
  stored: 'success',
  failed: 'danger',
};

/** The file-type chip beside a document's name: red for a PDF, blue for a photo or scan. */
function FileChip({ mimeType }: { mimeType: string | null | undefined }) {
  const isPdf = mimeType === 'application/pdf';
  return (
    <span
      aria-hidden
      className={`flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold uppercase ${
        isPdf ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'
      }`}
    >
      {isPdf ? 'pdf' : 'img'}
    </span>
  );
}

/**
 * The documents attached to one customer (§7.3.4).
 *
 * Metadata only — opening a document goes through the signed-URL route, which is audited
 * (docs/SECURITY.md §4).
 */
export async function CustomerDocuments({
  customerId,
  organizationId,
  canUpload,
  canDownload,
}: {
  customerId: string;
  organizationId: string;
  canUpload: boolean;
  canDownload: boolean;
}) {
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('documents')
    .select('id, original_filename, document_type, mime_type, status, size_bytes, created_at')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  const documents = (data ?? []) as Partial<DocumentRow>[];
  const isProcessing = documents.some((document) => document.status === 'processing');

  return (
    <DetailCard
      icon={DocumentsIcon}
      tone="brand"
      title={t('documents.title')}
      bodyClassName={documents.length === 0 ? undefined : 'px-0 py-0'}
      actions={
        canUpload ? (
          <Link href={`/documents/upload?customerId=${customerId}`} className={PRIMARY_BUTTON}>
            <PlusIcon className="h-4 w-4" />
            {t('documents.upload')}
          </Link>
        ) : undefined
      }
    >
      <AutoRefreshWhileProcessing isProcessing={isProcessing} />
      {documents.length === 0 ? (
        <DetailEmpty title={t('documents.emptyTitle')} description={t('documents.emptyDescription')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="pl-5">{t('documents.file')}</TH>
              <TH>{t('documents.type')}</TH>
              <TH>{t('documents.size')}</TH>
              <TH>{t('settings.status')}</TH>
              <TH>{t('customers.addedOn')}</TH>
              <TH className="pr-5 text-right">{t('customers.actions')}</TH>
            </TR>
          </THead>
          <TBody>
            {documents.map((document) => (
              <TR key={document.id}>
                <TD className="pl-5">
                  <Link
                    href={`/documents/${document.id}`}
                    className="flex items-center gap-2.5 font-medium text-brand-700 hover:underline"
                  >
                    <FileChip mimeType={document.mime_type} />
                    <span className="break-all">{document.original_filename}</span>
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
                  {document.status === 'processing' ? (
                    <ProgressBar className="mt-1.5 max-w-[10rem]" />
                  ) : null}
                </TD>
                <TD className="text-slate-500">
                  {formatIndianDate(document.created_at?.slice(0, 10)) ?? '—'}
                </TD>
                <TD className="pr-5">
                  <DocumentRowActions
                    documentId={document.id ?? ''}
                    fileName={document.original_filename ?? ''}
                    canDownload={canDownload}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </DetailCard>
  );
}
