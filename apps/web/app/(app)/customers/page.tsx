import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR, type Tone } from '@assistigo/ui';
import {
  formatGrantRemaining,
  formatIndianDate,
  grantRemainingMs,
  maskLast4,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  bucketByIstMonth,
  istDayKey,
  istMonthStart,
  sparklineHeights,
} from '@/lib/dashboard/metrics';
import {
  ADDED_WINDOWS,
  PAGE_SIZES,
  VERIFIED_STATUSES,
  addedSince,
  isBihar,
  lastPage,
  listHref,
  monthGrowthPercent,
  pageRange,
  pageWindow,
  parseListParams,
  sharePercent,
  topState,
  type ListParams,
} from '@/lib/customers/list-view';
import { CustomerAvatar } from './customer-avatar';
import { CustomerSearchBox } from './customer-search-box';
import { CustomerStatCard } from './customer-stat-card';
import { FilterMenu } from './filter-menu';
import { RoamingLookup } from './roaming-lookup';
import { RowsPerPage } from './rows-per-page';
import {
  CustomersIcon,
  GrowthIcon,
  NewCustomerIcon,
  NextIcon,
  PlusIcon,
  PreviousIcon,
  RoamingIcon,
  StateIcon,
  VerifiedIcon,
  ViewIcon,
} from './icons';

export const metadata = { title: 'Customers' };

const NEW_CUSTOMER_LINK =
  'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const VERIFICATION_TONE: Record<string, Tone> = {
  unverified: 'neutral',
  extracted: 'info',
  operator_verified: 'success',
  customer_confirmed: 'success',
  expired: 'warning',
  rejected: 'warning',
};

/** How many months the "new this month" bars cover, the current one included. */
const MONTH_BARS = 6;

/**
 * Upper bound on the rows read for the monthly bars and the top-state tally. A centre past this
 * many customers gets the tally over its most recent ones — still the right answer to "where do
 * my customers come from", without pulling an unbounded set on every page load.
 */
const STATS_ROW_LIMIT = 5000;

/**
 * One row of the list: a customer registered here, or one from another centre (or the BharatDoc
 * app) that this centre has been given access to (migration 0044). A linked row carries only the
 * masked card — "Rahul K.", last four digits — and opens through the usual roaming access.
 */
type ListRow = {
  id: string;
  isLinked: boolean;
  /** Full name for an own customer; "Rahul K." for a linked one. */
  displayName: string;
  mobileLast4: string | null;
  district: string | null;
  verificationStatus: string;
  addedAt: string;
  /** Linked rows: the caller holds a live grant, and until when. */
  grantExpiresAt: string | null;
};

type CentreListRow = {
  customer_id: string;
  is_linked: boolean;
  full_name: string | null;
  given_name: string | null;
  family_initial: string | null;
  mobile_last4: string | null;
  district: string | null;
  verification_status: string;
  added_at: string;
  has_active_grant: boolean;
  grant_expires_at: string | null;
  total_count: number;
};

type OwnListRow = {
  id: string;
  full_name: string;
  mobile: string | null;
  current_district: string | null;
  permanent_district: string | null;
  verification_status: string;
  created_at: string;
};

/** Postgres / PostgREST: the function does not exist — the database has not run 0044. */
function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

type StateRow = { permanent_state: string | null; current_state: string | null };

