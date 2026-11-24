import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';
import { Badge, Card, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONE,
  formatIndianDate,
  formatMobile,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  ApplicationDocumentRow,
  ApplicationRow,
  ApplicationStatusEventRow,
  FillSessionRow,
} from '@/lib/supabase/database.types';
import { StatusActions } from './status-actions';
import { Checklist } from './checklist';
import { EditApplicationPanel } from './edit-application-panel';
import { DeleteApplicationButton } from './delete-application-button';

const PAYMENT_TONE: Record<string, 'neutral' | 'success' | 'warning'> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'neutral',
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission('application.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data: application } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', session.organization.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!application) nextNotFound();
  const row = application as ApplicationRow;

  const [{ data: customer }, { data: documents }, { data: statusEvents }, { data: fillSessions }] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id, full_name, customer_code, mobile')
        .eq('id', row.customer_id)
        .maybeSingle(),
      supabase
        .from('application_documents')
        .select('*')
        .eq('organization_id', session.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('application_status_events')
        .select('*')
        .eq('organization_id', session.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fill_sessions')
        .select('id, status, page_origin, page_title, filled_fields_count, created_at')
        .eq('organization_id', session.organization.id)
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
    ]);

  const canUpdate = session.permissions.has('application.update');
  const canDelete = session.permissions.has('application.delete');
  const documentRows = (documents ?? []) as ApplicationDocumentRow[];
  const statusEventRows = (statusEvents ?? []) as ApplicationStatusEventRow[];
  const fillSessionRows = (fillSessions ?? []) as Pick<
    FillSessionRow,
    'id' | 'status' | 'page_origin' | 'page_title' | 'filled_fields_count' | 'created_at'
  >[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/applications"
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            ← {t('applications.title')}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{row.title}</h1>
            <Badge tone="neutral">{t(`applications.categories.${row.category}`)}</Badge>
            <Badge tone={APPLICATION_STATUS_TONE[row.status]}>
              {localised(APPLICATION_STATUS_LABELS[row.status], locale)}
            </Badge>
          </div>
        </div>
        {canDelete ? <DeleteApplicationButton applicationId={row.id} /> : null}
      </div>

      {canUpdate ? <StatusActions applicationId={row.id} status={row.status} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('applications.detail.customerCard')}>
          {customer ? (
            <div>
              <p className="text-sm font-medium text-slate-900">{customer.full_name}</p>
              {customer.mobile ? (
                <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                  {formatMobile(customer.mobile) ?? customer.mobile}
                </p>
              ) : null}
              <Link
                href={`/customers/${customer.id}`}
                className="mt-2 inline-block text-sm text-brand-700 hover:underline"
              >
                {t('applications.detail.viewProfile')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
        </Card>

        <Card title={t('applications.detail.portalCard')}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('applications.form.portalName')}</dt>
              <dd className="text-right text-slate-800">{row.portal_name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('applications.detail.referenceNumber')}</dt>
              <dd className="text-right font-mono text-slate-800">
                {row.portal_reference_number ?? t('applications.detail.referenceNumberNone')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('applications.detail.fee')}</dt>
              <dd className="text-right text-slate-800">
                {row.amount_charged !== null
                  ? `₹${row.amount_charged}`
                  : t('applications.detail.feeNone')}
              </dd>
            </div>
            {row.payment_status ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('applications.table.payment')}</dt>
                <dd>
                  <Badge tone={PAYMENT_TONE[row.payment_status] ?? 'neutral'}>
                    {t(`applications.payment.${row.payment_status}`)}
                  </Badge>
                </dd>
              </div>
            ) : null}
          </dl>
          {row.portal_url ? (
            <a
              href={row.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-brand-700 hover:underline"
            >
              {t('applications.detail.openPortal')}
            </a>
          ) : null}
        </Card>
      </div>

      {canUpdate ? <EditApplicationPanel application={row} /> : null}

      {row.notes ? (
        <Card title={t('applications.detail.notes')}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
        </Card>
      ) : null}

      <Checklist applicationId={row.id} documents={documentRows} canUpdate={canUpdate} />

      <Card title={t('applications.detail.statusHistory')}>
        {statusEventRows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('applications.detail.statusHistoryEmpty')}</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('customers.created')}</TH>
                <TH>{t('settings.status')}</TH>
              </TR>
            </THead>
            <TBody>
              {statusEventRows.map((event) => (
                <TR key={event.id}>
                  <TD className="text-slate-500">
                    {formatIndianDate(event.created_at.slice(0, 10)) ?? '—'}
                  </TD>
                  <TD>
                    {event.old_status ? (
                      <span className="text-slate-500">
                        {localised(APPLICATION_STATUS_LABELS[event.old_status], locale)} →{' '}
                      </span>
                    ) : null}
                    <Badge tone={APPLICATION_STATUS_TONE[event.new_status]}>
                      {localised(APPLICATION_STATUS_LABELS[event.new_status], locale)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title={t('applications.detail.linkedFillSessions')}>
        {fillSessionRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t('applications.detail.linkedFillSessionsEmpty')}
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('fillSessions.table.portal')}</TH>
                <TH>{t('settings.status')}</TH>
                <TH>{t('fillSessions.table.fields')}</TH>
                <TH>{t('customers.created')}</TH>
              </TR>
            </THead>
            <TBody>
              {fillSessionRows.map((fillSession) => (
                <TR key={fillSession.id}>
                  <TD>
                    <Link
                      href={`/fill-sessions/${fillSession.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {fillSession.page_title ?? fillSession.page_origin}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone="neutral">{t(`fillSessions.status.${fillSession.status}`)}</Badge>
                  </TD>
                  <TD className="text-slate-600">{fillSession.filled_fields_count}</TD>
                  <TD className="text-slate-500">
                    {formatIndianDate(fillSession.created_at.slice(0, 10)) ?? '—'}
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
