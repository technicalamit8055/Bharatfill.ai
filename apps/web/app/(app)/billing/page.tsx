import Image from 'next/image';
import {
  CalendarCheck,
  CalendarDays,
  Clock,
  Crown,
  Database,
  FileText,
  Info,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { buildUsageSummary, resolvePlan } from '@assistigo/core';
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised, type Translator } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import { loadPlanCatalogue } from '@/lib/billing/plans';
import { currentUsagePeriod, usagePercent } from '@/lib/billing/view';
import type { SubscriptionRow } from '@/lib/supabase/database.types';
import { PlanComparison } from './plan-comparison';
import { SectionHeader } from './section-header';

export const metadata = { title: 'Billing' };

const SUBSCRIPTION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  cancelled: 'neutral',
  incomplete: 'danger',
};

type UsageTone = 'brand' | 'violet' | 'emerald' | 'orange' | 'rose';

/** How each usage meter is labelled and coloured. Keyed by `buildUsageSummary`'s item keys. */
const USAGE_METERS: Record<string, { labelKey: string; icon: LucideIcon; tone: UsageTone }> = {
  fill: { labelKey: 'billing.fills', icon: FileText, tone: 'brand' },
  ai_extraction: { labelKey: 'billing.aiExtractions', icon: Sparkles, tone: 'violet' },
  seat: { labelKey: 'billing.seats', icon: Users, tone: 'emerald' },
  customers: { labelKey: 'billing.customers', icon: UsersRound, tone: 'orange' },
  storage_mb: { labelKey: 'billing.storageMb', icon: Database, tone: 'rose' },
};

const USAGE_TONES: Record<UsageTone, { icon: string; bar: string }> = {
  brand: { icon: 'bg-brand-50 text-brand-600', bar: 'bg-brand-600' },
  violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-600' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  orange: { icon: 'bg-orange-50 text-orange-500', bar: 'bg-orange-500' },
  rose: { icon: 'bg-rose-50 text-rose-500', bar: 'bg-rose-500' },
};

/** At or past this share of a limit the bar turns amber, whatever the meter's own colour. */
const NEAR_LIMIT_PERCENT = 90;

const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

function usageValue(used: number, included: number | null, t: Translator) {
  if (included === null) return `${used} / ${t('billing.unlimited')}`;
  return `${used} / ${included}`;
}

/**
 * Billing (spec §22): the organization's plan, this month's usage against it, the plan
 * catalogue, and its subscription history.
 *
 * Plan limits are enforced server-side by the entitlement checks — the meters here only report
 * them. Every read is scoped to the caller's organization and again by RLS, and nothing on the
 * page is customer data: only counts.
 */
