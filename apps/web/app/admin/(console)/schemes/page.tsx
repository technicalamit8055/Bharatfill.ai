import Link from 'next/link';
import {
  SCHEME_CATEGORY_LABELS,
  formatIndianDate,
  isSchemeCategory,
  type SchemeLifecycleStatus,
} from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { builtInsWithoutGlobalRow, loadGlobalCatalog } from '@/lib/admin/catalog';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { CopyBuiltInButton } from './copy-built-in-button';
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminPageHeader,
  AdminTable,
  TD,
  TH,
} from '../ui';

export const metadata = { title: 'Schemes' };

const STATUS_TONE: Record<SchemeLifecycleStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> =
  {
    active: 'success',
    closing_soon: 'warning',
    upcoming: 'info',
    evergreen: 'neutral',
    closed: 'danger',
  };

/**
 * The global scheme catalogue.
 *
 * Shows only `organization_id is null` rows — the catalogue every centre reads. A centre's own
 * private schemes are their data and are not listed here at all.
 */
export default async function AdminSchemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.schemes.view');
  const { t, locale } = await getTranslations();
  const params = await searchParams;

  const query = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase();
  const showDrafts = params.drafts === '1';

  const listings = await loadGlobalCatalog(session.supabase);
  const missing = builtInsWithoutGlobalRow(listings.map((listing) => listing.row));

  const filtered = listings.filter((listing) => {
    if (showDrafts && listing.row.is_published) return false;
    if (!query) return true;
    const title = listing.scheme?.title.en ?? '';
    return `${listing.row.slug} ${title} ${listing.row.portal_name}`.toLowerCase().includes(query);
  });

  const canEdit = session.permissions.has('platform.schemes.edit');
  const invalidCount = listings.filter((listing) => !listing.scheme).length;

  return (
    <>
      <AdminPageHeader
        title={t('admin.schemes.title')}
        description={t('admin.schemes.subtitle')}
        actions={
          canEdit ? (
            <Link
              href="/admin/schemes/new"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              {t('admin.schemes.new')}
            </Link>
          ) : null
        }
      />

      {invalidCount > 0 ? (
        <AdminNote tone="danger">{t('admin.schemes.invalidRows', { count: invalidCount })}</AdminNote>
      ) : null}

      {missing.length > 0 ? (
        <AdminNote tone="info">
          {t('admin.schemes.builtInsWithoutRow', { count: missing.length })}
        </AdminNote>
      ) : null}

      <AdminCard>
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={typeof params.q === 'string' ? params.q : ''}
            placeholder={t('admin.schemes.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              name="drafts"
              value="1"
              defaultChecked={showDrafts}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
            />
            {t('admin.schemes.draftsOnly')}
          </label>
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
              <TH>{t('admin.schemes.scheme')}</TH>
              <TH>{t('admin.schemes.category')}</TH>
              <TH>{t('admin.schemes.window')}</TH>
              <TH>{t('admin.schemes.status')}</TH>
              <TH>{t('admin.schemes.provenance')}</TH>
              <TH />
            </tr>
          }
          empty={
            filtered.length === 0 ? (
              <AdminEmpty
                title={t('admin.schemes.empty')}
                description={t('admin.schemes.emptyHelp')}
              />
            ) : undefined
          }
        >
          {filtered.map(({ row, scheme, status, daysRemaining }) => (
            <tr key={row.id} className="hover:bg-slate-900/60">
              <TD>
                <div className="font-medium text-slate-100">
                  {scheme ? localised(scheme.title, locale) : row.slug}
                </div>
                <div className="font-mono text-xs text-slate-500">{row.slug}</div>
              </TD>
              <TD>
                {isSchemeCategory(row.category)
                  ? localised(SCHEME_CATEGORY_LABELS[row.category], locale)
                  : row.category}
              </TD>
              <TD className="whitespace-nowrap text-xs">
                {row.is_always_open ? (
                  <span className="text-slate-400">{t('admin.schemes.alwaysOpen')}</span>
                ) : row.application_end_date ? (
                  <>
                    <span className="text-slate-300">
                      {formatIndianDate(row.application_start_date) ?? '—'} →{' '}
                      {formatIndianDate(row.application_end_date)}
                    </span>
                    {daysRemaining !== null ? (
                      <div className="text-slate-500">
                        {daysRemaining >= 0
                          ? t('admin.schemes.daysLeft', { days: daysRemaining })
                          : t('admin.schemes.daysAgo', { days: Math.abs(daysRemaining) })}
                      </div>
                    ) : null}
                  </>
                ) : (
                  // The catalogue's most common state, and the most actionable: no dates means the
                  // countdown on the operator's hub stays silent for this scheme.
                  <span className="text-amber-400">{t('admin.schemes.noWindow')}</span>
                )}
              </TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1">
                  {!scheme ? (
                    <AdminBadge tone="danger">{t('admin.schemes.invalid')}</AdminBadge>
                  ) : status ? (
                    <AdminBadge tone={STATUS_TONE[status]}>
                      {t(`admin.lifecycle.${status}`)}
                    </AdminBadge>
                  ) : null}
                  {row.is_published ? null : (
                    <AdminBadge tone="warning">{t('admin.schemes.draft')}</AdminBadge>
                  )}
                </div>
              </TD>
              <TD className="text-xs text-slate-500">
                {t(`admin.schemes.source.${row.source}`)}
                {row.verified_at ? (
                  <div>{t('admin.schemes.verifiedOn', {
                    date: formatIndianDate(row.verified_at) ?? '—',
                  })}</div>
                ) : null}
              </TD>
              <TD className="text-right">
                <Link
                  href={`/admin/schemes/${row.id}`}
                  className="text-sm font-medium text-sky-400 hover:text-sky-300"
                >
                  {canEdit ? t('common.edit') : t('common.view')}
                </Link>
              </TD>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      {missing.length > 0 ? (
        <AdminCard
          title={t('admin.schemes.builtInsTitle')}
          description={t('admin.schemes.builtInsSubtitle')}
        >
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {missing.map((scheme) => (
              <li
                key={scheme.slug}
                className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
              >
                <div className="truncate text-sm text-slate-200">
                  {localised(scheme.title, locale)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-slate-600">{scheme.slug}</span>
                  {canEdit ? <CopyBuiltInButton slug={scheme.slug} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </>
  );
}
