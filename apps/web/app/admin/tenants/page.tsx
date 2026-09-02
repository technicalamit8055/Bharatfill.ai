import { formatIndianDate } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadTenantRows } from '@/lib/admin/metrics';
import { getTranslations } from '@/lib/i18n/server';
import { AdminCard, AdminEmpty, AdminNote, AdminPageHeader, AdminTable, TD, TH } from '../ui';

export const metadata = { title: 'Tenants' };

const PAGE_SIZE = 50;

/**
 * The tenant list: organization metadata and volumes.
 *
 * Every column here is a count or a property of the organization itself. There is no link into a
 * tenant's data, and search is by organization name only — looking a centre up by one of its
 * customers is exactly the query that should require a support access grant (§19.9), so it is not
 * offered.
 */
export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.tenants.view');
  const { t, locale } = await getTranslations();
  const params = await searchParams;

  const search = typeof params.q === 'string' ? params.q : '';
  const page = Math.max(Number(typeof params.page === 'string' ? params.page : '1') || 1, 1);

  const rows = await loadTenantRows(session.supabase, {
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');

  return (
    <>
      <AdminPageHeader
        title={t('admin.tenants.title')}
        description={t('admin.tenants.subtitle')}
      />

      <AdminNote>{t('admin.tenants.privacyNote')}</AdminNote>

      <AdminCard>
        <form method="get" className="mb-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={t('admin.tenants.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            {t('common.search')}
          </button>
        </form>

        <AdminTable
          head={
            <tr>
              <TH>{t('admin.tenants.name')}</TH>
              <TH>{t('admin.tenants.plan')}</TH>
              <TH>{t('admin.tenants.location')}</TH>
              <TH className="text-right">{t('admin.tenants.members')}</TH>
              <TH className="text-right">{t('admin.tenants.customers')}</TH>
              <TH className="text-right">{t('admin.tenants.applications')}</TH>
              <TH className="text-right">{t('admin.tenants.fills30d')}</TH>
              <TH>{t('admin.tenants.lastActivity')}</TH>
            </tr>
          }
          empty={
            rows.length === 0 ? (
              <AdminEmpty
                title={t('admin.tenants.empty')}
                description={search ? t('admin.tenants.emptySearch') : undefined}
              />
            ) : undefined
          }
        >
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-900/60">
              <TD className="font-medium text-slate-100">
                {row.name}
                <div className="text-xs text-slate-500">{row.business_type}</div>
              </TD>
              <TD>{row.plan_code}</TD>
              <TD className="text-slate-400">
                {[row.city, row.state].filter(Boolean).join(', ') || '—'}
              </TD>
              <TD className="text-right tabular-nums">{n(row.member_count)}</TD>
              <TD className="text-right tabular-nums">{n(row.customer_count)}</TD>
              <TD className="text-right tabular-nums">{n(row.application_count)}</TD>
              <TD className="text-right tabular-nums">{n(row.fill_sessions_30d)}</TD>
              <TD className="text-slate-400">
                {formatIndianDate(row.last_activity_at) ?? t('admin.tenants.never')}
              </TD>
            </tr>
          ))}
        </AdminTable>

        {/* Offset paging: the list is ordered by a stable created_at desc, so pages do not shuffle. */}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>{t('admin.tenants.showing', { count: rows.length, page })}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <a
                href={`/admin/tenants?q=${encodeURIComponent(search)}&page=${page - 1}`}
                className="rounded-md bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
              >
                {t('common.previous')}
              </a>
            ) : null}
            {rows.length === PAGE_SIZE ? (
              <a
                href={`/admin/tenants?q=${encodeURIComponent(search)}&page=${page + 1}`}
                className="rounded-md bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
              >
                {t('common.next')}
              </a>
            ) : null}
          </div>
        </div>
      </AdminCard>
    </>
  );
}
