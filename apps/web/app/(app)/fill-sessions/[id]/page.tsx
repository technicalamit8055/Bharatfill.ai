import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';
import { Alert, Badge, Card, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatIndianDate } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FillSessionFieldRow, FillSessionRow } from '@/lib/supabase/database.types';
import { CreateApplicationButton } from './create-application-button';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  detected: 'neutral',
  reviewed: 'info',
  filled: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

const ACTION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  filled: 'success',
  skipped: 'neutral',
  edited: 'info',
  failed: 'danger',
};

const SAFETY_TONE: Record<string, 'neutral' | 'warning'> = {
  normal: 'neutral',
  captcha: 'warning',
  otp: 'warning',
  payment: 'warning',
  submit: 'neutral',
};

export default async function FillSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission('fill.run');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data: fillSession } = await supabase
    .from('fill_sessions')
    .select('*, customers(id, full_name, customer_code)')
    .eq('id', id)
    .eq('organization_id', session.organization.id)
    .maybeSingle();

  if (!fillSession) nextNotFound();

  const row = fillSession as unknown as FillSessionRow & {
    customers: { id: string; full_name: string; customer_code: string } | null;
  };

  const { data: fields } = await supabase
    .from('fill_session_fields')
    .select('*')
    .eq('organization_id', session.organization.id)
    .eq('fill_session_id', id)
    .order('created_at', { ascending: true });

  const fieldRows = (fields ?? []) as FillSessionFieldRow[];
  const canCreateApplication = session.permissions.has('application.create');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/fill-sessions"
          className="text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          ← {t('fillSessions.detail.back')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">
            {row.page_title ?? row.page_origin}
          </h1>
          <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
            {t(`fillSessions.status.${row.status}`)}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{row.page_origin}</p>
      </div>

      {row.error_summary ? <Alert tone="danger">{row.error_summary}</Alert> : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('fillSessions.table.customer')}
            </p>
            {row.customers ? (
              <Link
                href={`/customers/${row.customers.id}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {row.customers.full_name}
              </Link>
            ) : (
              <p className="text-sm text-slate-700">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('customers.created')}
            </p>
            <p className="text-sm text-slate-700">
              {formatIndianDate(row.created_at.slice(0, 10)) ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('fillSessions.detail.extensionVersion')}
            </p>
            <p className="text-sm text-slate-700">{row.extension_version ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('fillSessions.table.application')}
            </p>
            {row.application_id ? (
              <Link
                href={`/applications/${row.application_id}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {t('fillSessions.viewApplication')}
              </Link>
            ) : canCreateApplication ? (
              <CreateApplicationButton
                fillSessionId={row.id}
                defaultTitle={row.page_title ?? row.page_origin}
              />
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>
        </div>
      </Card>

      <Card title={t('fillSessions.detail.fieldsTitle')}>
        {fieldRows.length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('fillSessions.detail.fieldLabel')}</TH>
                <TH>{t('fillSessions.detail.mappedField')}</TH>
                <TH>{t('fillSessions.detail.mappingSource')}</TH>
                <TH>{t('fillSessions.detail.confidence')}</TH>
                <TH>{t('fillSessions.detail.preview')}</TH>
                <TH>{t('fillSessions.detail.action')}</TH>
                <TH>{t('fillSessions.detail.safetyClass')}</TH>
              </TR>
            </THead>
            <TBody>
              {fieldRows.map((field) => (
                <TR key={field.id}>
                  <TD className="text-slate-700">{field.field_label ?? field.field_signature}</TD>
                  <TD className="font-mono text-xs text-slate-600">
                    {field.mapped_customer_field ?? t('fillSessions.detail.notMapped')}
                  </TD>
                  <TD className="text-slate-500">
                    {field.mapping_source ? t(`fillSessions.mappingSource.${field.mapping_source}`) : '—'}
                  </TD>
                  <TD className="tabular-nums text-slate-500">
                    {field.confidence === null ? '—' : `${Math.round(field.confidence * 100)}%`}
                  </TD>
                  <TD className="masked-value font-mono text-xs text-slate-600">
                    {field.proposed_value_preview ?? '—'}
                  </TD>
                  <TD>
                    <Badge tone={ACTION_TONE[field.action] ?? 'neutral'}>
                      {t(`fillSessions.fieldAction.${field.action}`)}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={SAFETY_TONE[field.safety_class] ?? 'neutral'}>
                      {t(`fillSessions.safetyClass.${field.safety_class}`)}
                    </Badge>
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
