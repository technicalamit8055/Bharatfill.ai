import Image from 'next/image';
import { EmptyState } from '@assistigo/ui';
import { SCHEME_CATEGORY_LABELS, SCHEME_CATEGORIES, type SchemeCategory } from '@assistigo/core';
import { ADAPTER_STATUSES } from '@assistigo/form-engine';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import {
  adapterCategories,
  adapterRegions,
  filterAdapters,
  isAdapterStatus,
  type FormLibraryQuery,
} from '@/lib/forms/present';
import { FormLibraryCard } from './form-library-card';
import { FormLibraryFilters } from './form-library-filters';
import { ReportFormModal } from './report-form-modal';

export const metadata = { title: 'Form library' };

function isSchemeCategory(value: string): value is SchemeCategory {
  return (SCHEME_CATEGORIES as readonly string[]).includes(value);
}

export default async function FormLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('fill.run');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const asString = (value: string | string[] | undefined): string =>
    typeof value === 'string' ? value.trim() : '';

  const statusParam = asString(params.status);
  const categoryParam = asString(params.category);
  const query: FormLibraryQuery = {
    q: asString(params.q),
    region: asString(params.region),
    // An unknown value in the URL is ignored, not treated as "matches nothing".
    status: isAdapterStatus(statusParam) ? statusParam : '',
    category: isSchemeCategory(categoryParam) ? categoryParam : '',
    view: asString(params.view) === 'list' ? 'list' : 'grid',
  };

  const catalog = await loadAdapterCatalog(supabase, session.organization.id);
  const adapters = filterAdapters(catalog, query);

  const regions = adapterRegions(catalog).map((value) => ({ value, label: value }));
  const statuses = ADAPTER_STATUSES.map((value) => ({
    value,
    label: t(`formLibrary.status.${value}`),
  }));
  const categories = adapterCategories(catalog).map((value) => ({
    value,
    label: localised(SCHEME_CATEGORY_LABELS[value], locale),
  }));

  const canCreateApplication = session.permissions.has('application.create');
  const canReport = session.permissions.has('formreport.create');

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e9f2fe] to-[#dbeafd]">
        {/*
         * The Parliament / tricolour artwork, right-aligned behind the report button. Decorative
         * only, and hidden below `md`, where the banner is no wider than its heading.
         *
         * Drawn wider than its box and pinned to the right edge, as on the schemes hub: the left
         * third of the source carries its own "FORM LIBRARY" caption in English, which would
         * clash with the translated heading, so it is cropped off and the seam faded out.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[600px] max-w-[60%] select-none overflow-hidden md:block"
        >
          <Image
            src="/form-library/form-library-banner-hero.png"
            alt=""
            width={1376}
            height={768}
            priority
            sizes="980px"
            className="absolute right-0 top-1/2 h-auto w-[980px] max-w-none -translate-y-[56%]"
          />
          <div className="absolute inset-y-0 left-0 w-44 bg-gradient-to-r from-[#e3eefd] to-transparent" />
        </div>

        <div className="relative flex min-h-[148px] flex-wrap items-center justify-between gap-6 px-6 py-7 sm:px-8">
          <div className="max-w-xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {t('formLibrary.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('formLibrary.subtitle')}</p>
          </div>
          {canReport ? <ReportFormModal /> : null}
        </div>
      </section>

      <FormLibraryFilters
        query={query}
        regions={regions}
        statuses={statuses}
        categories={categories}
      />

      {adapters.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <EmptyState title={t('formLibrary.empty')} />
        </div>
      ) : (
        <div className={query.view === 'list' ? 'grid gap-5' : 'grid gap-5 lg:grid-cols-2'}>
          {adapters.map((adapter) => (
            <FormLibraryCard
              key={adapter.id}
              adapter={adapter}
              t={t}
              layout={query.view}
              canCreateApplication={canCreateApplication}
            />
          ))}
        </div>
      )}
    </div>
  );
}
