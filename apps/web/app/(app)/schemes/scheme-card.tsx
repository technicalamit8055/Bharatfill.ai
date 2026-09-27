import Image from 'next/image';
import Link from 'next/link';
import {
  Briefcase,
  ExternalLink,
  FileText,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import {
  EDUCATION_LEVEL_LABELS,
  SCHEME_CATEGORY_LABELS,
  formatInr,
  stateLabel,
  type SchemeCategory,
} from '@assistigo/core';
import { localised, type Locale } from '@/lib/i18n';
import { schemeImageSrc } from '@/lib/schemes/logo';
import type { SchemeListing } from '@/lib/schemes/service';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * One look per category: the round mark on the left and the pill on the right.
 *
 * The mark is the fallback for a scheme with no logo uploaded in the admin panel — which is
 * every built-in until someone adds one. An icon rather than an emblem drawn from memory, which
 * would be a wrong crest on a page operators read aloud from.
 */
export const CATEGORY_STYLE: Record<
  SchemeCategory,
  { icon: LucideIcon; mark: string; pill: string }
> = {
  recruitment: {
    icon: Briefcase,
    mark: 'bg-brand-50 text-brand-700 ring-brand-100',
    pill: 'bg-brand-50 text-brand-700 ring-brand-100',
  },
  scholarship: {
    icon: GraduationCap,
    mark: 'bg-amber-50 text-amber-700 ring-amber-100',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  welfare: {
    icon: HeartHandshake,
    mark: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  certificate: {
    icon: FileText,
    mark: 'bg-violet-50 text-violet-700 ring-violet-100',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  business_loan: {
    icon: HandCoins,
    mark: 'bg-orange-50 text-orange-700 ring-orange-100',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
};

const PRIMARY_ACTION =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY_ACTION =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

/**
 * The window pill. Same honesty rule as the customer widget: no countdown until somebody entered
 * a date, so an undated scheme says "Window not confirmed" rather than guessing.
 */
function WindowPill({ listing, t }: { listing: SchemeListing; t: Translate }) {
  const closingLabel = (days: number): string =>
    days === 0
      ? t('schemes.closesToday')
      : t(days === 1 ? 'schemes.closesInDay' : 'schemes.closesInDays', { days });

  let label: string;
  let tone: string;
  switch (listing.status) {
    case 'closing_soon': {
      const days = listing.daysRemaining ?? 0;
      label = closingLabel(days);
      tone = days <= 3 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800';
      break;
    }
    case 'upcoming': {
      const days = listing.daysUntilOpen ?? 0;
      label = t(days === 1 ? 'schemes.opensInDay' : 'schemes.opensInDays', { days });
      tone = 'bg-brand-50 text-brand-700';
      break;
    }
    case 'evergreen':
      label = t('schemes.openAllYear');
      tone = 'bg-slate-100 text-slate-700';
      break;
    case 'active':
      label =
        listing.daysRemaining === null
          ? t('schemes.windowUnconfirmed')
          : closingLabel(listing.daysRemaining);
      tone =
        listing.daysRemaining === null
          ? 'bg-slate-100 text-slate-600'
          : 'bg-brand-50 text-brand-700';
      break;
    default:
      return null;
  }

  return (
    <span
      className={cn('inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium', tone)}
    >
      {label}
    </span>
  );
}

function ageRange(min: number | undefined, max: number | undefined, t: Translate): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return t('schemes.ageFrom', { min });
  if (max !== undefined) return `≤${max}`;
  return '—';
}

export function SchemeCard({
  listing,
  locale,
  t,
  layout,
}: {
  listing: SchemeListing;
  locale: Locale;
  t: Translate;
  layout: 'grid' | 'list';
}) {
  const { scheme } = listing;
  const { eligibility } = scheme;
  const style = CATEGORY_STYLE[scheme.category];
  const Icon = style.icon;
  const allowedStates = eligibility.allowedStates ?? [];
  const where =
    allowedStates.length === 0
      ? t('schemes.allIndia')
      : allowedStates.map((code) => localised(stateLabel(code), locale)).join(', ');
  const title = localised(scheme.title, locale);
  const fee = formatInr(scheme.estimatedOperatorFee) ?? '—';
  const logoSrc = schemeImageSrc(scheme.logoPath);

  return (
    <article
      className={cn(
        'flex rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        layout === 'grid' ? 'flex-col' : 'flex-col gap-4 md:flex-row md:items-center',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          {logoSrc ? (
            // Decorative: the title beside it already names the scheme. Unoptimised because the
            // image optimiser would fetch the signed-in logo route without the user's cookies.
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
              <Image src={logoSrc} alt="" fill unoptimized className="object-contain p-1" />
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1',
                style.mark,
              )}
            >
              <Icon size={22} strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-[15px] font-semibold leading-snug text-slate-900">
                {title}
              </h2>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1',
                  style.pill,
                )}
              >
                {localised(SCHEME_CATEGORY_LABELS[scheme.category], locale)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
              {localised(scheme.shortDescription, locale)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WindowPill listing={listing} t={t} />
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <ShieldCheck
              size={14}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-emerald-600"
            />
            {localised(scheme.benefitHighlight, locale)}
          </span>
        </div>

        <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <li className="flex min-w-0 items-center gap-1">
            <MapPin size={14} strokeWidth={2} aria-hidden className="shrink-0 text-rose-500" />
            <span className="truncate">{where}</span>
          </li>
          <li className="flex items-center gap-1 border-l border-slate-200 pl-3">
            <Users size={14} strokeWidth={1.8} aria-hidden className="shrink-0 text-slate-400" />
            {t('schemes.ageShort', { range: ageRange(eligibility.minAge, eligibility.maxAge, t) })}
          </li>
          {eligibility.minEducationLevel ? (
            <li className="flex items-center gap-1 border-l border-slate-200 pl-3">
              <GraduationCap
                size={14}
                strokeWidth={1.8}
                aria-label={t('schemes.criteria.education')}
                className="shrink-0 text-slate-400"
              />
              {localised(EDUCATION_LEVEL_LABELS[eligibility.minEducationLevel], locale)}
            </li>
          ) : null}
        </ul>

        <p className="mt-2 text-sm text-slate-600">
          {t('schemes.ourCharge')} <span className="font-semibold text-slate-900">{fee}</span>
        </p>
      </div>

      <div
        className={cn(
          'flex flex-wrap gap-2',
          // `mt-auto` keeps the buttons on one line across a row of cards of different heights.
          layout === 'grid' ? 'mt-auto pt-4' : 'md:w-64 md:flex-col md:[&>*]:w-full',
        )}
      >
        <Link
          href={`/schemes/${scheme.slug}`}
          className={cn(PRIMARY_ACTION, layout === 'grid' && 'flex-1')}
        >
          <Target size={15} strokeWidth={2} aria-hidden />
          {t('schemes.findCustomers')}
        </Link>
        <a
          href={scheme.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${t('schemes.openPortal')} — ${scheme.portalName}`}
          className={SECONDARY_ACTION}
        >
          {t('schemes.openPortal')}
          <ExternalLink size={14} strokeWidth={2} aria-hidden />
        </a>
      </div>
    </article>
  );
}
