import { notFound as nextNotFound } from 'next/navigation';
import Link from 'next/link';
import { Badge, TBody, TD, TH, THead, TR, Table, cn, type Tone } from '@assistigo/ui';
import {
  CUSTOMER_FIELD_SECTIONS,
  fieldsInSection,
  formatIndianDate,
  isSensitiveField,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { customerValuesFromRow } from '@/lib/customers/values';
import { resolveRoamingAccess } from '@/lib/roaming/service';
import type { AuditLogRow, CustomerRow } from '@/lib/supabase/database.types';
import { buildCustomerSchemeReport } from '@/lib/schemes/service';
import { activityDetail } from '@/lib/customers/activity';
import { toReportView } from '@/lib/schemes/present';
import { CustomerSchemesWidget } from './customer-schemes-widget';
import { CustomerProfileSections, type ProfileSection } from './profile-sections';
import { CustomerDocuments } from './customer-documents';
import { CustomerApplications } from './customer-applications';
import { CustomerFillHistory } from './customer-fill-history';
import { AddProfileInfo } from './add-profile-info';
import { DeleteCustomerButton } from './delete-customer-button';
import { RoamingLockedCard } from './roaming-locked-card';
import { RoamingActiveBanner } from './roaming-active-banner';
import {
  DetailCard,
  DetailEmpty,
  OUTLINE_BUTTON,
  PROFILE_ANCHOR,
  PROFILE_EDIT_PARAM,
} from './detail-card';
import { CustomerAvatar } from '../customer-avatar';
import {
  ActivityIcon,
  BackIcon,
  EditIcon,
  NextIcon,
  NotesIcon,
  OperatorVerifiedIcon,
} from '../icons';

const VERIFICATION_TONE: Record<string, Tone> = {
  unverified: 'neutral',
  extracted: 'info',
  operator_verified: 'success',
  customer_confirmed: 'success',
  expired: 'warning',
  rejected: 'warning',
};

export const metadata = { title: 'Customer profile' };

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePagePermission('customer.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  /*
   * Cross-centre roaming (migration 0024): a customer id reachable from this dashboard is not
   * necessarily this centre's own. `resolveRoamingAccess` is the single place that tells
   * "my customer", "someone else's customer I have live consent to see" and "nothing here" apart
   * — the customer detail page and `GET /api/customers/:id` both defer to it rather than each
   * re-deriving the same three-way branch.
   */
  const access = await resolveRoamingAccess(
    { supabase, userId: session.userId, organization: { id: session.organization.id } },
    id,
  );

  if (access.state === 'roaming_locked') {
    if (!access.card) nextNotFound();
    return (
      <div className="space-y-6">
        <RoamingLockedCard customerId={id} card={access.card} topSchemes={access.topSchemes} />
      </div>
    );
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!customer) nextNotFound();

  const row = customer as CustomerRow;
  const values = customerValuesFromRow(row);
  const isRoaming = access.state === 'roaming_active';

  const [{ data: fieldValueRows }, { data: auditRows }] = await Promise.all([
    supabase
      .from('customer_field_values')
      .select('field_key, value_encrypted')
      .eq('customer_id', id),
    session.permissions.has('audit.view')
      ? supabase
          .from('audit_logs')
          .select('*')
          .eq('organization_id', session.organization.id)
          .eq('entity_type', 'customer')
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const encryptedFieldsPresent = new Set(
    (fieldValueRows ?? [])
      .filter((rowValue) => rowValue.value_encrypted)
      .map((rowValue) => rowValue.field_key as string),
  );

  // A roaming session grants a time-boxed *read*, never a write against another centre's
  // record: editing, uploading, and delete all stay behind the home-centre's own membership, so
  // none of these light up here even for an owner-level visiting role.
  const canReveal = session.permissions.has('customer.reveal_sensitive');
  const canUpdate = !isRoaming && session.permissions.has('customer.update');
  const canDelete = !isRoaming && session.permissions.has('customer.delete');
  const canUploadDocument = !isRoaming && session.permissions.has('document.upload');
  const auditLogs = (auditRows ?? []) as AuditLogRow[];

  // Matched here rather than in the widget: the evaluation is pure and synchronous, so it costs
  // nothing on this render, and the browser only ever receives the resulting strings.
  const schemeReport = toReportView(
    await buildCustomerSchemeReport(supabase, session.organization.id, row),
    locale,
    t,
    row.id,
  );

  const sectionsData: ProfileSection[] = CUSTOMER_FIELD_SECTIONS.map((section) => ({
    section,
    title: t(`customers.sections.${section}`),
    fields: fieldsInSection(section)
      .filter((field) => field.storage.kind !== 'derived')
      .map((field) => ({
        key: field.key,
        label: localised(field.label, locale),
        dataType: field.dataType,
        value: values[field.key] ?? null,
        sensitive: isSensitiveField(field.key),
        encrypted: field.storage.kind === 'encrypted',
        hasEncryptedValue: encryptedFieldsPresent.has(field.key),
        maxLength: field.maxLength ?? null,
        options: field.options
          ? field.options.map((option) => ({
              value: option.value,
              label: localised(option.label, locale),
            }))
          : null,
      })),
  }));

  // Field key → label, so the activity log names a revealed field rather than echoing its key.
  const fieldLabels = new Map(
    sectionsData.flatMap((section) =>
      section.fields.map((field) => [field.key, field.label] as const),
    ),
  );

  return (
    <div className="space-y-4">
      {isRoaming && access.session ? (
        <RoamingActiveBanner customerId={row.id} session={access.session} />
      ) : null}

      <nav aria-label={t('customers.profile.breadcrumb')} className="flex items-center gap-3 text-sm">
        <Link
          href="/customers"
          aria-label={t('common.back')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <BackIcon className="h-4 w-4" />
        </Link>
        <ol className="flex items-center gap-1.5 text-slate-500">
          <li>
            <Link href="/customers" className="hover:text-slate-800 hover:underline">
              {t('customers.title')}
            </Link>
          </li>
          <li aria-hidden>
            <NextIcon className="h-3.5 w-3.5" />
          </li>
          <li aria-current="page" className="font-medium text-slate-700">
            {row.customer_code}
          </li>
        </ol>
      </nav>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <CustomerAvatar id={row.id} name={row.full_name} className="h-14 w-14 text-lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-slate-900">{row.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{row.customer_code}</span>
              <span aria-hidden>•</span>
              <Badge tone={VERIFICATION_TONE[row.verification_status] ?? 'neutral'} className="gap-1">
                {row.verification_status === 'operator_verified' ||
                row.verification_status === 'customer_confirmed' ? (
                  <OperatorVerifiedIcon className="h-3 w-3" />
                ) : null}
                {row.verification_status in VERIFICATION_TONE
                  ? t(`customers.verification.${row.verification_status}`)
                  : row.verification_status}
              </Badge>
              {isRoaming ? <Badge tone="info">🌐 {t('customers.roaming.badge')}</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUpdate ? (
            <Link
              href={`?${PROFILE_EDIT_PARAM}=1#${PROFILE_ANCHOR}`}
              className={cn(OUTLINE_BUTTON, 'h-9 px-3.5 text-sm')}
            >
              <EditIcon className="h-4 w-4" />
              {t('customers.profile.editCustomer')}
            </Link>
          ) : null}
          {canDelete ? <DeleteCustomerButton customerId={row.id} /> : null}
        </div>
      </section>

      <CustomerSchemesWidget customerId={row.id} mobile={row.mobile} report={schemeReport} />

      <CustomerProfileSections
        customerId={row.id}
        customerCode={row.customer_code}
        sections={sectionsData}
        canUpdate={canUpdate}
        canReveal={canReveal}
      />

      {row.notes ? (
        <DetailCard icon={NotesIcon} tone="amber" title={t('customers.notes')}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
        </DetailCard>
      ) : null}

      {canUpdate || canUploadDocument ? (
        <AddProfileInfo
          customerId={row.id}
          canPaste={canUpdate}
          canUpload={canUploadDocument}
          canReview={session.permissions.has('extraction.review')}
        />
      ) : null}

      {session.permissions.has('document.view') ? (
        // The customer's own organization_id, not the caller's: for a roaming session that is
        // the home centre, and `documents_select` (migration 0024) admits the read via the
        // live grant either way.
        <CustomerDocuments
          customerId={row.id}
          organizationId={row.organization_id}
          canUpload={canUploadDocument}
          canDownload={session.permissions.has('document.download')}
        />
      ) : null}

      {/*
       * Applications and fill history stay home-centre-only: migration 0024 does not extend
       * `applications` or `fill_sessions` RLS for a roaming grant, so a visiting operator sees
       * only the profile and the documents they were given consent for — not another centre's
       * operational history for this citizen.
       */}
      {!isRoaming && session.permissions.has('application.view') ? (
        <CustomerApplications
          customerId={row.id}
          organizationId={session.organization.id}
          canCreate={session.permissions.has('application.create')}
        />
      ) : null}

      {!isRoaming && session.permissions.has('fill.run') ? (
        <CustomerFillHistory customerId={row.id} organizationId={session.organization.id} />
      ) : null}

      {session.permissions.has('audit.view') ? (
        <DetailCard
          icon={ActivityIcon}
          tone="orange"
          title={t('customers.auditTrail')}
          bodyClassName={auditLogs.length === 0 ? undefined : 'px-0 py-0'}
        >
          {auditLogs.length === 0 ? (
            <DetailEmpty title={t('customers.auditEmpty')} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">{t('customers.auditAction')}</TH>
                  <TH>{t('customers.profile.auditDetails')}</TH>
                  <TH className="pr-5">{t('customers.addedOn')}</TH>
                </TR>
              </THead>
              <TBody>
                {auditLogs.map((entry) => {
                  const detail = activityDetail(
                    entry.action,
                    entry.metadata,
                    (key) => fieldLabels.get(key) ?? null,
                  );
                  return (
                    <TR key={entry.id}>
                      <TD className="pl-5 font-medium text-slate-800">
                        {t(`audit.actions.${entry.action}`)}
                      </TD>
                      <TD className="text-slate-600">
                        {detail ? t(detail.key, detail.values) : '—'}
                      </TD>
                      <TD className="pr-5 text-slate-500">
                        {formatIndianDate(entry.created_at.slice(0, 10)) ?? '—'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </DetailCard>
      ) : null}
    </div>
  );
}