/**
 * The customers list (spec §7.3.2): who is registered at this centre, how many are verified,
 * who joined this month and where they come from, then the searchable, filterable table.
 *
 * Every query is scoped to the caller's organization here and again by RLS. The table reads
 * only what it renders — the district line of an address, never the whole address — and the
 * mobile number is masked before it leaves the server.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('customer.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = parseListParams(await searchParams);

  const organizationId = session.organization.id;
  const canCreate = session.permissions.has('customer.create');
  const canLinkRoaming = session.permissions.has('customer.roaming_link');

  const now = new Date();
  const since = addedSince(params.added, now);
  const { from, to } = pageRange(params.page, params.perPage);

  /** Own customers only — the list before 0044, and the fallback while it is not applied. */
  const ownListQuery = () => {
    let query = supabase
      .from('customers')
      .select(
        'id, full_name, mobile, verification_status, created_at, ' +
          'current_district:address_json->current->>district, ' +
          'permanent_district:address_json->permanent->>district',
        { count: 'exact' },
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (since) query = query.gte('created_at', since.toISOString());
    return query.order('created_at', { ascending: false }).range(from, to);
  };

  /**
   * Own customers and the roaming customers this centre has been given access to, in one list
   * (0044). Falls back to own customers on a database that has not run 0044.
   */
  const listQuery = async (): Promise<{ rows: ListRow[]; count: number; error: unknown }> => {
    const combined = await supabase.rpc('centre_customer_list', {
      p_organization_id: organizationId,
      p_since: since ? since.toISOString() : null,
      p_include_linked: canLinkRoaming,
      p_limit: params.perPage,
      p_offset: from,
    });
    if (!isMissingFunction(combined.error)) {
      const data = (combined.data ?? []) as CentreListRow[];
      return {
        error: combined.error,
        count: Number(data[0]?.total_count ?? 0),
        rows: data.map((row) => ({
          id: row.customer_id,
          isLinked: row.is_linked,
          displayName: row.is_linked
            ? `${row.given_name ?? ''}${row.family_initial ? ` ${row.family_initial}.` : ''}`
            : (row.full_name ?? ''),
          mobileLast4: row.mobile_last4 || null,
          district: row.district,
          verificationStatus: row.verification_status,
          addedAt: row.added_at,
          grantExpiresAt: row.has_active_grant ? row.grant_expires_at : null,
        })),
      };
    }

    const own = await ownListQuery();
    return {
      error: own.error?.code === 'PGRST103' ? null : own.error,
      count: own.count ?? 0,
      rows: ((own.data ?? []) as unknown as OwnListRow[]).map((row) => ({
        id: row.id,
        isLinked: false,
        displayName: row.full_name,
        mobileLast4: maskLast4(row.mobile),
        district: row.current_district ?? row.permanent_district,
        verificationStatus: row.verification_status,
        addedAt: row.created_at,
        grantExpiresAt: null,
      })),
    };
  };

  const [total, verified, newThisMonth, recent, states, roamingCount, list] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .in('verification_status', [...VERIFIED_STATUSES]),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', istMonthStart(now).toISOString()),
    supabase
      .from('customers')
      .select('created_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', istMonthStart(now, MONTH_BARS - 1).toISOString())
      .limit(STATS_ROW_LIMIT),
    supabase
      .from('customers')
      .select(
        'permanent_state:address_json->permanent->>state, current_state:address_json->current->>state',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(STATS_ROW_LIMIT),
    // A bookmark count, not the roaming list itself: the list is a masked projection built by
    // `roaming_linked_customers`, and the tab only needs to know how long it is.
    canLinkRoaming
      ? supabase
          .from('customer_roaming_links')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
      : Promise.resolve(null),
    listQuery(),
  ]);

  for (const result of [total, verified, newThisMonth, recent, states, roamingCount]) {
    if (result?.error) throw result.error;
  }
  if (list?.error) throw list.error;

  // A page past the end — a stale link after customers were removed, or a hand-edited URL.
  if (list && list.rows.length === 0 && params.page > 1) {
    redirect(listHref(params, { page: 1 }));
  }

  const totalCount = total.count ?? 0;
  const verifiedCount = verified.count ?? 0;
  const newCount = newThisMonth.count ?? 0;
  const growth = monthGrowthPercent(totalCount, newCount);
  const verifiedShare = sharePercent(verifiedCount, totalCount);
  const monthBars = sparklineHeights(
    bucketByIstMonth((recent.data ?? []) as { created_at: string }[], MONTH_BARS, now),
  );
  const leadingState = topState(
    ((states.data ?? []) as StateRow[]).map((row) => row.permanent_state ?? row.current_state),
  );
  const monthName = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    year: 'numeric',
  }).format(now);

  const rows = list?.rows ?? [];
  const listTotal = list?.count ?? 0;
  // Everyone this centre serves: registered here, plus roaming customers it has been given
  // access to (each linked once, 0044).
  const allCount = totalCount + (roamingCount?.count ?? 0);
  const pages = lastPage(listTotal, params.perPage);

  return (
    <div className="space-y-6">
      <section className="relative min-h-[150px] overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e7f1fe] to-[#e1f1ff] px-6 py-8 sm:px-8">
        {/*
         * The citizens / India Gate / tricolour artwork, anchored right. Decorative only, and
         * hidden below `md`, where the banner is no wider than its own heading.
         *
         * A fixed width rather than a share of the banner: the source is a 16:9 landscape in a
         * short box, so the crop is tuned for one scale — flag and skyline across the top,
         * the three figures from the shoulders up.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[640px] max-w-[70%] select-none md:block"
        >
          <Image
            src="/customers/customers-banner-hero.jpg"
            alt=""
            fill
            priority
            sizes="640px"
            className="object-cover object-[right_35%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#e7f2fe] via-[#e7f2fe]/30 to-transparent" />
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {t('customers.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('customers.heroSubtitle')}</p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CustomerStatCard
          tone="brand"
          icon={<CustomersIcon className="h-6 w-6" />}
          label={t('customers.stats.total')}
          value={totalCount}
          hint={t('customers.stats.totalHint')}
          aside={
            growth !== null ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                <GrowthIcon className="h-3.5 w-3.5" />
                {t('customers.stats.growth', { percent: growth })}
              </span>
            ) : null
          }
        />

        <CustomerStatCard
          tone="emerald"
          icon={<VerifiedIcon className="h-6 w-6" />}
          label={t('customers.stats.verified')}
          value={verifiedCount}
          hint={t('customers.stats.verifiedHint')}
          footer={
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={verifiedShare}
                aria-label={t('customers.stats.verified')}
              >
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${verifiedShare}%` }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums text-slate-600">
                {verifiedShare}%
              </span>
            </div>
          }
        />

        <CustomerStatCard
          tone="violet"
          icon={<NewCustomerIcon className="h-6 w-6" />}
          label={t('customers.stats.newThisMonth')}
          value={newCount}
          hint={t('customers.stats.joinedIn', { month: monthName })}
          aside={
            <div
              role="img"
              aria-label={t('customers.stats.monthlyBars')}
              className="flex h-9 items-end gap-1"
            >
              {monthBars.map((height, index) => (
                <span
                  key={index}
                  className={`w-1.5 rounded-full ${
                    index === monthBars.length - 1 ? 'bg-violet-600' : 'bg-brand-500/70'
                  }`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          }
        />

        <CustomerStatCard
          tone="orange"
          icon={<StateIcon className="h-6 w-6" />}
          label={
            leadingState
              ? t('customers.stats.fromState', { state: leadingState.state })
              : t('customers.stats.topState')
          }
          value={leadingState?.count ?? '—'}
          hint={leadingState ? t('customers.stats.topStateHint') : t('customers.stats.noState')}
          aside={
            isBihar(leadingState?.state) ? (
              // Decorative: the label beside it already names the state.
              <Image
                src="/customers/bihar-map-shape.png"
                alt=""
                aria-hidden
                width={80}
                height={80}
                className="-my-4 h-20 w-20 shrink-0 object-contain"
              />
            ) : null
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <CustomerSearchBox />
        </div>
        <div className="flex gap-3">
          <FilterMenu
            buttonLabel={
              params.added === 'any'
                ? t('customers.filter.button')
                : `${t('customers.filter.button')}: ${t(`customers.filter.${params.added}`)}`
            }
            heading={t('customers.filter.added')}
            isFiltered={params.added !== 'any'}
            options={ADDED_WINDOWS.map((window) => ({
              key: window,
              label: t(`customers.filter.${window}`),
              href: listHref(params, { added: window, page: 1 }),
              active: params.added === window,
            }))}
          />
          {canCreate ? (
            <Link href="/customers/new" className={NEW_CUSTOMER_LINK}>
              <PlusIcon className="h-5 w-5" />
              {t('customers.new')}
            </Link>
          ) : null}
        </div>
      </div>

      {/* "Registered at another cafe?" — find them by mobile; they join this list once they
          say yes on their phone (0044). Replaces the old Roaming tab. */}
      {canLinkRoaming ? <RoamingLookup /> : null}

      <h2 className="flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-semibold text-brand-700">
        <CustomersIcon className="h-5 w-5" />
        {t('customers.tabAllCount', { count: allCount })}
      </h2>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {rows.length === 0 ? (
          <EmptyState
            title={since ? t('customers.emptyFilter') : t('customers.emptyFirst')}
            description={since || canCreate ? undefined : t('customers.empty')}
            action={
              !since && canCreate ? (
                <Link href="/customers/new" className={NEW_CUSTOMER_LINK}>
                  <PlusIcon className="h-5 w-5" />
                  {t('customers.new')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="py-3.5">{t('customers.name')}</TH>
                  <TH className="py-3.5">{t('customers.mobile')}</TH>
                  <TH className="py-3.5">{t('customers.district')}</TH>
                  <TH className="py-3.5">{t('settings.status')}</TH>
                  <TH className="py-3.5">{t('customers.addedOn')}</TH>
                  <TH className="py-3.5 text-right">{t('customers.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((customer) => (
                  <CustomerTableRow
                    key={customer.id}
                    customer={customer}
                    statusLabel={
                      customer.isLinked
                        ? accessLabel(customer.grantExpiresAt, t)
                        : customer.verificationStatus in VERIFICATION_TONE
                          ? t(`customers.verification.${customer.verificationStatus}`)
                          : customer.verificationStatus
                    }
                    otherCentreLabel={t('customers.roaming.otherCentre')}
                    openLabel={t('customers.openProfile', { name: customer.displayName })}
                  />
                ))}
              </TBody>
            </Table>

            <Pagination
              params={params}
              total={listTotal}
              pages={pages}
              labels={{
                nav: t('customers.pagination.label'),
                showing: t('customers.pagination.showing', {
                  from: from + 1,
                  to: from + rows.length,
                  total: listTotal,
                }),
                rowsPerPage: t('customers.pagination.rowsPerPage'),
                previous: t('customers.pagination.previous'),
                next: t('customers.pagination.next'),
                page: (page) => t('customers.pagination.page', { page }),
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** A linked customer's access state: "🟢 Active (1h 20m)" or "🔒 Locked" (approval needed). */
function accessLabel(
  grantExpiresAt: string | null,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const remaining = grantExpiresAt
    ? grantRemainingMs({ status: 'active', expiresAt: grantExpiresAt })
    : 0;
  return remaining > 0
    ? `🟢 ${t('customers.roaming.activeShort', { remaining: formatGrantRemaining(remaining) })}`
    : `🔒 ${t('customers.roaming.lockedShort')}`;
}

function CustomerTableRow({
  customer,
  statusLabel,
  otherCentreLabel,
  openLabel,
}: {
  customer: ListRow;
  statusLabel: string;
  otherCentreLabel: string;
  openLabel: string;
}) {
  const href = `/customers/${customer.id}`;
  const last4 = customer.mobileLast4;
  const tone: Tone = customer.isLinked
    ? customer.grantExpiresAt &&
      grantRemainingMs({ status: 'active', expiresAt: customer.grantExpiresAt }) > 0
      ? 'success'
      : 'neutral'
    : (VERIFICATION_TONE[customer.verificationStatus] ?? 'neutral');
  const addedOn = formatIndianDate(istDayKey(customer.addedAt));

  return (
    <TR className="hover:bg-slate-50/60">
      <TD className="py-3.5">
        <Link href={href} className="flex items-center gap-3 font-semibold text-slate-900">
          <CustomerAvatar id={customer.id} name={customer.displayName} />
          <span className="min-w-0">
            <span className="block hover:underline">{customer.displayName}</span>
            {customer.isLinked ? (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                <RoamingIcon className="h-3.5 w-3.5" />
                {otherCentreLabel}
              </span>
            ) : null}
          </span>
        </Link>
      </TD>
      <TD className="py-3.5 tabular-nums text-slate-600">{last4 ? `•••••• ${last4}` : '—'}</TD>
      <TD className="py-3.5 text-slate-600">{customer.district ?? '—'}</TD>
      <TD className="py-3.5">
        <Badge tone={tone} className="gap-1 px-2.5 py-1">
          {!customer.isLinked && tone === 'success' ? (
            <VerifiedIcon className="h-3.5 w-3.5" />
          ) : null}
          {statusLabel}
        </Badge>
      </TD>
      <TD className="py-3.5 tabular-nums text-slate-500">{addedOn ?? '—'}</TD>
      <TD className="py-3.5 text-right">
        <Link
          href={href}
          aria-label={openLabel}
          title={openLabel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-600 shadow-sm transition-colors hover:bg-brand-50"
        >
          <ViewIcon className="h-4 w-4" />
        </Link>
      </TD>
    </TR>
  );
}

const PAGE_BUTTON =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors';

function Pagination({
  params,
  total,
  pages,
  labels,
}: {
  params: ListParams;
  total: number;
  pages: number;
  labels: {
    nav: string;
    showing: string;
    rowsPerPage: string;
    previous: string;
    next: string;
    page: (page: number) => string;
  };
}) {
  const previous = params.page > 1 ? listHref(params, { page: params.page - 1 }) : null;
  const next = params.page < pages ? listHref(params, { page: params.page + 1 }) : null;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">{total > 0 ? labels.showing : null}</p>
      <div className="flex items-center gap-4">
        <RowsPerPage
          label={labels.rowsPerPage}
          value={params.perPage}
          options={PAGE_SIZES.map((size) => ({
            value: size,
            href: listHref(params, { perPage: size, page: 1 }),
          }))}
        />
        <nav aria-label={labels.nav} className="flex items-center gap-1.5">
          <PageLink href={previous} label={labels.previous}>
            <PreviousIcon className="h-4 w-4" />
          </PageLink>
          {pageWindow(params.page, pages).map((page) =>
            page === params.page ? (
              <span
                key={page}
                aria-current="page"
                aria-label={labels.page(page)}
                className={`${PAGE_BUTTON} border-brand-600 bg-brand-600 text-white`}
              >
                {page}
              </span>
            ) : (
              <Link
                key={page}
                href={listHref(params, { page })}
                aria-label={labels.page(page)}
                className={`${PAGE_BUTTON} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
              >
                {page}
              </Link>
            ),
          )}
          <PageLink href={next} label={labels.next}>
            <NextIcon className="h-4 w-4" />
          </PageLink>
        </nav>
      </div>
    </div>
  );
}

function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={`${PAGE_BUTTON} cursor-not-allowed border-slate-200 bg-white px-2.5 text-slate-300`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${PAGE_BUTTON} border-slate-200 bg-white px-2.5 text-slate-600 hover:bg-slate-50`}
    >
      {children}
    </Link>
  );
}
