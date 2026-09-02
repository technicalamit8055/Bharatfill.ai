import Link from 'next/link';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import { AdminPageHeader } from '../../ui';
import { SourceForm } from '../source-form';

export const metadata = { title: 'New scraper source' };

export default async function NewScraperSourcePage() {
  await requirePlatformPagePermission('platform.scrapers.configure');
  const { t } = await getTranslations();

  return (
    <>
      <AdminPageHeader
        title={t('admin.scrapers.newTitle')}
        description={t('admin.scrapers.newSubtitle')}
        actions={
          <Link
            href="/admin/scrapers"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            {t('common.cancel')}
          </Link>
        }
      />

      <SourceForm
        readOnly={false}
        initial={{
          slug: '',
          name: '',
          portalName: '',
          sourceUrl: 'https://',
          // Manual is the default. It needs no network and no deployment switch, so a source
          // created here works immediately rather than looking configured and doing nothing.
          fetcher: 'manual',
          isEnabled: true,
          intervalMinutes: 1440,
          notes: '',
        }}
      />
    </>
  );
}
