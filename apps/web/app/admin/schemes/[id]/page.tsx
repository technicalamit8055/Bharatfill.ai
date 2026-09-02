import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatIndianDate } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { schemeInputFromRow } from '@/lib/admin/scheme-write';
import { getTranslations } from '@/lib/i18n/server';
import type { AdminCatalogRow } from '@/lib/admin/catalog';
import { AdminBadge, AdminNote, AdminPageHeader } from '../../ui';
import { SchemeForm } from '../scheme-form';
import { SchemeRowActions } from './scheme-row-actions';

export const metadata = { title: 'Edit scheme' };

/**
 * One global scheme.
 *
 * Gated on `platform.schemes.view` rather than `.edit`, so a support admin can open a scheme to
 * answer "what does the catalogue actually say about this?" without being able to change it. The
 * form renders read-only for them, and every action re-checks its own permission server-side.
 */
export default async function AdminSchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePlatformPagePermission('platform.schemes.view');
  const { t } = await getTranslations();
  const { id } = await params;

  const { data } = await session.supabase
    .from('schemes_catalog')
    .select('*')
    .eq('id', id)
    // Global rows only. A tenant's private scheme is their data and has no page here.
    .is('organization_id', null)
    .maybeSingle();

  if (!data) notFound();
  const row = data as AdminCatalogRow;

  const canEdit = session.permissions.has('platform.schemes.edit');

  return (
    <>
      <AdminPageHeader
        title={row.slug}
        description={t('admin.schemes.editSubtitle')}
        actions={
          <div className="flex items-center gap-2">
            {row.is_published ? (
              <AdminBadge tone="success">{t('admin.schemes.live')}</AdminBadge>
            ) : (
              <AdminBadge tone="warning">{t('admin.schemes.draft')}</AdminBadge>
            )}
            <Link
              href="/admin/schemes"
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              {t('common.back')}
            </Link>
          </div>
        }
      />

      <AdminNote>
        {t('admin.schemes.provenanceNote', {
          source: t(`admin.schemes.source.${row.source}`),
          verified: formatIndianDate(row.verified_at) ?? t('admin.schemes.neverVerified'),
        })}
        {row.source_url ? (
          <>
            {' · '}
            <a
              href={row.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {t('admin.schemes.openSource')}
            </a>
          </>
        ) : null}
      </AdminNote>

      <SchemeForm
        schemeId={row.id}
        initial={schemeInputFromRow(row)}
        canPublish={session.permissions.has('platform.schemes.publish')}
        readOnly={!canEdit}
      />

      <SchemeRowActions
        schemeId={row.id}
        isPublished={row.is_published}
        canPublish={session.permissions.has('platform.schemes.publish')}
        canDelete={session.permissions.has('platform.schemes.delete')}
      />
    </>
  );
}
