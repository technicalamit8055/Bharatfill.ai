import Link from 'next/link';
import { Badge, Button, Card, EmptyState } from '@assistigo/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog, type CatalogAdapter } from '@/lib/forms/adapters';
import { FormLibraryFilters } from './form-library-filters';
import { ReportFormModal } from './report-form-modal';

export const metadata = { title: 'Form library' };

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  testing: 'warning',
  active: 'success',
  deprecated: 'neutral',
};

export default async function FormLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('fill.run');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : '';
  const region = typeof params.region === 'string' ? params.region : '';
  const status = typeof params.status === 'string' ? params.status : '';

  const catalog = await loadAdapterCatalog(supabase, session.organization.id);
  const regions = Array.from(
    new Set(catalog.map((adapter) => adapter.region).filter((value): value is string => Boolean(value))),
  ).sort();

  const adapters: CatalogAdapter[] = catalog.filter((adapter) => {
    if (region && adapter.region !== region) return false;
    if (status && adapter.status !== status) return false;
    if (q) {
      const haystack = `${adapter.portalName} ${adapter.formName} ${adapter.region ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const canCreateApplication = session.permissions.has('application.create');
  const canReport = session.permissions.has('formreport.create');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('formLibrary.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('formLibrary.subtitle')}</p>
        </div>
        {canReport ? <ReportFormModal /> : null}
      </div>

      <FormLibraryFilters q={q} region={region} status={status} regions={regions} />

      {adapters.length === 0 ? (
        <Card>
          <EmptyState title={t('formLibrary.empty')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adapters.map((adapter) => (
            <Card key={adapter.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {adapter.portalName}
                  </h2>
                  <p className="truncate text-sm text-slate-500">{adapter.formName}</p>
                </div>
                <Badge tone={STATUS_TONE[adapter.status] ?? 'neutral'}>
                  {t(`formLibrary.status.${adapter.status}`)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {adapter.region ? <Badge tone="neutral">{adapter.region}</Badge> : null}
                <span>
                  {t('formLibrary.healthLabel')}:{' '}
                  {adapter.health.successRate === null
                    ? t('formLibrary.healthUnknown')
                    : `${Math.round(adapter.health.successRate * 100)}%`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {adapter.fields.length} mapped fields · {adapter.documentRequirements.length}{' '}
                document{adapter.documentRequirements.length === 1 ? '' : 's'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href={`/form-library/${adapter.slug}`}>
                  <Button size="sm" variant="secondary">
                    {t('formLibrary.viewSpecs')}
                  </Button>
                </Link>
                {adapter.urlPatterns[0] ? (
                  <a href={adapter.urlPatterns[0]} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">
                      {t('formLibrary.launchPortal')}
                    </Button>
                  </a>
                ) : null}
                {canCreateApplication ? (
                  <Link
                    href={
                      adapter.persisted
                        ? `/applications/new?portalAdapterId=${adapter.id}`
                        : `/applications/new?portalName=${encodeURIComponent(adapter.portalName)}&formName=${encodeURIComponent(adapter.formName)}`
                    }
                  >
                    <Button size="sm" variant="ghost">
                      {t('formLibrary.createApplication')}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
