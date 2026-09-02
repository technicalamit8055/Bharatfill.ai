import Link from 'next/link';
import { Badge, Button, Card, EmptyState, type Tone } from '@assistigo/ui';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  SCHEME_CATEGORIES,
  SCHEME_CATEGORY_LABELS,
  formatInr,
  isIndianStateCode,
  stateLabel,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised, type Locale } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  SCHEME_LIFECYCLE_FILTERS,
  filterSchemes,
  isLifecycleFilter,
  loadSchemeCatalog,
  schemeStateOptions,
  type SchemeListing,
} from '@/lib/schemes/service';
import { SchemesFilters } from './schemes-filters';

export const metadata = { title: 'Schemes & vacancies' };

const CATEGORY_TONE: Record<string, Tone> = {
  recruitment: 'info',
  welfare: 'success',
  scholarship: 'warning',
  certificate: 'neutral',
  business_loan: 'neutral',
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The Live & Upcoming Scheme Hub.
 *
 * Gated on `customer.view` rather than on a new permission: the page's real value is the reverse
 * audience matcher on each scheme's detail page, which reads the centre's customer list. Anyone
 * who cannot see customers has no use for it, and giving it a laxer gate than the data it leads
 * to would be a hole.
 *
 * Lifecycle is resolved once, in `filterSchemes`, against a single `asOfDate`. Every badge and
 * the sort order read from that one evaluation, so a page rendered across midnight cannot show a
 * countdown that disagrees with the order it sorted in.
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
  const query = {
    q: asString(params.q),
    category: asString(params.category),
    state: asString(params.state),
    education: asString(params.education),
    lifecycle: isLifecycleFilter(lifecycleParam) ? lifecycleParam : 'all',
  };

  const catalog = await loadSchemeCatalog(supabase, session.organization.id);
  const listings = filterSchemes(catalog, {
    q: query.q,
    category: query.category,
    state: query.state,
    education: query.education,
    lifecycle: query.lifecycle,
  });

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
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('schemes.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('schemes.subtitle')}</p>
      </div>

      <SchemesFilters
        query={query}
        categories={categories}
        states={states}
        educationLevels={educationLevels}
        lifecycleTabs={lifecycleTabs}
      />

      {listings.length === 0 ? (
        <Card>
          <EmptyState
            title={t('schemes.hubEmpty')}
            description={t(
              query.lifecycle === 'upcoming' ? 'schemes.hubEmptyUpcoming' : 'schemes.hubEmptyHelp',
            )}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <SchemeCard key={listing.scheme.slug} listing={listing} locale={locale} t={t} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">{t('schemes.verifyNotice')}</p>
    </div>
  );
}

/** The same honesty rule as the customer widget: no countdown until somebody entered a date. */
function LifecycleBadge({ listing, t }: { listing: SchemeListing; t: Translate }) {
  const closingLabel = (days: number): string =>
    days === 0
      ? t('schemes.closesToday')
      : t(days === 1 ? 'schemes.closesInDay' : 'schemes.closesInDays', { days });

  switch (listing.status) {
    case 'closing_soon': {
      const days = listing.daysRemaining ?? 0;
      return <Badge tone={days <= 3 ? 'danger' : 'warning'}>{closingLabel(days)}</Badge>;
    }
    case 'upcoming': {
      const days = listing.daysUntilOpen ?? 0;
      return (
        <Badge tone="info">
          {t(days === 1 ? 'schemes.opensInDay' : 'schemes.opensInDays', { days })}
        </Badge>
      );
    }
    case 'evergreen':
      return <Badge tone="neutral">{t('schemes.openAllYear')}</Badge>;
    case 'active':
      return listing.daysRemaining === null ? (
        <Badge tone="neutral">{t('schemes.windowUnconfirmed')}</Badge>
      ) : (
        <Badge tone="info">{closingLabel(listing.daysRemaining)}</Badge>
      );
    default:
      return null;
  }
}

function SchemeCard({
  listing,
  locale,
  t,
}: {
  listing: SchemeListing;
  locale: Locale;
  t: Translate;
}) {
  const { scheme } = listing;
  const allowedStates = scheme.eligibility.allowedStates ?? [];
  const minEducation = scheme.eligibility.minEducationLevel;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-sm font-semibold text-slate-900">
          {localised(scheme.title, locale)}
        </h2>
        <Badge tone={CATEGORY_TONE[scheme.category] ?? 'neutral'}>
          {localised(SCHEME_CATEGORY_LABELS[scheme.category], locale)}
        </Badge>
      </div>

      <p className="mt-1.5 text-xs text-slate-500">{localised(scheme.shortDescription, locale)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <LifecycleBadge listing={listing} t={t} />
        <Badge tone="success">{localised(scheme.benefitHighlight, locale)}</Badge>
        {allowedStates.length === 0 ? (
          <Badge tone="neutral">{t('schemes.allIndia')}</Badge>
        ) : (
          allowedStates.map((code) => (
            <Badge key={code} tone="neutral">
              {localised(stateLabel(code), locale)}
            </Badge>
          ))
        )}
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        {scheme.eligibility.minAge !== undefined || scheme.eligibility.maxAge !== undefined ? (
          <div className="flex gap-1.5">
            <dt className="font-medium text-slate-600">{t('schemes.criteria.age')}:</dt>
            <dd>
              {scheme.eligibility.minAge ?? '—'}–{scheme.eligibility.maxAge ?? '—'}
            </dd>
          </div>
        ) : null}
        {minEducation ? (
          <div className="flex gap-1.5">
            <dt className="font-medium text-slate-600">{t('schemes.criteria.education')}:</dt>
            <dd>{localised(EDUCATION_LEVEL_LABELS[minEducation], locale)}</dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="font-medium text-slate-600">{t('schemes.criteria.fee')}:</dt>
          <dd>{formatInr(scheme.estimatedOperatorFee) ?? '—'}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/schemes/${scheme.slug}`}>
          <Button size="sm" variant="secondary">
            {t('schemes.findCustomers')}
          </Button>
        </Link>
        <a href={scheme.portalUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost">
            {t('schemes.openPortal')}
          </Button>
        </a>
      </div>
    </Card>
  );
}
