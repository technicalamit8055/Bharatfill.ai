import Link from 'next/link';
import {
  CITIZEN_APP_ORGANIZATION_ID,
  DOCUMENT_TYPE_LABELS,
  documentFolder,
  formatIndianDate,
  isDocumentType,
} from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isMissingColumnError } from '@/lib/supabase/missing-column';
import { formatBytes } from '@/lib/documents/format';
import { AutoRefreshWhileProcessing } from '@/components/documents/auto-refresh-while-processing';
import type { DocumentRow } from '@/lib/supabase/database.types';
import { DocumentsIcon, PlusIcon } from '../icons';
import { DetailCard, DetailEmpty, PRIMARY_BUTTON } from './detail-card';
import { DocumentFolders, type FolderDocument } from './document-folders';

/** A vault holds a person's whole document set; this is a ceiling, not a page size. */
const MAX_DOCUMENTS = 200;

/** How often an app customer's documents are re-read while open, so a phone upload shows up. */
const APP_CUSTOMER_REFRESH_MS = 20_000;

const COLUMNS =
  'id, original_filename, document_type, mime_type, status, size_bytes, created_at, label, folder';

type ListedRow = Pick<
  DocumentRow,
  | 'id'
  | 'original_filename'
  | 'document_type'
  | 'mime_type'
  | 'status'
  | 'size_bytes'
  | 'created_at'
  | 'label'
> & { folder?: DocumentRow['folder'] };

/**
 * The documents attached to one customer (§7.3.4), in the same folders as the BharatDoc app
 * vault (Identity, Education, Certificates, Photo & signature, Other — `DOCUMENT_FOLDERS`).
 *
 * For a BharatDoc app customer (0041) every file is one the citizen synced from the phone; they
 * are tagged "From BharatDoc app" and the list re-reads itself while open, so a document the
 * citizen adds at the counter appears without a reload. A folder the citizen picked in the app
 * comes through `documents.folder` (0043); everything else sits in its type's folder.
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

  const query = (columns: string) =>
    supabase
      .from('documents')
      .select(columns)
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_DOCUMENTS);

  let { data, error } = await query(COLUMNS);
  // A database that has not run 0043 yet: list everything in its type's folder.
  if (isMissingColumnError(error)) {
    ({ data, error } = await query(COLUMNS.replace(', folder', '')));
  }

  const rows = (error ? [] : (data ?? [])) as unknown as ListedRow[];
  const isAppCustomer = organizationId === CITIZEN_APP_ORGANIZATION_ID;
  const isProcessing = rows.some((row) => row.status === 'processing');

  const documents: FolderDocument[] = rows.map((row) => ({
    id: row.id,
    filename: row.original_filename,
    typeLabel: isDocumentType(row.document_type)
      ? localised(DOCUMENT_TYPE_LABELS[row.document_type], locale)
      : '—',
    mimeType: row.mime_type,
    status: row.status,
    sizeLabel: formatBytes(row.size_bytes ?? 0),
    addedOn: formatIndianDate(row.created_at?.slice(0, 10)) ?? '—',
    folder: documentFolder(row.document_type, row.folder),
    // Synced from the phone; a file a centre added for the customer (0047) carries no tag.
    fromApp: row.label === 'BharatDoc app',
  }));

  return (
    <DetailCard
      icon={DocumentsIcon}
      tone="brand"
      title={t('documents.title')}
      bodyClassName="px-0 py-0"
      actions={
        canUpload ? (
          <Link href={`/documents/upload?customerId=${customerId}`} className={PRIMARY_BUTTON}>
            <PlusIcon className="h-4 w-4" />
            {t('documents.upload')}
          </Link>
        ) : undefined
      }
    >
      {isProcessing ? (
        <AutoRefreshWhileProcessing isProcessing />
      ) : isAppCustomer ? (
        <AutoRefreshWhileProcessing isProcessing intervalMs={APP_CUSTOMER_REFRESH_MS} />
      ) : null}
      {isAppCustomer ? (
        <p className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-600">
          {t('documents.folders.appNote')}
        </p>
      ) : null}
      {documents.length === 0 ? (
        <div className="px-5 py-4">
          <DetailEmpty
            title={t('documents.emptyTitle')}
            description={t('documents.emptyDescription')}
          />
        </div>
      ) : (
        <DocumentFolders documents={documents} canDownload={canDownload} />
      )}
    </DetailCard>
  );
}
