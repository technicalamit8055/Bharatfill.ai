import {
  BUILT_IN_ADAPTERS,
  PORTAL_TARGETS,
  groupContributions,
  mergeAdapters,
  portalAdapterSchema,
  portalTargetForOrigin,
  selectAdapter,
  type PortalAdapter,
  type StoredContribution,
} from '@assistigo/form-engine';
import { getCustomerField } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import type { MappingContributionRow, PortalAdapterRow } from '@/lib/supabase/database.types';
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminPageHeader, AdminTable, TD, TH } from '../../ui';
import { formatConsoleDateTime } from '../../format';
import { ContributionCard, type ContributionCardItem } from './contribution-card';

export const metadata = { title: 'Taught mappings' };

const QUEUE_LIMIT = 2000;

/**
 * Operator-taught mappings waiting for review, and how far the top portals are covered.
 * docs/FORM_ENGINE.md §6c.
 *
 * Centres are counted, never named: which centre taught what is tenant data, and the reviewer's
 * decision does not need it — agreement across centres is the signal.
 */
export default async function AdminContributionsPage() {
  const session = await requirePlatformPagePermission('platform.forms.view');
  const { t, locale } = await getTranslations();

  const [contributionsResult, adaptersResult, countsResult] = await Promise.all([
    session.supabase
      .from('mapping_contributions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(QUEUE_LIMIT),
    session.supabase
      .from('portal_adapters')
      .select('*')
      .is('organization_id', null)
      .neq('status', 'deprecated'),
    session.supabase.from('mapping_contributions').select('status, page_origin'),
  ]);

  const rows = (contributionsResult.data ?? []) as MappingContributionRow[];
  const stored: StoredContribution[] = rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    contribution: {
      pageOrigin: row.page_origin,
      pathPattern: row.path_pattern,
      fieldSignature: row.field_signature,
      tagName: row.tag_name,
      inputType: row.input_type,
      labelText: row.label_text,
      ariaLabel: row.aria_label,
      placeholder: row.placeholder,
      sectionHeading: row.section_heading,
      nameAttribute: row.name_attribute,
      idAttribute: row.id_attribute,
      customerField: row.customer_field,
    },
  }));

  const databaseAdapters = ((adaptersResult.data ?? []) as PortalAdapterRow[])
    .map((row) =>
      portalAdapterSchema.safeParse({
        id: row.id,
        slug: row.slug,
        portalName: row.portal_name,
        formName: row.form_name,
        urlPatterns: row.url_patterns,
        version: row.version,
        status: row.status,
        fields: row.field_mappings,
        documentRequirements: row.document_requirements,
      }),
    )
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data as PortalAdapter);
  const adapters = mergeAdapters(databaseAdapters, BUILT_IN_ADAPTERS);

  const fieldLabel = (key: string) => {
    const def = getCustomerField(key);
    return def ? (locale === 'hi' ? def.label.hi : def.label.en) : key;
  };

  const groups = groupContributions(stored);
  const items: ContributionCardItem[] = groups.map((group) => {
    const c = group.latest;
    const adapter = selectAdapter(adapters, c.pageOrigin, c.pathPattern.replace(/\*/g, '0'));
    return {
      ids: group.ids,
      pageOrigin: c.pageOrigin,
      pathPattern: c.pathPattern,
      labelText: c.labelText ?? c.ariaLabel ?? c.placeholder,
      sectionHeading: c.sectionHeading,
      attribute: c.nameAttribute ?? c.idAttribute,
      inputType: c.inputType,
      customerField: c.customerField,
      customerFieldLabel: fieldLabel(c.customerField),
      centres: group.centres,
      lastSeen: formatConsoleDateTime(group.lastSeen, locale),
      conflicts: group.conflicts.map((conflict) => ({
        ...conflict,
        label: fieldLabel(conflict.customerField),
      })),
      targetAdapter: adapter ? `${adapter.portalName} · ${adapter.slug} ${adapter.version}` : null,
    };
  });

  // Coverage: per target portal, whether an adapter exists and how much is waiting.
  const allRows = (countsResult.data ?? []) as Pick<MappingContributionRow, 'status' | 'page_origin'>[];
  const pendingByTarget = new Map<string, number>();
  const approvedByTarget = new Map<string, number>();
  let untargeted = 0;
  for (const row of allRows) {
    const target = portalTargetForOrigin(row.page_origin);
    if (!target) {
      if (row.status === 'pending') untargeted += 1;
      continue;
    }
    const bucket = row.status === 'pending' ? pendingByTarget : row.status === 'approved' ? approvedByTarget : null;
    bucket?.set(target.code, (bucket.get(target.code) ?? 0) + 1);
  }

  const coverage = PORTAL_TARGETS.map((target) => {
    const covering = adapters.filter((adapter) =>
      adapter.urlPatterns.some((pattern) =>
        target.hosts.some((host) => {
          const hostOnly = host.replace(/^https?:\/\//, '').replace(/^\*\./, '');
          return pattern.includes(hostOnly);
        }),
      ),
    );
    return {
      target,
      adapters: covering,
      pending: pendingByTarget.get(target.code) ?? 0,
      approved: approvedByTarget.get(target.code) ?? 0,
    };
  });
  const coveredCount = coverage.filter((entry) => entry.adapters.length > 0).length;
  const canReview = session.permissions.has('platform.forms.edit');

  return (
    <>
      <AdminPageHeader
        title={t('admin.contributions.title')}
        description={t('admin.contributions.subtitle')}
        meta={
          <>
            <AdminBadge tone={items.length > 0 ? 'warning' : 'neutral'}>
              {t('admin.contributions.pendingCount', { count: items.length })}
            </AdminBadge>
            <AdminBadge tone="info">
              {t('admin.contributions.coverageCount', {
                covered: coveredCount,
                total: PORTAL_TARGETS.length,
              })}
            </AdminBadge>
          </>
        }
      />

      <AdminNote>{t('admin.contributions.safetyNote')}</AdminNote>

      <AdminCard title={t('admin.contributions.queueTitle')}>
        {items.length === 0 ? (
          <AdminEmpty
            title={t('admin.contributions.empty')}
            description={t('admin.contributions.emptyHelp')}
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ContributionCard key={item.ids[0]} item={item} canReview={canReview} />
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title={t('admin.contributions.coverageTitle')}
        description={t('admin.contributions.coverageHelp')}
        flush
      >
        <AdminTable
          head={
            <tr>
              <TH>{t('admin.contributions.portal')}</TH>
              <TH>{t('admin.contributions.adapterColumn')}</TH>
              <TH className="text-right">{t('admin.contributions.pendingColumn')}</TH>
              <TH className="text-right">{t('admin.contributions.approvedColumn')}</TH>
            </tr>
          }
        >
          {coverage.map(({ target, adapters: covering, pending, approved }) => (
            <tr key={target.code}>
              <TD>
                <div className="font-medium text-slate-100">{target.name}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {target.hosts.join(', ')}
                  {target.hostsVerified ? null : ` · ${t('admin.contributions.hostsUnverified')}`}
                </div>
              </TD>
              <TD>
                {covering.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {covering.map((adapter) => (
                      <AdminBadge key={adapter.slug} tone={adapter.status === 'active' ? 'success' : 'info'}>
                        {adapter.slug} · {t(`formLibrary.status.${adapter.status}`)}
                      </AdminBadge>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{t('admin.contributions.noAdapter')}</span>
                )}
              </TD>
              <TD className="text-right tabular-nums">{pending}</TD>
              <TD className="text-right tabular-nums">{approved}</TD>
            </tr>
          ))}
        </AdminTable>
        {untargeted > 0 ? (
          <p className="px-4 py-3 text-xs text-slate-500">
            {t('admin.contributions.untargeted', { count: untargeted })}
          </p>
        ) : null}
      </AdminCard>
    </>
  );
}
