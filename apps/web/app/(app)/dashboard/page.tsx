import { Alert } from '@assistigo/ui';
import { OPEN_STATUSES, formatIndianDate, maskMobile } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { isProduction } from '@/lib/env';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { filterSchemes, loadSchemeCatalog, type SchemeListing } from '@/lib/schemes/service';
import {
  bucketByIstDay,
  greetingFirstName,
  greetingKey,
  istDayKeys,
  istHour,
  trendFrom,
} from '@/lib/dashboard/metrics';
import type { ApplicationRow, CustomerRow, DashboardSummary } from '@/lib/supabase/database.types';
import { OnboardingChecklist } from './onboarding-checklist';
import { DashboardHero } from './dashboard-hero';
import { DocumentDropQueue } from './document-drop-queue';
import { PowerToolsLauncher } from './power-tools-launcher';
import { StatCard, type StatTrend } from './stat-card';
import { RecentCustomersCard, type RecentCustomerView } from './recent-customers-card';
import {
  ApplicationsPipelineCard,
  type PipelineApplicationView,
} from './applications-pipeline-card';
import { SchemesOpportunityRadar } from './schemes-opportunity-radar';
import { ActivityChart } from './activity-chart';
import { AttentionStrip } from './attention-strip';
import { ProductivityWidget } from './productivity-widget';

export const metadata = { title: 'Home' };

const EMPTY_SUMMARY: DashboardSummary = {
  fillsToday: 0,
  customersServedToday: 0,
  customersTotal: 0,
  documentsProcessedToday: 0,
  applicationsOpen: 0,
  reviewsPending: 0,
  fieldsFilledThisMonth: 0,
};

/** The sparkline window. Seven days covers a full week including the quiet one. */
const TREND_DAYS = 7;

/**
 * How far back the trend queries reach. A day of slack on top of the window so a row written
 * just before IST midnight is still inside the range when the page renders just after it.
 */
const TREND_LOOKBACK_DAYS = TREND_DAYS + 1;

/** Enough to cover a busy week at a large centre without pulling an unbounded set. */
const TREND_ROW_LIMIT = 5000;

/** "Due soon" on the attention strip: open applications whose deadline falls within this window. */
const DUE_SOON_DAYS = 3;

/** Only the closing end of the catalogue belongs on the home screen. */
const RADAR_LIMIT = 4;

type TrendRow = { created_at: string };
type FillSessionTrendRow = TrendRow & { status: string; filled_fields_count: number | null };

type RecentCustomerRow = Pick<
  CustomerRow,
  'id' | 'customer_code' | 'full_name' | 'mobile' | 'verification_status' | 'created_at'
>;

type RecentApplicationRow = Pick<
  ApplicationRow,
  | 'id'
  | 'title'
  | 'status'
  | 'portal_name'
  | 'deadline_at'
  | 'amount_charged'
  | 'payment_status'
  | 'created_at'
> & { customers: { full_name: string } | null };

