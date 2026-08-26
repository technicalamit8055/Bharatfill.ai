import Link from 'next/link';
import { Card, EmptyState } from '@assistigo/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DocumentRow } from '@/lib/supabase/database.types';
import { DocumentsTable } from './documents-table';

export const metadata = { title: 'Documents' };

const BUTTON_LINK =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export default async function DocumentsPage() {
  const session = await requirePagePermission('document.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('documents')
    .select(
      'id, customer_id, original_filename, mime_type, size_bytes, document_type, status, created_at',
    )
    .eq('organization_id', session.organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const documents = (data ?? []) as Pick<
    DocumentRow,
    | 'id'
    | 'customer_id'
    | 'original_filename'
    | 'mime_type'
    | 'size_bytes'
    | 'document_type'
    | 'status'
    | 'created_at'
  >[];
  const canUpload = session.permissions.has('document.upload');
  const canDelete = session.permissions.has('document.delete');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('documents.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('documents.subtitle')}</p>
        </div>
        {canUpload ? (
          <Link href="/documents/upload" className={BUTTON_LINK}>
            {t('documents.upload')}
          </Link>
        ) : null}
      </div>

      <Card>
        {documents.length === 0 ? (
          <EmptyState
            title={t('documents.emptyTitle')}
            description={t('documents.emptyDescription')}
            action={
              canUpload ? (
                <Link href="/documents/upload" className={BUTTON_LINK}>
                  {t('documents.upload')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <DocumentsTable documents={documents} locale={locale} canDelete={canDelete} />
        )}
      </Card>
    </div>
  );
}
