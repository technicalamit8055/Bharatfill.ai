import Link from 'next/link';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { z } from 'zod';
import { TENANT_STATUSES, formatIndianDate, tenantStatusOf } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadTenantRows } from '@/lib/admin/metrics';
import { getTranslations } from '@/lib/i18n/server';
import {
  AdminAvatar,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminFilterTabs,
  AdminNote,
  AdminPageHeader,
  AdminPagination,
  AdminTable,
  TD,
  TH,
} from '../ui';

export const metadata = { title: 'Tenants' };

const PAGE_SIZE = 50;

const paramsSchema = z.object({
  q: z.string().trim().max(120).catch(''),
  status: z.enum(TENANT_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/**
 * The tenant list: organization metadata and volumes.
 *
 * Every column here is a count or a property of the organization itself. Search is by
 * organization name only — looking a centre up by one of its customers is exactly the query that
 * should require a support access grant (§19.9), so it is not offered.
 */
export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.tenants.view');
  const { t, locale } = await getTranslations();
  const params = paramsSchema.parse(await searchParams);

  const result = await loadTenantRows(session.supabase, {
    search: params.q,
    status: params.status ?? null,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  });

  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');

  const hrefFor = (overrides: { status?: string | null; page?: number }) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    const status = overrides.status === undefined ? params.status : overrides.status;
    if (status) query.set('status', status);
    const page = overrides.page ?? 1;
    if (page > 1) query.set('page', String(page));
    const qs = query.toString();
    return qs ? `/admin/tenants?${qs}` : '/admin/tenants';
  };

  const firstRow = (params.page - 1) * PAGE_SIZE + 1;
  const lastRow = firstRow + result.rows.length - 1;
  const hasNext = result.total !== null ? lastRow < result.total : result.rows.length === PAGE_SIZE;

  return (
    <>
      <AdminPageHeader
        icon={<Building2 />}
        title={t('admin.tenants.title')}
        description={t('admin.tenants.subtitle')}
        meta={
          result.total !== null ? (
            <AdminBadge>{t('admin.tenants.totalCount', { count: n(result.total) })}</AdminBadge>
          ) : null
        }
      />

      {!result.managementAvailable ? (
        <AdminNote tone="warning" title={t('admin.tenants.migrationTitle')}>
          {t('admin.tenants.migrationRequired')}
        </AdminNote>
      ) : null}

      <AdminCard flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-3.5">
          <form method="get" className="relative w-full max-w-sm">
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              name="q"
              defaultValue={params.q}
              placeholder={t('admin.tenants.searchPlaceholder')}
              aria-label={t('admin.tenants.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-700/80 bg-console-field py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
          </form>

          {result.managementAvailable ? (
            <AdminFilterTabs
              label={t('admin.tenants.statusFilter')}
              items={[
                {
                  label: t('admin.tenants.filterAll'),
                  href: hrefFor({ status: null }),
                  active: !params.status,
                },
                {
                  label: t('admin.tenants.filterActive'),
                  href: hrefFor({ status: 'active' }),
                  active: params.status === 'active',
                },
                {
                  label: t('admin.tenants.filterSuspended'),
                  href: hrefFor({ status: 'suspended' }),
                  active: params.status === 'suspended',
                },
              ]}
            />
          ) : null}
        </div>

        <AdminTable
          minWidth={880}
          head={
            <tr>
              <TH>{t('admin.tenants.name')}</TH>
              <TH>{t('admin.tenants.plan')}</TH>
              <TH>{t('admin.tenants.status')}</TH>
              <TH className="text-right">{t('admin.tenants.members')}</TH>
              <TH className="text-right">{t('admin.tenants.customers')}</TH>
              <TH className="text-right">{t('admin.tenants.applications')}</TH>
              <TH className="text-right">{t('admin.tenants.fills30d')}</TH>
              <TH>{t('admin.tenants.lastActivity')}</TH>
              <TH>
                <span className="sr-only">{t('common.open')}</span>
              </TH>
            </tr>
          }
          empty={
            result.rows.length === 0 ? (
              <AdminEmpty
                icon={<Building2 />}
                title={t('admin.tenants.empty')}
                description={params.q || params.status ? t('admin.tenants.emptySearch') : undefined}
              />
            ) : undefined
          }
        >
          {result.rows.map((row) => {
            const status = tenantStatusOf(row);
            return (
              <tr key={row.id} className="group transition-colors hover:bg-slate-900/60">
                <TD>
                  <Link href={`/admin/tenants/${row.id}`} className="flex items-center gap-3">
                    <AdminAvatar label={row.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-100 group-hover:text-slate-50">
                        {row.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[row.city, row.state].filter(Boolean).join(', ') ||
                          t(`onboarding.businessTypes.${row.business_type}`)}
                      </span>
                    </span>
                  </Link>
                </TD>
                <TD>
                  <AdminBadge tone="info">{row.plan_code}</AdminBadge>
                </TD>
                <TD>
                  {status === 'suspended' ? (
                    <AdminBadge tone="danger" dot>
                      {t('admin.tenants.statusSuspended')}
                    </AdminBadge>
                  ) : (
                    <AdminBadge tone="success" dot>
                      {t('admin.tenants.statusActive')}
                    </AdminBadge>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{n(row.member_count)}</TD>
                <TD className="text-right tabular-nums">{n(row.customer_count)}</TD>
                <TD className="text-right tabular-nums">{n(row.application_count)}</TD>
                <TD className="text-right tabular-nums">{n(row.fill_sessions_30d)}</TD>
                <TD className="text-slate-400">
                  {formatIndianDate(row.last_activity_at) ?? t('admin.tenants.never')}
                </TD>
                <TD className="w-10 text-right">
                  <Link
                    href={`/admin/tenants/${row.id}`}
                    aria-label={t('admin.tenants.openCentre', { name: row.name })}
                    className="inline-flex rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TD>
              </tr>
            );
          })}
        </AdminTable>

        {/* Offset paging over a stable created_at desc order, so pages do not shuffle. */}
        <AdminPagination
          summary={
            result.rows.length === 0
              ? t('admin.tenants.noResults')
              : result.total !== null
                ? t('admin.tenants.showingRange', {
                    from: n(firstRow),
                    to: n(lastRow),
                    total: n(result.total),
                  })
                : t('admin.tenants.showing', { count: result.rows.length, page: params.page })
          }
          previousHref={params.page > 1 ? hrefFor({ page: params.page - 1 }) : null}
          nextHref={hasNext ? hrefFor({ page: params.page + 1 }) : null}
          previousLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </AdminCard>

      <AdminNote>{t('admin.tenants.privacyNote')}</AdminNote>
    </>
  );
}
