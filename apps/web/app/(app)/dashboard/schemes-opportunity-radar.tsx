import Link from 'next/link';
import { Badge, Card, EmptyState, type Tone } from '@assistigo/ui';
import { SCHEME_CATEGORY_LABELS, formatInr, type SchemeLifecycleStatus } from '@assistigo/core';
import { localised, type Locale, type Translator } from '@/lib/i18n';
import type { SchemeListing } from '@/lib/schemes/service';
import { ArrowRightIcon, RadarIcon } from './icons';

const CATEGORY_TONE: Record<string, Tone> = {
  recruitment: 'info',
  welfare: 'success',
  scholarship: 'warning',
  certificate: 'neutral',
  business_loan: 'neutral',
};

/**
 * What is about to shut.
 *
 * The dashboard shows the closing end of the catalogue only — a countdown is the one thing on
 * the home screen that expires, and it is the reason an operator would call a customer today
 * rather than next week. Everything else lives on the hub.
 *
 * No countdown is invented: a window nobody has dated shows "date not confirmed" rather than a
 * guessed number of days (the same honesty rule the hub follows).
 */
export function SchemesOpportunityRadar({
  listings,
  locale,
  t,
}: {
  listings: SchemeListing[];
  locale: Locale;
  t: Translator;
}) {
  return (
    <Card
      className="animate-fade-in-up"
      title={t('dashboard.radarTitle')}
      description={t('dashboard.radarHint')}
      actions={
        <Link
          href="/schemes"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          {t('schemes.browseAll')}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {listings.length === 0 ? (
        <EmptyState title={t('dashboard.radarEmpty')} description={t('dashboard.radarEmptyHint')} />
      ) : (
        <ul className="space-y-2">
          {listings.map((listing) => (
            <li key={listing.scheme.slug}>
              <Link
                href={`/schemes/${listing.scheme.slug}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <RadarIcon className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {localised(listing.scheme.title, locale)}
                    </span>
                    <UrgencyBadge listing={listing} t={t} />
                  </span>

                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="success">
                      {localised(listing.scheme.benefitHighlight, locale)}
                    </Badge>
                    <Badge tone={CATEGORY_TONE[listing.scheme.category] ?? 'neutral'}>
                      {localised(SCHEME_CATEGORY_LABELS[listing.scheme.category], locale)}
                    </Badge>
                  </span>

                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span className="truncate">{listing.scheme.portalName}</span>
                    {listing.scheme.estimatedOperatorFee > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {t('schemes.feeLabel', {
                            amount: formatInr(listing.scheme.estimatedOperatorFee) ?? '—',
                          })}
                        </span>
                      </>
                    ) : null}
                  </span>

                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">
                    {t('schemes.findCustomers')}
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Reuses the hub's countdown vocabulary so the two screens never phrase a deadline differently. */
function UrgencyBadge({ listing, t }: { listing: SchemeListing; t: Translator }) {
  const closingLabel = (days: number): string =>
    days === 0
      ? t('schemes.closesToday')
      : t(days === 1 ? 'schemes.closesInDay' : 'schemes.closesInDays', { days });

  const status: SchemeLifecycleStatus = listing.status;

  switch (status) {
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
    case 'active':
      return listing.daysRemaining === null ? (
        <Badge tone="neutral">{t('schemes.windowUnconfirmed')}</Badge>
      ) : (
        <Badge tone="info">{closingLabel(listing.daysRemaining)}</Badge>
      );
    case 'evergreen':
      return <Badge tone="neutral">{t('schemes.openAllYear')}</Badge>;
    default:
      return null;
  }
}
