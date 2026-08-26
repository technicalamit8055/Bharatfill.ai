import Link from 'next/link';
import { Badge, Card, EmptyState, Stat, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatIndianDate } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FillSessionRow } from '@/lib/supabase/database.types';
import { FillSessionsFilters } from './fill-sessions-filters';

export const metadata = { title: 'Fill sessions' };

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  detected: 'neutral',
  reviewed: 'info',
  filled: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

const SECONDS_SAVED_PER_FIELD = 12;

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

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
> & { customers: { full_name: string; customer_code: string } | null };

export default async function FillSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('fill.run');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const statusFilter = typeof params.status === 'string' ? params.status : '';
  const q = typeof params.q === 'string' ? params.q.trim() : '';

  let listQuery = supabase
    .from('fill_sessions')
    .select(
      'id, customer_id, application_id, page_origin, page_title, status, filled_fields_count, ' +
        'skipped_fields_count, proposed_fields_count, captcha_fields_count, otp_fields_count, ' +
        'payment_fields_count, created_at, customers(full_name, customer_code)',
    )
    .eq('organization_id', session.organization.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (statusFilter) listQuery = listQuery.eq('status', statusFilter);
  if (q) {
    const like = `%${q}%`;
    listQuery = listQuery.or(`page_title.ilike.${like},page_origin.ilike.${like}`);
  }

  const [{ data: rows }, { count: totalSessions }, { data: recentCounts }] = await Promise.all([
    listQuery,
    supabase
      .from('fill_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organization.id),
    supabase
      .from('fill_sessions')
      .select('status, filled_fields_count')
      .eq('organization_id', session.organization.id)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const sessions = (rows ?? []) as unknown as FillSessionListRow[];
  const countedSessions = recentCounts ?? [];
  const fieldsFilled = countedSessions.reduce((sum, row) => sum + (row.filled_fields_count ?? 0), 0);
  const decidedSessions = countedSessions.filter((row) =>
    ['filled', 'reviewed', 'failed'].includes(row.status),
  );
  const reviewAccuracy =
    decidedSessions.length === 0
      ? null
      : Math.round(
          (decidedSessions.filter((row) => row.status === 'filled').length / decidedSessions.length) *
            100,
        );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('fillSessions.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('fillSessions.subtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('fillSessions.summary.totalSessions')} value={totalSessions ?? 0} />
        <Stat label={t('fillSessions.summary.fieldsFilled')} value={fieldsFilled} />
        <Stat
          label={t('fillSessions.summary.reviewAccuracy')}
          value={reviewAccuracy === null ? '—' : `${reviewAccuracy}%`}
        />
        <Stat
          label={t('fillSessions.summary.timeSaved')}
          value={formatDuration(fieldsFilled * SECONDS_SAVED_PER_FIELD)}
        />
      </div>

      <FillSessionsFilters status={statusFilter} q={q} />

      <Card>
        {sessions.length === 0 ? (
          <EmptyState title={q || statusFilter ? t('fillSessions.empty') : t('fillSessions.emptyFirst')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('fillSessions.table.when')}</TH>
                <TH>{t('fillSessions.table.customer')}</TH>
                <TH>{t('fillSessions.table.portal')}</TH>
                <TH>{t('settings.status')}</TH>
                <TH>{t('fillSessions.table.fields')}</TH>
                <TH>{t('fillSessions.table.safety')}</TH>
                <TH>{t('fillSessions.table.application')}</TH>
              </TR>
            </THead>
            <TBody>
              {sessions.map((row) => (
                <TR key={row.id}>
                  <TD className="text-slate-500">
                    {formatIndianDate(row.created_at.slice(0, 10)) ?? '—'}
                  </TD>
                  <TD>
                    {row.customers ? (
                      <Link href={`/customers/${row.customer_id}`} className="text-slate-700 hover:underline">
                        {row.customers.full_name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="max-w-[16rem] truncate">
                    <Link
                      href={`/fill-sessions/${row.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {row.page_title ?? row.page_origin}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                      {t(`fillSessions.status.${row.status}`)}
                    </Badge>
                  </TD>
                  <TD className="text-slate-600">
                    {t('fillSessions.fieldsRatio', {
                      filled: row.filled_fields_count,
                      total: row.proposed_fields_count,
                    })}
                    {row.skipped_fields_count > 0 ? (
                      <p className="text-xs text-slate-400">
                        {t('fillSessions.fieldsSkipped', { count: row.skipped_fields_count })}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {row.captcha_fields_count > 0 ? (
                        <Badge tone="warning">{t('fillSessions.safety.captcha')}</Badge>
                      ) : null}
                      {row.otp_fields_count > 0 ? (
                        <Badge tone="warning">{t('fillSessions.safety.otp')}</Badge>
                      ) : null}
                      {row.payment_fields_count > 0 ? (
                        <Badge tone="warning">{t('fillSessions.safety.payment')}</Badge>
                      ) : null}
                    </div>
                  </TD>
                  <TD>
                    {row.application_id ? (
                      <Link
                        href={`/applications/${row.application_id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {t('fillSessions.viewApplication')}
                      </Link>
                    ) : (
                      <Link
                        href={`/fill-sessions/${row.id}`}
                        className="text-slate-500 hover:underline"
                      >
                        {t('fillSessions.createApplication')}
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
