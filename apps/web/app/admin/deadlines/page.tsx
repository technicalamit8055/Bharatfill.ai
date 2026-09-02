import { resolveSchemeLifecycle } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadGlobalCatalog, type AdminSchemeListing } from '@/lib/admin/catalog';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { AdminCard, AdminEmpty, AdminNote, AdminPageHeader, AdminTable, TH } from '../ui';
import { DeadlineRow } from './deadline-row';

export const metadata = { title: 'Deadlines' };

/**
 * The live deadline board.
 *
 * The single highest-frequency task in this panel gets its own screen. A recruitment window moves
 * with every notification, and the alternative — opening each scheme's full editor to change one
 * date — is slow enough that the catalogue drifts, which is exactly the failure the whole scheme
 * hub is built to avoid: an operator quoting a countdown for a form that closed last week.
 *
 * Ordering is the argument for the page. Expired windows first, because a published scheme whose
 * deadline has passed is actively lying to every centre; then what is closing soonest; then
 * everything with no window at all, where a countdown is silent and could be earning.
 */
export default async function AdminDeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.deadlines.edit');
  const { t, locale } = await getTranslations();
  const params = await searchParams;

  const query = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase();
  const filter = typeof params.filter === 'string' ? params.filter : 'all';

  const today = new Date();
  const listings = await loadGlobalCatalog(session.supabase, today);

  const scored = listings
    .filter((listing) => listing.scheme !== null)
    .map((listing) => ({ listing, rank: deadlineRank(listing, today) }))
    .filter(({ listing, rank }) => {
      if (filter === 'expired' && rank.group !== 'expired') return false;
      if (filter === 'closing' && rank.group !== 'closing') return false;
      if (filter === 'undated' && rank.group !== 'undated') return false;
      if (!query) return true;
      const title = listing.scheme?.title.en ?? '';
      return `${listing.row.slug} ${title} ${listing.row.portal_name}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => a.rank.order - b.rank.order || a.rank.tiebreak - b.rank.tiebreak);

  const expiredCount = listings.filter(
    (listing) => listing.scheme && deadlineRank(listing, today).group === 'expired',
  ).length;

  const tabs = [
    { value: 'all', label: t('admin.deadlines.filterAll') },
    { value: 'expired', label: t('admin.deadlines.filterExpired') },
    { value: 'closing', label: t('admin.deadlines.filterClosing') },
    { value: 'undated', label: t('admin.deadlines.filterUndated') },
  ];

  return (
    <>
      <AdminPageHeader
        title={t('admin.deadlines.title')}
        description={t('admin.deadlines.subtitle')}
      />

      {expiredCount > 0 ? (
        <AdminNote tone="danger">
          {t('admin.deadlines.expiredWarning', { count: expiredCount })}
        </AdminNote>
      ) : (
        <AdminNote tone="success">{t('admin.deadlines.noExpired')}</AdminNote>
      )}

      <AdminCard>
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={typeof params.q === 'string' ? params.q : ''}
            placeholder={t('admin.deadlines.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <select
            name="filter"
            defaultValue={filter}
            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {tabs.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            {t('common.apply')}
          </button>
        </form>

        <AdminTable
          head={
            <tr>
              <TH className="w-1/3">{t('admin.deadlines.scheme')}</TH>
              <TH colSpan={2}>{t('admin.deadlines.window')}</TH>
            </tr>
          }
          empty={
            scored.length === 0 ? (
              <AdminEmpty
                title={t('admin.deadlines.empty')}
                description={t('admin.deadlines.emptyHelp')}
              />
            ) : undefined
          }
        >
          {scored.map(({ listing }) => (
            <DeadlineRow
              key={listing.row.id}
              schemeId={listing.row.id}
              title={listing.scheme ? localised(listing.scheme.title, locale) : listing.row.slug}
              slug={listing.row.slug}
              portalName={listing.row.portal_name}
              status={listing.status}
              daysRemaining={listing.daysRemaining}
              initial={{
                applicationStartDate: listing.row.application_start_date,
                applicationEndDate: listing.row.application_end_date,
                examDate: listing.row.exam_date,
                isAlwaysOpen: listing.row.is_always_open,
              }}
              readOnly={false}
            />
          ))}
        </AdminTable>
      </AdminCard>
    </>
  );
}

type DeadlineGroup = 'expired' | 'closing' | 'open' | 'upcoming' | 'undated' | 'evergreen';

/**
 * Where a scheme sits on this page's worklist.
 *
 * `order` is the group's position; `tiebreak` orders within it — soonest first for anything with
 * a date, alphabetical (by an always-present slug) for anything without one, so the list is
 * stable between renders.
 */
function deadlineRank(
  listing: AdminSchemeListing,
  asOfDate: Date,
): { group: DeadlineGroup; order: number; tiebreak: number } {
  const row = listing.row;

  if (row.is_always_open) return { group: 'evergreen', order: 5, tiebreak: 0 };

  if (!row.application_end_date && !row.application_start_date) {
    return { group: 'undated', order: 4, tiebreak: 0 };
  }

  const lifecycle = listing.scheme
    ? resolveSchemeLifecycle(listing.scheme.schedule, asOfDate)
    : null;
  const days = lifecycle?.daysRemaining ?? null;

  // Published and already closed: the worst state the catalogue can be in, so it sorts first and
  // the most overdue leads.
  if (lifecycle?.status === 'closed') {
    return { group: 'expired', order: 0, tiebreak: days ?? 0 };
  }
  if (lifecycle?.status === 'closing_soon') {
    return { group: 'closing', order: 1, tiebreak: days ?? 0 };
  }
  if (lifecycle?.status === 'upcoming') {
    return { group: 'upcoming', order: 3, tiebreak: lifecycle.daysUntilOpen ?? 0 };
  }
  return { group: 'open', order: 2, tiebreak: days ?? 9999 };
}