/**
 * The operator command centre (spec §7.3.1).
 *
 * Everything the counter needs before the first walk-in of the day loads in one pass: the day's
 * counters, the seven-day shape behind each of them, who came in recently, what is in flight,
 * and which government window shuts first. Each query is gated on the caller's permission as
 * well as by RLS — a viewer should not pay for an applications query they are not allowed to
 * read, and a role check that only hides a card is not a check at all (DEVELOPMENT_RULES §4).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { t, locale } = await getTranslations();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const organizationId = session.organization.id;
  const canViewCustomers = session.permissions.has('customer.view');
  const canViewApplications = session.permissions.has('application.view');
  const canViewDocuments = session.permissions.has('document.view');
  const canRunFills = session.permissions.has('fill.run');
  const canUploadDocuments = session.permissions.has('document.upload');

  const asOf = new Date();
  const since = new Date(asOf.getTime() - TREND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    summaryResult,
    customersResult,
    applicationsResult,
    fillTrendResult,
    customerTrendResult,
    documentTrendResult,
    catalog,
    dueSoonResult,
  ] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_organization_id: organizationId }),

    canViewCustomers
      ? supabase
          .from('customers')
          .select('id, customer_code, full_name, mobile, verification_status, created_at')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(6)
      : Promise.resolve({ data: null }),

    // Open statuses only: the card is titled "in flight", and an approved or cancelled
    // application appearing under that heading would be a lie the operator has to click to
    // discover. The full list, terminal rows included, is one link away.
    canViewApplications
      ? supabase
          .from('applications')
          .select(
            'id, title, status, portal_name, deadline_at, amount_charged, payment_status, created_at, customers(full_name)',
          )
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .in('status', OPEN_STATUSES)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    /*
     * The trend queries project timestamps and counters only — no customer id, no field value.
     * A seven-day shape is derivable from nothing more personal than "something happened at
     * 14:02", which is why this can sit on the home screen at all (docs/SECURITY.md §5).
     */
    supabase
      .from('fill_sessions')
      .select('created_at, status, filled_fields_count')
      .eq('organization_id', organizationId)
      .gte('created_at', since)
      .limit(TREND_ROW_LIMIT),

    canViewCustomers
      ? supabase
          .from('customers')
          .select('created_at')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .gte('created_at', since)
          .limit(TREND_ROW_LIMIT)
      : Promise.resolve({ data: null }),

    canViewDocuments
      ? supabase
          .from('document_extractions')
          .select('created_at')
          .eq('organization_id', organizationId)
          .in('status', ['completed', 'accepted', 'review_required'])
          .gte('created_at', since)
          .limit(TREND_ROW_LIMIT)
      : Promise.resolve({ data: null }),

    // Built-ins are the floor of this list even when the query fails, so the radar is never
    // empty for a reason the operator cannot see.
    canViewCustomers ? loadSchemeCatalog(supabase, organizationId) : Promise.resolve([]),

    /*
     * Open applications due within DUE_SOON_DAYS, overdue ones included (their deadline is also
     * before the cut-off). A head-only count: no rows, no names, cheap on every page load.
     */
    canViewApplications
      ? supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .in('status', OPEN_STATUSES)
          .lte(
            'deadline_at',
            new Date(asOf.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          )
      : Promise.resolve({ count: null }),
  ]);

  const summary: DashboardSummary = {
    ...EMPTY_SUMMARY,
    ...((summaryResult.data as DashboardSummary | null) ?? {}),
  };

  const fillRows = (fillTrendResult.data ?? []) as FillSessionTrendRow[];
  const filledRows = fillRows.filter((row) => row.status === 'filled');

  const fillsSeries = bucketByIstDay(filledRows, TREND_DAYS, asOf);
  const fieldsSeries = bucketByIstDay(
    fillRows,
    TREND_DAYS,
    asOf,
    (row) => row.filled_fields_count ?? 0,
  );
  const customersSeries = bucketByIstDay(
    (customerTrendResult.data ?? []) as TrendRow[],
    TREND_DAYS,
    asOf,
  );
  const documentsSeries = bucketByIstDay(
    (documentTrendResult.data ?? []) as TrendRow[],
    TREND_DAYS,
    asOf,
  );

  const recentCustomers: RecentCustomerView[] = (
    (customersResult.data ?? []) as RecentCustomerRow[]
  ).map((customer) => ({
    id: customer.id,
    customerCode: customer.customer_code,
    fullName: customer.full_name,
    mobile: customer.mobile,
    mobileMasked: maskMobile(customer.mobile),
    verificationStatus: customer.verification_status,
    createdOn: formatIndianDate(customer.created_at.slice(0, 10)),
  }));

  const recentApplications: PipelineApplicationView[] = (
    (applicationsResult.data ?? []) as unknown as RecentApplicationRow[]
  ).map((application) => ({
    id: application.id,
    title: application.title,
    status: application.status,
    portalName: application.portal_name,
    customerName: application.customers?.full_name ?? null,
    deadlineOn: application.deadline_at?.slice(0, 10) ?? null,
    amountCharged: application.amount_charged,
    paymentStatus: application.payment_status,
  }));

  // `filterSchemes` drops closed windows and sorts what shuts first to the top, so the radar is
  // the head of that list rather than a second opinion about urgency.
  const radarListings: SchemeListing[] = filterSchemes(catalog, { lifecycle: 'open' }, asOf).slice(
    0,
    RADAR_LIMIT,
  );

  const place = [session.organization.district, session.organization.state]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  /** Today against the mean of the six days before it, phrased once for every card that has one. */
  const trendFor = (series: readonly number[]): StatTrend | null => {
    const trend = trendFrom(series);
    if (!trend) return null;
    if (trend.deltaPercent === null) {
      return { label: t('dashboard.trendNoBaseline'), direction: trend.direction };
    }
    return {
      label: t('dashboard.trendVsAverage', { delta: Math.abs(trend.deltaPercent) }),
      direction: trend.direction,
    };
  };

  return (
    <div className="space-y-6">
      <DashboardHero
        operatorFirstName={greetingFirstName(session.displayName, session.email)}
        initialGreeting={t(greetingKey(istHour(asOf)))}
        organizationName={session.organization.name}
        place={place || null}
        canSearchCustomers={canViewCustomers}
        canCreateCustomer={session.permissions.has('customer.create')}
        canOpenDocumentDrop={canUploadDocuments}
        /* The simulator drops invented documents, so it is off wherever intake is real (§32.1). */
        simulatorEnabled={!isProduction()}
      />

      {params.denied ? <Alert tone="warning">{t('errors.permission_denied')}</Alert> : null}

      <AttentionStrip
        reviewsPending={canViewDocuments ? summary.reviewsPending : null}
        applicationsDueSoon={canViewApplications ? (dueSoonResult.count ?? null) : null}
        t={t}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('dashboard.fillsToday')}
          value={summary.fillsToday}
          href={canRunFills ? '/fill-sessions' : undefined}
          series={fillsSeries}
          seriesLabel={t('dashboard.lastSevenDays')}
          trend={trendFor(fillsSeries)}
        />
        <StatCard
          label={t('dashboard.customersServed')}
          value={summary.customersServedToday}
          href={canViewCustomers ? '/customers' : undefined}
          series={canViewCustomers ? customersSeries : undefined}
          seriesLabel={t('dashboard.newCustomersSevenDays')}
          hint={t('dashboard.customersTotalHint', { total: summary.customersTotal })}
        />
        <StatCard
          label={t('dashboard.documentsProcessed')}
          value={summary.documentsProcessedToday}
          href={canViewDocuments ? '/documents' : undefined}
          series={canViewDocuments ? documentsSeries : undefined}
          seriesLabel={t('dashboard.lastSevenDays')}
          trend={canViewDocuments ? trendFor(documentsSeries) : null}
        />
        <StatCard
          label={t('dashboard.applicationsOpen')}
          value={summary.applicationsOpen}
          href={canViewApplications ? '/applications?filter=open' : undefined}
          hint={t('dashboard.applicationsOpenHint')}
        />
        <StatCard
          label={t('dashboard.reviewsPending')}
          value={summary.reviewsPending}
          attention={summary.reviewsPending > 0}
          href={canViewDocuments ? '/documents' : undefined}
          hint={t(
            summary.reviewsPending > 0
              ? 'dashboard.reviewsPendingHint'
              : 'dashboard.reviewsClearHint',
          )}
        />
      </div>

      <PowerToolsLauncher permissions={session.permissions} t={t} />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <ActivityChart
            dayKeys={istDayKeys(TREND_DAYS, asOf)}
            series={{
              fills: fillsSeries,
              fields: fieldsSeries,
              customers: canViewCustomers ? customersSeries : undefined,
              documents: canViewDocuments ? documentsSeries : undefined,
            }}
          />

          {canViewCustomers ? (
            <RecentCustomersCard
              customers={recentCustomers}
              canCreate={session.permissions.has('customer.create')}
              canReveal={session.permissions.has('customer.reveal_sensitive')}
              canUploadDocument={session.permissions.has('document.upload')}
              canCreateApplication={session.permissions.has('application.create')}
            />
          ) : null}

          {canViewApplications ? (
            <ApplicationsPipelineCard
              applications={recentApplications}
              canCreate={session.permissions.has('application.create')}
              locale={locale}
              t={t}
            />
          ) : null}
        </div>

        <div className="space-y-5">
          {/*
           * First in the sidebar, above the checklist: when somebody is standing at the counter
           * having just sent their Aadhaar, that is the most time-critical thing on this screen.
           * Rendered for anyone who can see documents — a viewer should be able to tell an
           * operator that a walk-in is waiting, even though only an operator can claim it.
           */}
          {canViewDocuments ? (
            <DocumentDropQueue
              canIntake={canUploadDocuments}
              canDiscard={session.permissions.has('document.delete')}
              canPreview={session.permissions.has('document.download')}
              canPickRoaming={session.permissions.has('customer.roaming_link')}
            />
          ) : null}

          <OnboardingChecklist
            hasCustomers={summary.customersTotal > 0}
            hasDocuments={summary.documentsProcessedToday > 0}
          />

          <ProductivityWidget
            fieldsFilledThisMonth={summary.fieldsFilledThisMonth}
            fieldsSeries={fieldsSeries}
            t={t}
          />

          {canViewCustomers ? (
            <SchemesOpportunityRadar listings={radarListings} locale={locale} t={t} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
