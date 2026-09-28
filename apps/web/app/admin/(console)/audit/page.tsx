import Link from 'next/link';
import { Filter, ScrollText } from 'lucide-react';
import { AUDIT_SENSITIVITY } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import {
  AUDIT_PAGE_SIZE,
  auditFiltersSchema,
  loadPlatformAuditLog,
  loadRosterDirectory,
  platformAuditActions,
} from '@/lib/admin/audit-log';
import { getTranslations } from '@/lib/i18n/server';
import {
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminField,
  AdminInput,
  AdminLinkButton,
  AdminNote,
  AdminPageHeader,
  AdminPagination,
  AdminSelect,
  AdminTable,
  TD,
  TH,
  type Tone,
} from '../ui';
import { formatConsoleDateTime } from '../format';

export const metadata = { title: 'Audit log' };

const SENSITIVITY_TONE: Record<string, Tone> = {
  normal: 'neutral',
  sensitive: 'warning',
  critical: 'danger',
};

/**
 * The platform audit trail: every sign-in, grant, publish, suspension and override staff have
 * made, newest first.
 *
 * Platform rows only (lib/admin/audit-log.ts). A centre's own trail — what its operators did to
 * its customers — is not reachable from any filter here. The log is append-only in the database
 * (0008), so there is nothing on this screen that edits or deletes an entry.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.audit.view');
  const { t, locale } = await getTranslations();
  const filters = auditFiltersSchema.parse(await searchParams);

  const directory = await loadRosterDirectory(session.supabase);
  const { entries, total, failed } = await loadPlatformAuditLog(session.supabase, filters, {
    directory,
  });

  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');
  const actions = platformAuditActions();
  const actors = [...directory.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = Boolean(
    filters.action ||
    filters.sensitivity ||
    filters.actor ||
    filters.entity ||
    filters.from ||
    filters.to,
  );

  const hrefForPage = (page: number) => {
    const query = new URLSearchParams();
    for (const key of ['action', 'sensitivity', 'actor', 'entity', 'from', 'to'] as const) {
      const value = filters[key];
      if (value) query.set(key, value);
    }
    if (page > 1) query.set('page', String(page));
    const qs = query.toString();
    return qs ? `/admin/audit?${qs}` : '/admin/audit';
  };

  const first = (filters.page - 1) * AUDIT_PAGE_SIZE + 1;
  const last = first + entries.length - 1;

  return (
    <>
      <AdminPageHeader
        icon={<ScrollText />}
        title={t('admin.audit.title')}
        description={t('admin.audit.subtitle')}
        meta={<AdminBadge>{t('admin.audit.totalCount', { count: n(total) })}</AdminBadge>}
      />

      {failed ? <AdminNote tone="danger">{t('admin.audit.loadFailed')}</AdminNote> : null}

      <AdminCard icon={<Filter />} title={t('admin.audit.filtersTitle')}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <AdminField label={t('admin.audit.action')} className="lg:col-span-2">
            <AdminSelect name="action" defaultValue={filters.action ?? ''}>
              <option value="">{t('admin.audit.allActions')}</option>
              {actions.map((item) => (
                <option key={item.action} value={item.action}>
                  {item.description}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t('admin.audit.actor')}>
            <AdminSelect name="actor" defaultValue={filters.actor ?? ''}>
              <option value="">{t('admin.audit.anyone')}</option>
              {actors.map(([userId, email]) => (
                <option key={userId} value={userId}>
                  {email}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t('admin.audit.sensitivityLabel')}>
            <AdminSelect name="sensitivity" defaultValue={filters.sensitivity ?? ''}>
              <option value="">{t('admin.audit.anySensitivity')}</option>
              {AUDIT_SENSITIVITY.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.audit.sensitivity.${value}`)}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t('admin.audit.from')}>
            <AdminInput type="date" name="from" defaultValue={filters.from ?? ''} />
          </AdminField>
          <AdminField label={t('admin.audit.to')}>
            <AdminInput type="date" name="to" defaultValue={filters.to ?? ''} />
          </AdminField>
          {filters.entity ? <input type="hidden" name="entity" value={filters.entity} /> : null}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
            <AdminButton type="submit" variant="primary">
              {t('admin.audit.apply')}
            </AdminButton>
            {filtered ? (
              <AdminLinkButton href="/admin/audit" variant="ghost">
                {t('admin.audit.clear')}
              </AdminLinkButton>
            ) : null}
            {filters.entity ? (
              <AdminBadge tone="info">
                {t('admin.audit.entityFilter', { id: filters.entity.slice(0, 8) })}
              </AdminBadge>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">{t('admin.audit.timezoneNote')}</span>
          </div>
        </form>
      </AdminCard>

      <AdminCard flush>
        <AdminTable
          minWidth={920}
          head={
            <tr>
              <TH>{t('admin.audit.when')}</TH>
              <TH>{t('admin.audit.actor')}</TH>
              <TH>{t('admin.audit.event')}</TH>
              <TH>{t('admin.audit.target')}</TH>
              <TH>{t('admin.audit.sensitivityLabel')}</TH>
              <TH>{t('admin.audit.details')}</TH>
            </tr>
          }
          empty={
            entries.length === 0 ? (
              <AdminEmpty
                icon={<ScrollText />}
                title={filtered ? t('admin.audit.emptyFiltered') : t('admin.audit.empty')}
              />
            ) : undefined
          }
        >
          {entries.map((entry) => (
            <tr key={entry.id} className="align-top transition-colors hover:bg-slate-900/60">
              <TD className="whitespace-nowrap text-xs text-slate-400">
                {formatConsoleDateTime(entry.createdAt, locale)}
              </TD>
              <TD>
                <div className="flex items-center gap-2.5">
                  <AdminAvatar label={entry.actorEmail ?? entry.actorType} size="sm" />
                  <div className="min-w-0">
                    <div className="max-w-[14rem] truncate text-sm text-slate-200">
                      {entry.actorEmail ??
                        (entry.actorUserId ? t('admin.audit.nonStaff') : t('admin.audit.system'))}
                    </div>
                    {entry.ipAddress ? (
                      <div className="font-mono text-[11px] text-slate-600">{entry.ipAddress}</div>
                    ) : null}
                  </div>
                </div>
              </TD>
              <TD>
                <div className="text-sm text-slate-100">{entry.description}</div>
                <div className="font-mono text-[11px] text-slate-500">{entry.action}</div>
              </TD>
              <TD className="text-xs">
                <div className="text-slate-400">{entry.entityType}</div>
                {entry.entityId ? (
                  entry.entityType === 'organization' ? (
                    <Link
                      href={`/admin/tenants/${entry.entityId}`}
                      className="font-mono text-sky-300 hover:text-sky-200"
                    >
                      {entry.entityId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <span className="font-mono text-slate-500">{entry.entityId.slice(0, 8)}…</span>
                  )
                ) : null}
              </TD>
              <TD>
                <AdminBadge tone={SENSITIVITY_TONE[entry.sensitivity] ?? 'neutral'}>
                  {t(`admin.audit.sensitivity.${entry.sensitivity}`)}
                </AdminBadge>
              </TD>
              <TD className="max-w-xs">
                {entry.metadata &&
                typeof entry.metadata === 'object' &&
                Object.keys(entry.metadata).length > 0 ? (
                  <details className="group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-slate-400 hover:text-slate-200">
                      {t('admin.audit.showMetadata')}
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 ring-1 ring-inset ring-slate-800">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </TD>
            </tr>
          ))}
        </AdminTable>

        <AdminPagination
          summary={
            entries.length === 0
              ? t('admin.tenants.noResults')
              : t('admin.tenants.showingRange', { from: n(first), to: n(last), total: n(total) })
          }
          previousHref={filters.page > 1 ? hrefForPage(filters.page - 1) : null}
          nextHref={last < total ? hrefForPage(filters.page + 1) : null}
          previousLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </AdminCard>

      <AdminNote>{t('admin.audit.privacyNote')}</AdminNote>
    </>
  );
}