export default async function BillingPage() {
  const session = await requirePagePermission('billing.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const [entitlements, catalogue, { data: subscription }] = await Promise.all([
    loadEntitlementContext({ supabase, organization: session.organization }),
    loadPlanCatalogue(supabase),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', session.organization.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const usage = buildUsageSummary(entitlements);
  const activeSubscription = subscription as SubscriptionRow | null;
  const canManage = session.permissions.has('billing.manage');
  const planName = localised(usage.planName, locale);
  const planPrice = resolvePlan(entitlements).priceMonthlyInr;

  // The window `loadEntitlementContext` counts over, shown in the reader's language.
  const period = currentUsagePeriod(new Date());
  const periodFormat = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const periodLabel = `${periodFormat.format(new Date(period.start))} – ${periodFormat.format(new Date(period.end))}`;

  return (
    <div className="space-y-5">
      <section className="relative min-h-[150px] overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e7f1fe] via-[#f1f7ff] to-white px-6 py-7 sm:px-8">
        {/*
         * The invoice / rupee / calendar artwork. Decorative, and hidden below `md`, where the
         * banner is no wider than its own heading.
         *
         * The source is a 16:9 frame whose left half is a flat blue wash, so it is drawn taller
         * than the banner, pinned right, and faded at both edges: only the illustration shows,
         * and it melts into the banner's gradient instead of ending in a hard seam.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_30%,black_85%,transparent_100%)] md:block lg:right-[200px] lg:w-[320px]"
        >
          <Image
            src="/billing/billing-banner-hero.png"
            alt=""
            width={1376}
            height={768}
            priority
            sizes="420px"
            className="absolute right-0 top-1/2 h-[140%] w-auto max-w-none -translate-y-1/2"
          />
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('billing.title')}</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('billing.subtitle')}</p>
        </div>

        <div className="absolute right-6 top-6 hidden items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/90 px-4 py-3 shadow-sm backdrop-blur lg:flex">
          <ShieldCheck
            className="h-8 w-8 shrink-0 fill-emerald-600 text-white"
            strokeWidth={1.8}
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              {t('billing.securePayments.title')}
            </p>
            <p className="text-xs text-emerald-700">{t('billing.securePayments.body')}</p>
          </div>
        </div>
      </section>

      <section className={`${CARD} flex flex-wrap items-center gap-5 p-5 sm:p-6`}>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Crown className="h-8 w-8 fill-brand-600" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{t('billing.currentPlan')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold text-slate-900">{planName}</span>
            {activeSubscription ? (
              <Badge
                tone={SUBSCRIPTION_TONE[activeSubscription.status] ?? 'neutral'}
                className="px-3 py-1 text-sm"
              >
                {t(`billing.status.${activeSubscription.status}`)}
              </Badge>
            ) : null}
          </div>
          {activeSubscription?.current_period_end ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('billing.renewsOn', { date: activeSubscription.current_period_end.slice(0, 10) })}
              {activeSubscription.cancel_at_period_end
                ? ` · ${t('billing.cancelledAtPeriodEnd')}`
                : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:border-l sm:border-slate-200 sm:pl-5">
          <a
            href="#invoices"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <FileText className="h-4 w-4" aria-hidden />
            {t('billing.viewInvoices')}
          </a>
          {canManage ? (
            <a
              href="#compare-plans"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Settings className="h-4 w-4" aria-hidden />
              {t('billing.managePlan')}
            </a>
          ) : null}
        </div>
      </section>

      <section className={`${CARD} p-5 sm:p-6`}>
        <SectionHeader
          icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
          title={t('billing.usage')}
          action={
            <span
              aria-label={`${t('billing.usagePeriod')}: ${periodLabel}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
            >
              <CalendarDays className="h-4 w-4 text-brand-600" aria-hidden />
              {periodLabel}
            </span>
          }
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {usage.items.map((item) => {
            const meter = USAGE_METERS[item.key];
            const Icon = meter?.icon ?? FileText;
            const tone = USAGE_TONES[meter?.tone ?? 'brand'];
            const label = t(meter?.labelKey ?? item.key);
            const pct = usagePercent(item.ratio);
            return (
              <div key={item.key} className="rounded-xl bg-slate-50/70 p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold tabular-nums text-slate-900">
                      {usageValue(item.used, item.included, t)}
                    </p>
                    <p className="truncate text-sm text-slate-500">{label}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-label={t('billing.usedPercent', { item: label, percent: pct })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70"
                  >
                    <div
                      className={`h-full rounded-full ${pct >= NEAR_LIMIT_PERCENT ? 'bg-amber-500' : tone.bar}`}
                      // A sliver even at 0%, so an empty meter still reads as a meter.
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                    {item.included === null ? '—' : `${pct}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="compare-plans" className={`${CARD} p-5 sm:p-6`}>
        <PlanComparison plans={catalogue} activePlanCode={usage.planCode} canManage={canManage} />
      </section>

      <section id="invoices" className={`${CARD} p-5 sm:p-6`}>
        <SectionHeader
          icon={<ReceiptText className="h-5 w-5" aria-hidden />}
          title={t('billing.invoices.title')}
        />
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          {!activeSubscription ? (
            <EmptyState title={t('billing.invoices.empty')} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="px-4">{t('billing.invoices.period')}</TH>
                  <TH className="px-4">{t('billing.invoices.plan')}</TH>
                  <TH className="px-4">{t('billing.invoices.status')}</TH>
                  <TH className="px-4">{t('billing.invoices.amount')}</TH>
                  <TH className="px-4">{t('billing.invoices.invoice')}</TH>
                </TR>
              </THead>
              <TBody>
                <TR>
                  <TD className="px-4 py-3 tabular-nums text-slate-700">
                    {activeSubscription.current_period_start?.slice(0, 10) ?? '—'} –{' '}
                    {activeSubscription.current_period_end?.slice(0, 10) ?? '—'}
                  </TD>
                  <TD className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Crown className="h-4 w-4 fill-brand-600 text-brand-600" aria-hidden />
                      {planName}
                    </span>
                  </TD>
                  <TD className="px-4 py-3">
                    <Badge tone={SUBSCRIPTION_TONE[activeSubscription.status] ?? 'neutral'}>
                      {t(`billing.status.${activeSubscription.status}`)}
                    </Badge>
                  </TD>
                  <TD className="px-4 py-3 tabular-nums">₹{planPrice}</TD>
                  <TD className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Clock className="h-4 w-4" aria-hidden />
                      {t('billing.invoices.download')}
                    </span>
                  </TD>
                </TR>
              </TBody>
            </Table>
          )}
        </div>
      </section>

      <section className={`${CARD} flex flex-wrap items-center gap-4 p-5 sm:px-6`}>
        <Info className="h-7 w-7 shrink-0 text-brand-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{t('billing.indiaNote.title')}</h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{t('billing.indiaNote.body')}</p>
        </div>
        {/*
         * The logos sit in a thin band across the middle of a 16:9 canvas, so the image is
         * drawn into a box of that band's proportions with `object-cover`, trimming the
         * empty margin above and below.
         */}
        <div className="relative h-11 w-full max-w-[300px] shrink-0 sm:w-[300px]">
          <Image
            src="/billing/payment-methods-strip.png"
            alt={t('billing.indiaNote.methodsAlt')}
            fill
            sizes="300px"
            className="object-cover"
          />
        </div>
      </section>
    </div>
  );
}
