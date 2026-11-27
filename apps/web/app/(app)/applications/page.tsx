import Link from 'next/link';
import { Badge, Card, EmptyState, Stat, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONE,
  formatIndianDate,
  OPEN_STATUSES,
  type ApplicationStatus,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  APPLICATION_CATEGORIES,
  APPLICATION_LIST_FILTERS,
  type ApplicationListFilter,
} from '@/lib/applications/schema';
import type { ApplicationCategory, ApplicationRow } from '@/lib/supabase/database.types';
import { ApplicationsFilters } from './applications-filters';

export const metadata = { title: 'Applications' };

const BUTTON_LINK =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const PAYMENT_TONE: Record<string, 'neutral' | 'success' | 'warning'> = {
  unpaid: 'warning',
  partial: 'warning',
  paid: 'success',
  refunded: 'neutral',
};

type ApplicationListRow = Pick<
  ApplicationRow,
  | 'id'
  | 'title'
  | 'category'
  | 'status'
  | 'portal_name'
  | 'portal_reference_number'
  | 'deadline_at'
  | 'amount_charged'
  | 'payment_status'
  | 'assigned_to'
  | 'customer_id'
  | 'created_at'
> & { customers: { full_name: string; customer_code: string } | null };

function isFilter(value: string | undefined): value is ApplicationListFilter {
  return Boolean(value) && (APPLICATION_LIST_FILTERS as readonly string[]).includes(value ?? '');
}

function isCategory(value: string | undefined): value is ApplicationCategory {
  return Boolean(value) && (APPLICATION_CATEGORIES as readonly string[]).includes(value ?? '');
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('application.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const filter: ApplicationListFilter = isFilter(params.filter as string | undefined)
    ? (params.filter as ApplicationListFilter)
    : 'all';
  const category = isCategory(params.category as string | undefined)
    ? (params.category as ApplicationCategory)
    : undefined;
  const q = typeof params.q === 'string' ? params.q.trim() : '';

  const terminalStatuses = (
    ['draft', 'pending_documents', 'ready_to_fill', 'filled', 'submitted', 'pending_followup', 'approved', 'rejected', 'cancelled'] as ApplicationStatus[]
  ).filter((status) => !OPEN_STATUSES.includes(status));

  const baseCount = () =>
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organization.id)
      .is('deleted_at', null);

  let listQuery = supabase
    .from('applications')
    .select(
      'id, title, category, status, portal_name, portal_reference_number, deadline_at, amount_charged, payment_status, assigned_to, customer_id, created_at, customers(full_name, customer_code)',
    )
    .eq('organization_id', session.organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filter === 'open') listQuery = listQuery.in('status', OPEN_STATUSES);
  else if (filter === 'completed') listQuery = listQuery.in('status', terminalStatuses);
  else if (filter === 'pending_documents' || filter === 'submitted') {
    listQuery = listQuery.eq('status', filter);
  }
  if (category) listQuery = listQuery.eq('category', category);
  if (q) {
    const like = `%${q}%`;
    listQuery = listQuery.or(
      `title.ilike.${like},portal_name.ilike.${like},portal_reference_number.ilike.${like}`,
    );
  }

  const [
    { data: applications },
    { count: openCount },
    { count: pendingDocsCount },
    { count: readyCount },
    { count: submittedCount },
    { count: completedCount },
  ] = await Promise.all([
    listQuery,
    baseCount().in('status', OPEN_STATUSES),
    baseCount().eq('status', 'pending_documents'),
    baseCount().eq('status', 'ready_to_fill'),
    baseCount().eq('status', 'submitted'),
    baseCount().in('status', terminalStatuses),
  ]);

  const rows = (applications ?? []) as unknown as ApplicationListRow[];
  const canCreate = session.permissions.has('application.create');
  const today = new Date().toISOString().slice(0, 10);

  const tabs: { key: ApplicationListFilter; label: string }[] = [
    { key: 'all', label: t('applications.filters.all') },
    { key: 'open', label: t('applications.filters.open') },
    { key: 'pending_documents', label: t('applications.filters.pendingDocuments') },
    { key: 'submitted', label: t('applications.filters.submitted') },
    { key: 'completed', label: t('applications.filters.completed') },
  ];

  const tabHref = (key: ApplicationListFilter) => {
    const search = new URLSearchParams();
    if (key !== 'all') search.set('filter', key);
    if (category) search.set('category', category);
    if (q) search.set('q', q);
    const qs = search.toString();
    return qs ? `/applications?${qs}` : '/applications';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('applications.title')}</h1>
        </div>
        {canCreate ? (
          <Link href="/applications/new" className={BUTTON_LINK}>
            {t('applications.new')}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t('applications.filters.open')} value={openCount ?? 0} />
        <Stat label={t('applications.filters.pendingDocuments')} value={pendingDocsCount ?? 0} />
        <Stat
          label={localised(APPLICATION_STATUS_LABELS.ready_to_fill, locale)}
          value={readyCount ?? 0}
        />
        <Stat label={t('applications.filters.submitted')} value={submittedCount ?? 0} />
        <Stat label={t('applications.filters.completed')} value={completedCount ?? 0} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (filter === tab.key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100')
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <ApplicationsFilters filter={filter} category={category} q={q} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={q || category ? t('applications.empty') : t('applications.emptyFirst')}
            action={
              canCreate ? (
                <Link href="/applications/new" className={BUTTON_LINK}>
                  {t('applications.new')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('applications.table.title')}</TH>
                <TH>{t('applications.table.customer')}</TH>
                <TH>{t('applications.table.portal')}</TH>
                <TH>{t('settings.status')}</TH>
                <TH>{t('applications.table.deadline')}</TH>
                <TH>{t('applications.table.payment')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((application) => {
                const overdue =
                  application.deadline_at !== null &&
                  application.deadline_at.slice(0, 10) < today;
                return (
                  <TR key={application.id}>
                    <TD>
                      <Link
                        href={`/applications/${application.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {application.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t(`applications.categories.${application.category}`)}
                      </p>
                    </TD>
                    <TD>
                      {application.customers ? (
                        <Link
                          href={`/customers/${application.customer_id}`}
                          className="text-slate-700 hover:underline"
                        >
                          {application.customers.full_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-slate-600">
                      {application.portal_name ?? '—'}
                      {application.portal_reference_number ? (
                        <p className="mt-0.5 font-mono text-xs text-slate-400">
                          {application.portal_reference_number}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge tone={APPLICATION_STATUS_TONE[application.status]}>
                        {localised(APPLICATION_STATUS_LABELS[application.status], locale)}
                      </Badge>
                    </TD>
                    <TD className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}>
                      {application.deadline_at
                        ? formatIndianDate(application.deadline_at.slice(0, 10))
                        : t('applications.deadlineNone')}
                      {overdue ? ` · ${t('applications.deadlineOverdue')}` : ''}
                    </TD>
                    <TD>
                      {application.payment_status ? (
                        <Badge tone={PAYMENT_TONE[application.payment_status] ?? 'neutral'}>
                          {t(`applications.payment.${application.payment_status}`)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">{t('applications.payment.none')}</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
