import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CircleCheck,
  FileText,
  Gift,
  GraduationCap,
  HeartHandshake,
  IndianRupee,
  Landmark,
  Map as MapIcon,
  MapPin,
  ShieldPlus,
  SquareArrowOutUpRight,
  Stethoscope,
  TriangleAlert,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@assistigo/ui';
import {
  EDUCATION_LEVEL_LABELS,
  SCHEME_CATEGORY_LABELS,
  SCHEME_DOCUMENTS,
  SCHEME_TRAIT_LABELS,
  formatIndianDate,
  formatInr,
  resolveSchemeLifecycle,
  stateLabel,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { REVERSE_MATCH_SCAN_LIMIT, findEligibleCustomers, loadScheme } from '@/lib/schemes/service';
import { resolveSchemeImages, schemeArtwork, type SchemeArtTag } from '@/lib/schemes/artwork';
import { CATEGORY_STYLE } from '../scheme-card';
import { EligibleCustomersPanel } from './eligible-customers-table';

export const metadata = { title: 'Scheme' };

const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

const PRIMARY_ACTION =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY_ACTION =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const TAG_STYLE: Record<SchemeArtTag, { icon: LucideIcon; tone: string }> = {
  health: { icon: Stethoscope, tone: 'text-sky-600' },
  familySupport: { icon: HeartHandshake, tone: 'text-indigo-600' },
  governmentScheme: { icon: Landmark, tone: 'text-violet-600' },
};

type Tone = 'sky' | 'orange' | 'emerald' | 'violet' | 'amber' | 'rose' | 'brand';

const TILE_TONES: Record<Tone, { tile: string; icon: string }> = {
  sky: { tile: 'bg-sky-50/80', icon: 'bg-sky-100 text-sky-600' },
  orange: { tile: 'bg-orange-50/80', icon: 'bg-orange-100 text-orange-600' },
  emerald: { tile: 'bg-emerald-50/80', icon: 'bg-emerald-100 text-emerald-600' },
  violet: { tile: 'bg-violet-50/80', icon: 'bg-violet-100 text-violet-600' },
  amber: { tile: 'bg-amber-50/80', icon: 'bg-amber-100 text-amber-600' },
  rose: { tile: 'bg-rose-50/80', icon: 'bg-rose-100 text-rose-600' },
  brand: { tile: 'bg-brand-50/80', icon: 'bg-brand-100 text-brand-600' },
};

export default async function SchemeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePagePermission('customer.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const scheme = await loadScheme(supabase, session.organization.id, slug);
  if (!scheme) notFound();

  const { matches, scanned, scanLimitReached } = await findEligibleCustomers(
    supabase,
    session.organization.id,
    scheme,
  );

  const { eligibility, schedule } = scheme;
  const allowedStates = eligibility.allowedStates ?? [];
  const lifecycle = resolveSchemeLifecycle(schedule);
  const art = schemeArtwork(scheme.slug);
  const category = CATEGORY_STYLE[scheme.category];
  const CategoryIcon = category.icon;
  const title = localised(scheme.title, locale);
  const where =
    allowedStates.length === 0
      ? t('schemes.allIndia')
      : allowedStates.map((code) => localised(stateLabel(code), locale)).join(', ');
  // Images uploaded in the admin panel outrank the bundled artwork, kind by kind.
  const images = resolveSchemeImages(scheme, art);
  const benefitKeys = art?.benefitKeys ?? [];

  const customers = matches.map((match) => ({
    id: match.id,
    customerCode: match.customerCode,
    fullName: match.fullName,
    mobile: match.mobile,
    status: match.result.status,
    ageAtCutoff: match.result.ageAtCutoff,
    missing: match.result.missingRequirements.map((requirement) =>
      requirement.kind === 'operator_confirmation'
        ? t('schemes.confirmTrait', { trait: localised(requirement.label, locale) })
        : localised(requirement.label, locale),
    ),
    pitch: match.result.pitch,
  }));

  return (
    <div className="space-y-5">
      <Link
        href="/schemes"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft size={16} strokeWidth={1.8} aria-hidden />
        {t('schemes.detail.back')}
      </Link>

      {/* ------------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-white via-[#f4f8fe] to-[#e7f0fd] shadow-sm">
        {images.banner ? (
          /*
           * Decorative. Pinned right and cropped to fill; the left edge is feathered into the
           * hero colour so an uploaded banner with a hard edge still blends in.
           */
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] select-none md:block"
          >
            <Image
              src={images.banner.src}
              alt=""
              fill
              priority
              unoptimized={images.banner.uploaded}
              sizes="(min-width: 1280px) 760px, 58vw"
              className="object-cover object-[65%_center]"
            />
            <div className="absolute inset-y-0 left-0 w-48 bg-gradient-to-r from-[#f4f8fe] to-transparent" />
          </div>
        ) : null}

        <div className="relative flex flex-wrap items-center gap-5 p-4 sm:p-5 lg:min-h-[176px] lg:flex-nowrap lg:pr-[300px]">
          <SchemeEmblem
            src={images.logo?.src ?? null}
            unoptimized={images.logo?.uploaded ?? false}
            fallback={
              <span
                className={cn(
                  'flex h-16 w-16 items-center justify-center rounded-full ring-1',
                  category.mark,
                )}
              >
                <CategoryIcon size={30} strokeWidth={1.8} />
              </span>
            }
          />

          <div className="min-w-0 flex-1 basis-72 lg:max-w-xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
                {title}
              </h1>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                  category.pill,
                )}
              >
                {localised(SCHEME_CATEGORY_LABELS[scheme.category], locale)}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-600 sm:text-[15px]">
              {localised(scheme.shortDescription, locale)}
            </p>

            <ul aria-label={t('schemes.detail.tagsLabel')} className="mt-3 flex flex-wrap gap-2">
              <HeroTag icon={MapPin} tone="text-rose-500" label={where} />
              {art?.tags.map((tag) => (
                <HeroTag
                  key={tag}
                  icon={TAG_STYLE[tag].icon}
                  tone={TAG_STYLE[tag].tone}
                  label={t(`schemes.detail.tags.${tag}`)}
                />
              ))}
            </ul>
          </div>

          {/* In the flow on small screens; floated over the banner from `lg`. */}
          <div className="flex w-full items-center gap-4 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm sm:w-auto lg:absolute lg:right-5 lg:top-5 lg:w-[264px]">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"
            >
              <ShieldPlus size={30} strokeWidth={1.8} />
            </span>
            {art ? (
              <p className="min-w-0 text-sm text-slate-600">
                {t(art.cover.eyebrowKey)}
                <span className="block text-2xl font-bold tracking-tight text-slate-900">
                  {formatInr(art.cover.amount)}
                </span>
                {t(art.cover.suffixKey)}
              </p>
            ) : (
              <p className="min-w-0 text-sm text-slate-600">
                {t('schemes.detail.benefitEyebrow')}
                <span className="block text-base font-bold leading-snug text-slate-900">
                  {localised(scheme.benefitHighlight, locale)}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ what the customer gets */}
      <section className={cn(CARD, 'p-5')}>
        <div
          className={cn(
            'grid items-center gap-6',
            images.illustration && benefitKeys.length > 0
              ? 'lg:grid-cols-[minmax(0,1fr)_176px_minmax(0,320px)]'
              : images.illustration
                ? 'lg:grid-cols-[minmax(0,1fr)_200px]'
                : benefitKeys.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]',
          )}
        >
          <div className="flex min-w-0 gap-4">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600"
            >
              <Gift size={24} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">{t('schemes.benefits')}</h2>
              <p className="mt-1 text-sm text-slate-600 sm:text-[15px]">
                {localised(scheme.benefitsSummary, locale)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={scheme.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('schemes.openPortal')} — ${scheme.portalName}`}
                  className={PRIMARY_ACTION}
                >
                  <SquareArrowOutUpRight size={17} strokeWidth={2} aria-hidden />
                  {t('schemes.openPortal')}
                </a>
                {scheme.officialNotificationUrl ? (
                  <a
                    href={scheme.officialNotificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={SECONDARY_ACTION}
                  >
                    <Bell size={17} strokeWidth={1.8} aria-hidden />
                    {t('schemes.officialNotification')}
                  </a>
                ) : null}
                {scheme.adapterSlug ? (
                  <Link href={`/form-library/${scheme.adapterSlug}`} className={SECONDARY_ACTION}>
                    <FileText size={17} strokeWidth={1.8} aria-hidden />
                    {t('schemes.viewFormSpecs')}
                  </Link>
                ) : null}
              </div>

              <ApplicationWindow lifecycleStatus={lifecycle.status} schedule={schedule} t={t} />
            </div>
          </div>

          {images.illustration ? (
            <div aria-hidden className="relative mx-auto hidden h-44 w-44 select-none lg:block">
              <Image
                src={images.illustration.src}
                alt=""
                fill
                sizes="176px"
                unoptimized={images.illustration.uploaded}
                // Decorative. Artwork often arrives as a JPEG on white: multiply drops the white
                // box into the card instead of leaving a visible square.
                className="object-contain mix-blend-multiply"
              />
            </div>
          ) : null}

          {benefitKeys.length > 0 ? (
            <ul
              aria-label={t('schemes.detail.benefitChecklist')}
              className="space-y-3 rounded-xl bg-emerald-50/70 p-4"
            >
              {benefitKeys.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CircleCheck
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                    className="mt-px shrink-0 fill-emerald-500 text-white"
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* ------------------------------------------------------------ eligibility */}
      <section className={cn(CARD, 'p-5')}>
        <div className="flex flex-col gap-5 md:flex-row">
          <div className="flex items-center gap-4 md:w-40 md:shrink-0 md:flex-col md:items-start">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm"
            >
              <UsersRound size={24} strokeWidth={1.8} />
            </span>
            <h2 className="text-lg font-semibold text-slate-900">
              {t('schemes.eligibilityBreakdown')}
            </h2>
          </div>

          <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Criterion icon={MapIcon} tone="sky" label={t('schemes.criteria.state')}>
              {where}
            </Criterion>

            {eligibility.minAge !== undefined || eligibility.maxAge !== undefined ? (
              <Criterion icon={UserRound} tone="brand" label={t('schemes.criteria.age')}>
                {t('schemes.ageRange', {
                  min: eligibility.minAge ?? 0,
                  max: eligibility.maxAge ?? 0,
                })}
                {eligibility.ageRelaxations ? (
                  <span className="mt-0.5 block text-xs font-normal text-emerald-700">
                    {Object.entries(eligibility.ageRelaxations)
                      .map(([key, years]) => `${key.toUpperCase()} +${years}`)
                      .join(' · ')}
                  </span>
                ) : null}
              </Criterion>
            ) : null}

            {eligibility.gender && eligibility.gender !== 'all' ? (
              <Criterion icon={Users} tone="rose" label={t('schemes.criteria.gender')}>
                {t(`schemes.gender.${eligibility.gender}`)}
              </Criterion>
            ) : null}

            {eligibility.allowedCategories?.length ? (
              <Criterion icon={BadgeCheck} tone="amber" label={t('schemes.criteria.category')}>
                {eligibility.allowedCategories.map((value) => value.toUpperCase()).join(', ')}
              </Criterion>
            ) : null}

            {eligibility.minEducationLevel ? (
              <Criterion icon={GraduationCap} tone="amber" label={t('schemes.criteria.education')}>
                {localised(EDUCATION_LEVEL_LABELS[eligibility.minEducationLevel], locale)}
                {eligibility.alsoAcceptsEducation?.length ? (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    {t('schemes.alsoAccepts', {
                      levels: eligibility.alsoAcceptsEducation
                        .map((level) => localised(EDUCATION_LEVEL_LABELS[level], locale))
                        .join(', '),
                    })}
                  </span>
                ) : null}
              </Criterion>
            ) : null}

            {eligibility.maxAnnualIncome !== undefined ? (
              <Criterion icon={Wallet} tone="rose" label={t('schemes.criteria.income')}>
                {t('schemes.incomeUpTo', {
                  amount: formatInr(eligibility.maxAnnualIncome) ?? '—',
                })}
              </Criterion>
            ) : null}

            {eligibility.requiredTraits?.length ? (
              <Criterion icon={Users} tone="orange" label={t('schemes.criteria.traits')}>
                {eligibility.requiredTraits
                  .map((trait) => localised(SCHEME_TRAIT_LABELS[trait], locale))
                  .join(', ')}
              </Criterion>
            ) : null}

            <Criterion icon={IndianRupee} tone="emerald" label={t('schemes.criteria.fee')}>
              {formatInr(scheme.estimatedOperatorFee) ?? '—'}
            </Criterion>

            {eligibility.requiredDocuments?.length ? (
              <Criterion icon={FileText} tone="violet" label={t('schemes.criteria.documents')}>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {eligibility.requiredDocuments.map((key) => (
                    <li
                      key={key}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700"
                    >
                      {localised(SCHEME_DOCUMENTS[key].label, locale)}
                    </li>
                  ))}
                </ul>
              </Criterion>
            ) : null}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------- eligible customers */}
      <EligibleCustomersPanel
        customers={customers}
        canCreateCustomer={session.permissions.has('customer.create')}
        canStartApplication={session.permissions.has('application.create')}
        notice={
          lifecycle.status === 'upcoming' ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {t('schemes.outreachUpcoming', { days: lifecycle.daysUntilOpen ?? 0 })}
            </p>
          ) : null
        }
        footnote={
          scanLimitReached ? (
            <p className="text-xs text-amber-700">
              {t('schemes.scanLimit', { scanned, limit: REVERSE_MATCH_SCAN_LIMIT })}
            </p>
          ) : null
        }
      />
    </div>
  );
}

/** The square emblem at the left of the hero. Decorative — the title beside it names the scheme. */
function SchemeEmblem({
  src,
  unoptimized,
  fallback,
}: {
  src: string | null;
  /** The signed-in logo route must be fetched with the user's cookies, not by the optimiser. */
  unoptimized: boolean;
  fallback: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 sm:h-36 sm:w-36"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="144px"
          unoptimized={unoptimized}
          className="object-contain p-2"
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function HeroTag({ icon: Icon, tone, label }: { icon: LucideIcon; tone: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
      <Icon size={14} strokeWidth={2} aria-hidden className={cn('shrink-0', tone)} />
      {label}
    </li>
  );
}

function Criterion({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  children: React.ReactNode;
}) {
  const style = TILE_TONES[tone];
  return (
    <div className={cn('flex items-center gap-3 rounded-xl p-4', style.tile)}>
      <span
        aria-hidden
        className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', style.icon)}
      >
        <Icon size={24} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-[15px] font-semibold text-slate-900">{children}</dd>
      </div>
    </div>
  );
}

/**
 * The window line under the actions. An evergreen scheme needs one quiet pill; anything with a
 * cycle keeps the full dates and the lapsed warning, which must never be dropped for looks.
 */
function ApplicationWindow({
  lifecycleStatus,
  schedule,
  t,
}: {
  lifecycleStatus: ReturnType<typeof resolveSchemeLifecycle>['status'];
  schedule: {
    isAlwaysOpen: boolean;
    applicationStartDate: string | null;
    applicationEndDate: string | null;
    examDate: string | null;
  };
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (schedule.isAlwaysOpen) {
    return (
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CalendarCheck size={14} strokeWidth={2} aria-hidden />
        {t('schemes.alwaysOpen')}
      </p>
    );
  }

  const hasDates =
    schedule.applicationStartDate || schedule.applicationEndDate || schedule.examDate;

  return (
    <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-700">
        {t(`schemes.lifecycleStatus.${lifecycleStatus}`)}
      </p>
      {hasDates ? (
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          <WindowDate label={t('schemes.opensOn')} value={schedule.applicationStartDate} />
          <WindowDate label={t('schemes.closesOn')} value={schedule.applicationEndDate} />
          <WindowDate label={t('schemes.examOn')} value={schedule.examDate} />
        </dl>
      ) : (
        // No dates and not evergreen: say so, rather than implying the form is open.
        <p className="mt-1 text-xs text-slate-500">{t('schemes.cyclical')}</p>
      )}
      {lifecycleStatus === 'closed' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden />
          {t('schemes.windowClosed')}
        </p>
      ) : null}
    </div>
  );
}

function WindowDate({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <dt className="font-medium text-slate-500">{label}:</dt>
      <dd>{formatIndianDate(value)}</dd>
    </div>
  );
}
