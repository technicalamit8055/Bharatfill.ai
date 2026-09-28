import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR, type Tone } from '@assistigo/ui';
import { formatIndianDate, maskLast4 } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FillSessionRow } from '@/lib/supabase/database.types';
import {
  durationParts,
  estimatedSecondsSaved,
  istDayKey,
  sparklineHeights,
} from '@/lib/dashboard/metrics';
import { lastPage, pageRange } from '@/lib/customers/list-view';
import {
  PAGE_SIZES,
  bucketOverWindow,
  fillSessionsHref,
  hasListFilters,
  originHost,
  parseFillSessionParams,
  periodChangePercent,
  previousRangeStart,
  rangeDays,
  rangeStart,
  reviewAccuracyPercent,
  sanitizeSearchTerm,
  sumFilledFields,
  type FillSessionListParams,
} from '@/lib/fill-sessions/list-view';
import { CustomerAvatar } from '../customers/customer-avatar';
import { RowsPerPage } from '../customers/rows-per-page';
import { AccuracyRing, FillSessionStatCard, StatBars } from './fill-session-stat-card';
import { FillSessionsFilters } from './fill-sessions-filters';
import { RowActionsMenu } from './row-actions-menu';
import {
  AccuracyIcon,
  AutofilledIcon,
  CaptchaIcon,
  CustomerIcon,
  DetectStepIcon,
  FilledIcon,
  FillStepIcon,
  NextIcon,
  OpenLinkIcon,
  OtpIcon,
  PaymentIcon,
  PreviousIcon,
  ReviewStepIcon,
  SessionsIcon,
  SortAscendingIcon,
  SortIcon,
  TimeSavedIcon,
  ViewSessionIcon,
} from './icons';

export const metadata = { title: 'Fill sessions' };

