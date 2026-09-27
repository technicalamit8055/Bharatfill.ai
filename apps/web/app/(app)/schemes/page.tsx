import Image from 'next/image';
import { FileText, GraduationCap, Landmark, UserRound, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@assistigo/ui';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  SCHEME_CATEGORIES,
  SCHEME_CATEGORY_LABELS,
  isIndianStateCode,
  stateLabel,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  SCHEME_LIFECYCLE_FILTERS,
  SCHEME_SORTS,
  countByLifecycle,
  filterSchemes,
  isLifecycleFilter,
  isSchemeSort,
  listingsForLifecycle,
  loadSchemeCatalog,
  schemeStateOptions,
  sortListings,
} from '@/lib/schemes/service';
import { SchemeCard } from './scheme-card';
import { SchemesFilters } from './schemes-filters';

export const metadata = { title: 'Schemes & vacancies' };

/**
 * The banner's "what is in here" card. A legend, not a filter: "Government Schemes" and
 * "Sarkari Yojana" are the same idea in two registers, and neither maps onto one catalogue
 * category, so linking them would send an operator to a list that does not match the label.
 */
const HERO_CATEGORIES: { key: string; icon: LucideIcon; tone: string }[] = [
  { key: 'governmentSchemes', icon: Landmark, tone: 'bg-violet-100 text-violet-700' },
  { key: 'scholarships', icon: GraduationCap, tone: 'bg-rose-100 text-rose-600' },
  { key: 'recruitment', icon: UserRound, tone: 'bg-brand-100 text-brand-700' },
  { key: 'sarkariYojana', icon: FileText, tone: 'bg-emerald-100 text-emerald-700' },
];

/**
 * The Live & Upcoming Scheme Hub.
 *
 * Gated on `customer.view` rather than on a new permission: the page's real value is the reverse
 * audience matcher on each scheme's detail page, which reads the centre's customer list. Anyone
 * who cannot see customers has no use for it, and giving it a laxer gate than the data it leads
 * to would be a hole.
 *
 * Lifecycle is resolved once, in `filterSchemes`, against a single `asOfDate`. The tab counts,
 * every badge and the grid all read from that one evaluation, so a page rendered across midnight
 * cannot show a count or a countdown that disagrees with the list below it.
 */
export default async function SchemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('customer.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const asString = (value: string | string[] | undefined): string =>
    typeof value === 'string' ? value : '';

  const lifecycleParam = asString(params.lifecycle);
  const sortParam = asString(params.sort);
  const query = {
    q: asString(params.q),
    category: asString(params.category),
    state: asString(params.state),
    education: asString(params.education),
    lifecycle: isLifecycleFilter(lifecycleParam) ? lifecycleParam : 'all',
    sort: isSchemeSort(sortParam) ? sortParam : 'deadline',
    view: asString(params.view) === 'list' ? 'list' : 'grid',
  } as const;

  const catalog = await loadSchemeCatalog(supabase, session.organization.id);
  // Every other filter applies to the counts; only the lifecycle tab itself does not, so each
  // tab can say how many schemes it would show.
  const allOpen = filterSchemes(catalog, {
    q: query.q,
    category: query.category,
    state: query.state,
    education: query.education,
    lifecycle: 'all',
  });
  const counts = countByLifecycle(allOpen);
  const listings = sortListings(listingsForLifecycle(allOpen, query.lifecycle), query.sort, locale);

  const categories = SCHEME_CATEGORIES.map((value) => ({
    value,
    label: localised(SCHEME_CATEGORY_LABELS[value], locale),
  }));
  const states = schemeStateOptions(catalog)
    .filter(isIndianStateCode)
    .map((code) => ({ value: code, label: localised(stateLabel(code), locale) }));
  const educationLevels = EDUCATION_LEVELS.map((value) => ({
    value,
    label: localised(EDUCATION_LEVEL_LABELS[value], locale),
  }));
  const lifecycleTabs = SCHEME_LIFECYCLE_FILTERS.map((value) => ({
    value,
    label: t(`schemes.lifecycleFilter.${value}`),
    countLabel: t(counts[value] === 1 ? 'schemes.schemeCountOne' : 'schemes.schemeCount', {
      count: counts[value],
    }),
  }));
  const sortOptions = SCHEME_SORTS.map((value) => ({ value, label: t(`schemes.sort.${value}`) }));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e9f2fe] to-[#dbeafd]">
        {/*
         * The Parliament / tricolour / magnifier artwork, right-aligned behind the legend card.
         * Decorative only, and hidden below `md`, where the banner is no wider than its heading.
         *
         * Drawn wider than its box and pinned to the right edge instead of `object-cover`: the
         * left third of the source carries its own "Government Schemes" caption in English,
         * which would clash with the translated heading, so it is cropped off and the seam is
         * faded into the banner colour.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[560px] max-w-[62%] select-none overflow-hidden md:block"
        >
          <Image
            src="/schemes/schemes-banner-hero.png"
            alt=""
            width={1376}
            height={768}
            priority
            sizes="920px"
            className="absolute right-0 top-1/2 h-auto w-[920px] max-w-none -translate-y-[53%]"
          />
          <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-[#e3eefd] to-transparent" />
        </div>

        <div className="relative flex min-h-[168px] items-center justify-between gap-6 px-6 py-7 sm:px-8">
          <div className="max-w-md xl:max-w-xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {t('schemes.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('schemes.subtitle')}</p>
          </div>

          <ul
            aria-label={t('schemes.heroCategoriesLabel')}
            className="hidden w-52 shrink-0 space-y-1 rounded-xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur-sm xl:block"
          >
            {HERO_CATEGORIES.map(({ key, icon: Icon, tone }) => (
              <li
                key={key}
                className="flex items-center gap-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone}`}
                >
                  <Icon size={14} strokeWidth={2} />
                </span>
                {t(`schemes.heroCategories.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SchemesFilters
        query={query}
        categories={categories}
        states={states}
        educationLevels={educationLevels}
        lifecycleTabs={lifecycleTabs}
        sortOptions={sortOptions}
      />

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <EmptyState
            title={t('schemes.hubEmpty')}
            description={t(
              query.lifecycle === 'upcoming' ? 'schemes.hubEmptyUpcoming' : 'schemes.hubEmptyHelp',
            )}
          />
        </div>
      ) : (
        <div
          className={
            query.view === 'list' ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
          }
        >
          {listings.map((listing) => (
            <SchemeCard
              key={listing.scheme.slug}
              listing={listing}
              locale={locale}
              t={t}
              layout={query.view}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">{t('schemes.verifyNotice')}</p>
    </div>
  );
}
