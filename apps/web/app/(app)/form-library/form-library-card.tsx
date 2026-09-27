import Image from 'next/image';
import Link from 'next/link';
import {
  Archive,
  BadgeCheck,
  ChartNoAxesColumn,
  CircleCheck,
  CirclePlus,
  ExternalLink,
  FileText,
  FlaskConical,
  Landmark,
  Layers,
  MapPin,
  PencilLine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import type { AdapterStatus } from '@assistigo/form-engine';
import type { SchemeCategory } from '@assistigo/core';
import type { CatalogAdapter } from '@/lib/forms/adapters';
import {
  portalDisplayName,
  portalHost,
  portalLaunchUrl,
  portalLogoSrc,
} from '@/lib/forms/present';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const STATUS_STYLE: Record<AdapterStatus, { icon: LucideIcon; tone: string }> = {
  testing: { icon: FlaskConical, tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  active: { icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  draft: { icon: PencilLine, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  deprecated: { icon: Archive, tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

/** The soft wash in the card's top-right corner. Decorative; keyed on category so it is stable. */
const CATEGORY_WASH: Partial<Record<SchemeCategory, string>> = {
  certificate: 'from-orange-100/80',
  recruitment: 'from-brand-100/80',
  scholarship: 'from-amber-100/80',
  welfare: 'from-emerald-100/80',
  business_loan: 'from-violet-100/80',
};

const PRIMARY_ACTION =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY_ACTION =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const META_PILL =
  'inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-100';

export function FormLibraryCard({
  adapter,
  t,
  layout,
  canCreateApplication,
}: {
  adapter: CatalogAdapter;
  t: Translate;
  layout: 'grid' | 'list';
  canCreateApplication: boolean;
}) {
  const name = portalDisplayName(adapter.portalName);
  const host = portalHost(adapter);
  const launchUrl = portalLaunchUrl(adapter);
  const logoSrc = portalLogoSrc(adapter.slug);
  const status = STATUS_STYLE[adapter.status];
  const StatusIcon = status.icon;
  const fieldCount = adapter.fields.length;
  const documentCount = adapter.documentRequirements.length;

  const createHref = adapter.persisted
    ? `/applications/new?portalAdapterId=${adapter.id}`
    : `/applications/new?portalName=${encodeURIComponent(adapter.portalName)}&formName=${encodeURIComponent(adapter.formName)}`;

  return (
    <article
      className={cn(
        'relative flex overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6',
        layout === 'grid' ? 'flex-col' : 'flex-col gap-5 lg:flex-row lg:items-center',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-44 w-2/3 bg-gradient-to-bl to-transparent',
          (adapter.category && CATEGORY_WASH[adapter.category]) ?? 'from-slate-100/80',
        )}
      />

      <div className="relative min-w-0 flex-1">
        <div className="flex items-start gap-4">
          {logoSrc ? (
            // Decorative: the heading beside it names the portal.
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 sm:h-20 sm:w-20">
              <Image src={logoSrc} alt="" fill sizes="80px" className="object-contain p-1.5" />
            </span>
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 sm:h-20 sm:w-20"
            >
              <Landmark size={30} strokeWidth={1.6} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                <span className="min-w-0">{name}</span>
                {adapter.maintainedByPlatform ? (
                  <span title={t('formLibrary.maintainedByPlatform')} className="shrink-0">
                    <BadgeCheck
                      size={22}
                      strokeWidth={2}
                      aria-hidden
                      className="fill-emerald-500 text-white"
                    />
                    <span className="sr-only">{t('formLibrary.maintainedByPlatform')}</span>
                  </span>
                ) : null}
              </h2>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1',
                  status.tone,
                )}
              >
                <StatusIcon size={15} strokeWidth={2} aria-hidden />
                {t(`formLibrary.status.${adapter.status}`)}
              </span>
            </div>
            {host ? <p className="mt-0.5 truncate text-sm text-slate-500">{host}</p> : null}
            <p className="mt-2 line-clamp-2 text-sm text-slate-700 sm:text-[15px]">
              {adapter.formName}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {adapter.region ? (
                <span className={META_PILL}>
                  <MapPin size={16} strokeWidth={2} aria-hidden className="shrink-0 text-brand-600" />
                  {adapter.region}
                </span>
              ) : null}
              <span className={META_PILL}>
                <ChartNoAxesColumn
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden
                  className="shrink-0 text-brand-600"
                />
                <span className="min-w-0">
                  {t('formLibrary.healthLabel')}:{' '}
                  {adapter.health.successRate === null
                    ? t('formLibrary.healthUnknown')
                    : `${Math.round(adapter.health.successRate * 100)}%`}
                </span>
              </span>
            </div>

            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Layers size={18} strokeWidth={1.8} aria-hidden className="shrink-0 text-slate-500" />
              {t(fieldCount === 1 ? 'formLibrary.mappedFieldsOne' : 'formLibrary.mappedFields', {
                count: fieldCount,
              })}
              <span aria-hidden>·</span>
              {t(
                documentCount === 1 ? 'formLibrary.documentCountOne' : 'formLibrary.documentCount',
                { count: documentCount },
              )}
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'relative flex flex-wrap gap-3',
          // `mt-auto` keeps the buttons level across a row of cards of different heights.
          layout === 'grid' ? 'mt-auto pt-5 [&>*]:flex-1' : 'lg:w-56 lg:flex-col lg:[&>*]:w-full',
        )}
      >
        <Link href={`/form-library/${adapter.slug}`} className={PRIMARY_ACTION}>
          <FileText size={18} strokeWidth={1.8} aria-hidden />
          {t('formLibrary.viewSpecs')}
        </Link>
        {launchUrl ? (
          <a
            href={launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t('formLibrary.launchPortal')} — ${name}`}
            className={SECONDARY_ACTION}
          >
            <ExternalLink size={18} strokeWidth={1.8} aria-hidden />
            {t('formLibrary.launchPortal')}
          </a>
        ) : null}
        {canCreateApplication ? (
          <Link href={createHref} className={SECONDARY_ACTION}>
            <CirclePlus size={18} strokeWidth={1.8} aria-hidden />
            {t('formLibrary.createApplication')}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