const STATUS_TONE: Record<string, Tone> = {
  detected: 'neutral',
  reviewed: 'info',
  filled: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

/** Bars on the summary cards: the date window cut into this many equal slices. */
const STAT_BARS = 6;

/**
 * Upper bound on the rows read for the summary cards. Past this, the fields and accuracy
 * figures cover the most recent sessions in the window — the session count stays exact, since
 * it is a head-only count.
 */
const STATS_ROW_LIMIT = 5000;

/** Customers matched by name for the search box. More than this and the search is too broad. */
const CUSTOMER_MATCH_LIMIT = 50;

type FillSessionListRow = Pick<
  FillSessionRow,
  | 'id'
  | 'customer_id'
  | 'application_id'
  | 'page_origin'
  | 'page_title'
  | 'status'
  | 'filled_fields_count'
  | 'skipped_fields_count'
  | 'proposed_fields_count'
  | 'captcha_fields_count'
  | 'otp_fields_count'
  | 'payment_fields_count'
  | 'created_at'
> & { customers: { full_name: string; mobile: string | null } | null };

type SafetyBadge = { key: 'captcha' | 'otp' | 'payment'; icon: React.ReactNode };

type StatsRow = Pick<FillSessionRow, 'status' | 'filled_fields_count' | 'created_at'>;

/**
 * The fill sessions audit log (spec §7.3.10): what the extension detected on each portal page,
 * how much it filled, and which fields it deliberately left for the operator — CAPTCHA, OTP and
 * payment are never filled (DEVELOPMENT_RULES), and the safety column shows where they were met.
 *
 * Every query is scoped to the caller's organization here and again by RLS. The table reads the
 * counts the extension recorded, never a field value, and the customer's mobile number is masked
 * before it leaves the server.
 */
export default async function FillSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('fill.run');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = parseFillSessionParams(await searchParams);

  const organizationId = session.organization.id;
  const canCreateApplication = session.permissions.has('application.create');

  const now = new Date();
  const start = rangeStart(params.range, now);
  const previousStart = previousRangeStart(params.range, now);
  const { from, to } = pageRange(params.page, params.perPage);
  const term = sanitizeSearchTerm(params.q);

  // "…or customer": the names are matched first, then their sessions join the portal/title match.
  let customerIds: string[] = [];
  if (term) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .ilike('full_name', `%${term}%`)
      .limit(CUSTOMER_MATCH_LIMIT);
    if (error) throw error;
    customerIds = ((data ?? []) as { id: string }[]).map((row) => row.id);
  }

  let listQuery = supabase
    .from('fill_sessions')
    .select(
      'id, customer_id, application_id, page_origin, page_title, status, filled_fields_count, ' +
        'skipped_fields_count, proposed_fields_count, captcha_fields_count, otp_fields_count, ' +
        'payment_fields_count, created_at, customers(full_name, mobile)',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId);
  if (start) listQuery = listQuery.gte('created_at', start.toISOString());
  if (params.status) listQuery = listQuery.eq('status', params.status);
  if (term) {
    const conditions = [`page_title.ilike.%${term}%`, `page_origin.ilike.%${term}%`];
    if (customerIds.length > 0) conditions.push(`customer_id.in.(${customerIds.join(',')})`);
    listQuery = listQuery.or(conditions.join(','));
  }

  let currentCount = supabase
    .from('fill_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (start) currentCount = currentCount.gte('created_at', start.toISOString());

  let statsQuery = supabase
    .from('fill_sessions')
    .select('status, filled_fields_count, created_at')
    .eq('organization_id', organizationId);
  if (previousStart) statsQuery = statsQuery.gte('created_at', previousStart.toISOString());

  const [list, current, previous, stats] = await Promise.all([
    listQuery.order('created_at', { ascending: params.sort === 'oldest' }).range(from, to),
    currentCount,
    start && previousStart
      ? supabase
          .from('fill_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('created_at', previousStart.toISOString())
          .lt('created_at', start.toISOString())
      : Promise.resolve(null),
    statsQuery.order('created_at', { ascending: false }).limit(STATS_ROW_LIMIT),
  ]);

  // A page past the end — a stale link after the window moved, or a hand-edited URL.
  if (list.error?.code === 'PGRST103') redirect(fillSessionsHref(params, { page: 1 }));

  for (const result of [list, current, previous, stats]) {
    if (result?.error) throw result.error;
  }

  // Summary: the current window, compared with the equally long window before it.
  const statsRows = (stats.data ?? []) as StatsRow[];
  const inWindow = start
    ? statsRows.filter((row) => Date.parse(row.created_at) >= start.getTime())
    : statsRows;
  const inPrevious = start ? statsRows.filter((row) => Date.parse(row.created_at) < start.getTime()) : [];

  const sessionsCount = current.count ?? 0;
  const fieldsFilled = sumFilledFields(inWindow);
  const accuracy = reviewAccuracyPercent(inWindow);
  const saved = durationParts(estimatedSecondsSaved(fieldsFilled));
  const sessionsChange = previous ? periodChangePercent(sessionsCount, previous.count ?? 0) : null;
  const fieldsChange = start ? periodChangePercent(fieldsFilled, sumFilledFields(inPrevious)) : null;

  // "All time" has no fixed start: its bars run from the oldest session read to now.
  const oldest = statsRows.at(-1)?.created_at;
  const barsStart = start ?? (oldest ? new Date(oldest) : now);
  const barsEnd = new Date(now.getTime() + 1);
  const sessionBars = sparklineHeights(bucketOverWindow(inWindow, barsStart, barsEnd, STAT_BARS));
  const fieldBars = sparklineHeights(
    bucketOverWindow(inWindow, barsStart, barsEnd, STAT_BARS, (row) =>
      Math.max(0, row.filled_fields_count ?? 0),
    ),
  );

  const days = rangeDays(params.range);
  const changeFor = (percent: number | null) =>
    percent === null || days === null
      ? null
      : {
          percent,
          label:
            percent < 0
              ? t('fillSessions.summary.changeDown', { percent: Math.abs(percent) })
              : t('fillSessions.summary.changeUp', { percent }),
          title: t('fillSessions.summary.changeVs', { days }),
        };

  const rows = (list.data ?? []) as unknown as FillSessionListRow[];
  const listTotal = list.count ?? 0;
  const pages = lastPage(listTotal, params.perPage);
  const filtered = hasListFilters(params);

  const timeFormat = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="space-y-6">
      <section className="relative min-h-[176px] overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e7f1fe] via-[#f1f7ff] to-white px-6 py-8 sm:px-8">
        {/*
          * The browser-window / paper-plane / tricolour artwork. Decorative, and hidden below
          * `md`, where the banner is no wider than its own heading.
          *
          * The source is a 16:9 slide whose left half carries its own "Fill Sessions" caption,
          * so it is drawn taller than the banner, pinned right, and faded in from the left: only
          * the illustration shows, and its white ground meets the banner's white edge.
          */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[360px] select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent_18%,black_55%)] md:block lg:right-[196px] lg:w-[340px]"
        >
          <Image
            src="/fill-sessions/fill-sessions-banner-hero.png"
            alt=""
            width={1376}
            height={768}
            priority
            sizes="440px"
            className="absolute right-0 top-1/2 h-[135%] w-auto max-w-none -translate-y-1/2"
          />
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {t('fillSessions.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('fillSessions.subtitle')}</p>
        </div>

        <ol
          aria-label={t('fillSessions.hero.stepsLabel')}
          className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex"
        >
          <HeroStep
            icon={<DetectStepIcon className="h-3.5 w-3.5" />}
            tone="bg-brand-600"
            label={t('fillSessions.hero.detect')}
          />
          <HeroStep
            icon={<FillStepIcon className="h-3.5 w-3.5" />}
            tone="bg-emerald-500"
            label={t('fillSessions.hero.fill')}
          />
          <HeroStep
            icon={<ReviewStepIcon className="h-3.5 w-3.5" />}
            tone="bg-violet-500"
            label={t('fillSessions.hero.review')}
          />
        </ol>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FillSessionStatCard
          tone="brand"
          icon={<SessionsIcon className="h-7 w-7" />}
          label={t('fillSessions.summary.totalSessions')}
          value={sessionsCount}
          change={changeFor(sessionsChange)}
          aside={
            <StatBars
              heights={sessionBars}
              tone="brand"
              label={t('fillSessions.summary.activityBars')}
            />
          }
        />
        <FillSessionStatCard
          tone="violet"
          icon={<AutofilledIcon className="h-7 w-7" />}
          label={t('fillSessions.summary.fieldsFilled')}
          value={fieldsFilled}
          change={changeFor(fieldsChange)}
          aside={
            <StatBars
              heights={fieldBars}
              tone="violet"
              label={t('fillSessions.summary.activityBars')}
            />
          }
        />
        <FillSessionStatCard
          tone="emerald"
          icon={<AccuracyIcon className="h-7 w-7" />}
          label={t('fillSessions.summary.reviewAccuracy')}
          value={accuracy === null ? '—' : `${accuracy}%`}
          aside={
            <AccuracyRing
              percent={accuracy}
              label={
                accuracy === null
                  ? t('fillSessions.summary.noAccuracy')
                  : t('fillSessions.summary.accuracyRing', { percent: accuracy })
              }
            />
          }
        />
        <FillSessionStatCard
          tone="orange"
          icon={<TimeSavedIcon className="h-7 w-7" />}
          label={t('fillSessions.summary.timeSaved')}
          value={
            saved.hours > 0
              ? t('dashboard.durationHoursMinutes', saved)
              : t('dashboard.durationMinutes', { minutes: saved.minutes })
          }
          change={changeFor(fieldsChange)}
          aside={
            <StatBars
              heights={fieldBars}
              tone="orange"
              label={t('fillSessions.summary.activityBars')}
            />
          }
        />
      </div>

      <FillSessionsFilters params={params} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t('fillSessions.empty') : t('fillSessions.emptyFirst')}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="py-3.5">
                    <SortHeader params={params} label={t('fillSessions.table.when')} t={t} />
                  </TH>
                  <TH className="py-3.5">{t('fillSessions.table.customer')}</TH>
                  <TH className="py-3.5">{t('fillSessions.table.portal')}</TH>
                  <TH className="py-3.5">{t('settings.status')}</TH>
                  <TH className="py-3.5">{t('fillSessions.table.fields')}</TH>
                  <TH className="py-3.5">{t('fillSessions.table.safety')}</TH>
                  <TH className="py-3.5">{t('fillSessions.table.application')}</TH>
                  <TH className="py-3.5 text-right">{t('fillSessions.table.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => {
                  const last4 = row.customers ? maskLast4(row.customers.mobile) : null;
                  const title = row.page_title ?? originHost(row.page_origin);
                  const sessionHref = `/fill-sessions/${row.id}`;
                  const tone = STATUS_TONE[row.status] ?? 'neutral';
                  const safety: SafetyBadge[] = [];
                  if (row.captcha_fields_count > 0) {
                    safety.push({ key: 'captcha', icon: <CaptchaIcon className="h-3.5 w-3.5" /> });
                  }
                  if (row.otp_fields_count > 0) {
                    safety.push({ key: 'otp', icon: <OtpIcon className="h-3.5 w-3.5" /> });
                  }
                  if (row.payment_fields_count > 0) {
                    safety.push({ key: 'payment', icon: <PaymentIcon className="h-3.5 w-3.5" /> });
                  }

                  return (
                    <TR key={row.id} className="hover:bg-slate-50/60">
                      <TD className="whitespace-nowrap py-4 tabular-nums">
                        <p className="text-slate-800">
                          {formatIndianDate(istDayKey(row.created_at)) ?? '—'}
                        </p>
                        <p className="mt-0.5 text-xs uppercase text-slate-500">
                          {timeFormat.format(new Date(row.created_at))}
                        </p>
                      </TD>

                      <TD className="py-4">
                        {row.customers ? (
                          <Link
                            href={`/customers/${row.customer_id}`}
                            className="group flex items-center gap-3"
                          >
                            <CustomerAvatar id={row.customer_id} name={row.customers.full_name} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900 group-hover:underline">
                                {row.customers.full_name}
                              </span>
                              {last4 ? (
                                <span className="block text-xs tabular-nums text-slate-500">
                                  •••••• {last4}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>

                      <TD className="max-w-[17rem] py-4">
                        <Link
                          href={sessionHref}
                          title={title}
                          className="block truncate font-medium text-brand-700 hover:underline"
                        >
                          {title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {originHost(row.page_origin)}
                        </p>
                      </TD>

                      <TD className="py-4">
                        <Badge tone={tone} className="gap-1 px-2.5 py-1">
                          {row.status === 'filled' ? <FilledIcon className="h-3.5 w-3.5" /> : null}
                          {t(`fillSessions.status.${row.status}`)}
                        </Badge>
                      </TD>

                      <TD className="whitespace-nowrap py-4">
                        <p className="font-semibold tabular-nums text-slate-900">
                          {row.filled_fields_count} / {row.proposed_fields_count}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t('fillSessions.fieldsFilledLabel')}
                        </p>
                        {row.skipped_fields_count > 0 ? (
                          <p className="text-xs text-slate-400">
                            {t('fillSessions.fieldsSkipped', { count: row.skipped_fields_count })}
                          </p>
                        ) : null}
                      </TD>

                      <TD className="py-4">
                        {safety.length > 0 ? (
                          <div className="flex max-w-[16rem] flex-wrap gap-1.5">
                            {safety.map((item) => (
                              <Badge
                                key={item.key}
                                tone="warning"
                                className="gap-1 whitespace-nowrap px-2 py-1"
                              >
                                {item.icon}
                                {t(`fillSessions.safety.${item.key}`)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {t('fillSessions.safety.none')}
                          </span>
                        )}
                      </TD>

                      <TD className="whitespace-nowrap py-4">
                        {row.application_id ? (
                          <Link
                            href={`/applications/${row.application_id}`}
                            className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                          >
                            {t('fillSessions.viewApplication')}
                            <OpenLinkIcon className="h-4 w-4" />
                          </Link>
                        ) : canCreateApplication ? (
                          // The detail page holds the convert button: the operator sees what was
                          // filled before turning the session into a tracked application.
                          <Link
                            href={sessionHref}
                            className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                          >
                            {t('fillSessions.createApplication')}
                            <OpenLinkIcon className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>

                      <TD className="py-4 text-right">
                        <RowActionsMenu
                          label={t('fillSessions.rowActions.menu')}
                          actions={[
                            {
                              key: 'session',
                              label: t('fillSessions.rowActions.openSession'),
                              href: sessionHref,
                              icon: <ViewSessionIcon className="h-4 w-4" />,
                            },
                            ...(row.customers
                              ? [
                                  {
                                    key: 'customer',
                                    label: t('fillSessions.rowActions.openCustomer'),
                                    href: `/customers/${row.customer_id}`,
                                    icon: <CustomerIcon className="h-4 w-4" />,
                                  },
                                ]
                              : []),
                            ...(row.application_id
                              ? [
                                  {
                                    key: 'application',
                                    label: t('fillSessions.viewApplication'),
                                    href: `/applications/${row.application_id}`,
                                    icon: <OpenLinkIcon className="h-4 w-4" />,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <Pagination
              params={params}
              pages={pages}
              labels={{
                nav: t('fillSessions.pagination.label'),
                showing: t('fillSessions.pagination.showing', {
                  count: rows.length,
                  total: listTotal,
                }),
                rowsPerPage: t('fillSessions.pagination.rowsPerPage'),
                previous: t('fillSessions.pagination.previous'),
                next: t('fillSessions.pagination.next'),
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function HeroStep({ icon, tone, label }: { icon: React.ReactNode; tone: string; label: string }) {
  return (
    <li className="flex w-44 items-center gap-2.5 rounded-xl border border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${tone}`}>
        {icon}
      </span>
      {label}
    </li>
  );
}

function SortHeader({
  params,
  label,
  t,
}: {
  params: FillSessionListParams;
  label: string;
  t: (key: string) => string;
}) {
  const oldestFirst = params.sort === 'oldest';
  const toggle = oldestFirst ? t('fillSessions.table.showNewestFirst') : t('fillSessions.table.showOldestFirst');
  return (
    <Link
      href={fillSessionsHref(params, { sort: oldestFirst ? 'newest' : 'oldest', page: 1 })}
      title={toggle}
      aria-label={`${label} — ${toggle}`}
      className="inline-flex items-center gap-1.5 hover:text-slate-900"
    >
      {label}
      {oldestFirst ? (
        <SortAscendingIcon className="h-3.5 w-3.5" />
      ) : (
        <SortIcon className="h-3.5 w-3.5" />
      )}
    </Link>
  );
}

const PAGE_BUTTON =
  'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors';

function Pagination({
  params,
  pages,
  labels,
}: {
  params: FillSessionListParams;
  pages: number;
  labels: { nav: string; showing: string; rowsPerPage: string; previous: string; next: string };
}) {
  const previous = params.page > 1 ? fillSessionsHref(params, { page: params.page - 1 }) : null;
  const next = params.page < pages ? fillSessionsHref(params, { page: params.page + 1 }) : null;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">{labels.showing}</p>
      <div className="flex items-center gap-4">
        <RowsPerPage
          label={labels.rowsPerPage}
          value={params.perPage}
          options={PAGE_SIZES.map((size) => ({
            value: size,
            href: fillSessionsHref(params, { perPage: size, page: 1 }),
          }))}
        />
        <nav aria-label={labels.nav} className="flex items-center gap-1.5">
          <PageLink href={previous} label={labels.previous}>
            <PreviousIcon className="h-4 w-4" />
          </PageLink>
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
        className={`${PAGE_BUTTON} cursor-not-allowed text-slate-300`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${PAGE_BUTTON} text-slate-600 hover:bg-slate-50`}>
      {children}
    </Link>
  );
}
