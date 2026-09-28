import Link from 'next/link';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { emptySchemeInput } from '@/lib/admin/scheme-write';
import { getTranslations } from '@/lib/i18n/server';
import { AdminPageHeader } from '../../ui';
import { SchemeForm } from '../scheme-form';

export const metadata = { title: 'New scheme' };

export default async function NewSchemePage() {
  const session = await requirePlatformPagePermission('platform.schemes.edit');
  const { t } = await getTranslations();

  return (
    <>
      <AdminPageHeader
        title={t('admin.schemes.newTitle')}
        description={t('admin.schemes.newSubtitle')}
        actions={
          <Link
            href="/admin/schemes"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            {t('common.cancel')}
          </Link>
        }
      />

      <SchemeForm
        initial={emptySchemeInput()}
        canPublish={session.permissions.has('platform.schemes.publish')}
      />
    </>
  );
}
