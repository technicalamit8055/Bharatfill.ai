import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  HardDrive,
  History,
  ListChecks,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { z } from 'zod';
import {
  APPLICATION_STATUS_LABELS,
  ORG_ROLE_LABELS,
  formatIndianDate,
  isApplicationStatus,
  isOrgRole,
} from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadTenantDetail } from '@/lib/admin/metrics';
import { loadPlatformAuditLog } from '@/lib/admin/audit-log';
import { formatBytes } from '@/lib/documents/format';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import {
  AdminAvatar,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminKeyValue,
  AdminLinkButton,
  AdminNote,
  AdminPageHeader,
  StatTile,
} from '../../ui';
import { formatConsoleDateTime } from '../../format';
import { TenantManagePanel, type PlanOption } from './tenant-manage-panel';

export const metadata = { title: 'Centre' };

/**
 * One centre: metadata, volumes and — for a Super Admin — the controls to suspend it or change
 * its plan.
 *
 * Every number comes from `platform_tenant_detail()` (0030): counts and organization properties,
 * no customer record. There is no link from here into the centre's data; reading that still
 * requires a support access grant (§19.9), which this screen does not issue.
 */
export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePlatformPagePermission('platform.tenants.view');
  const { t, locale } = await getTranslations();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const canSuspend = session.permissions.has('platform.tenants.manage');
  const canOverride = session.permissions.has('platform.billing.override');
  const canAudit = session.permissions.has('platform.audit.view');

  const [result, plansResult, history] = await Promise.all([
    loadTenantDetail(session.supabase, id),
    canOverride
      ? session.supabase
          .from('plans')
          .select('code, name, active, price_monthly_inr')
          .order('sort_order', { ascending: true })
          .order('price_monthly_inr', { ascending: true })
      : Promise.resolve({ data: [] }),
    canAudit
      ? loadPlatformAuditLog(session.supabase, { entity: id }, { pageSize: 8 })
      : Promise.resolve(null),
  ]);

  if (result.status === 'not_found') notFound();

  const back = (
    <AdminLinkButton href="/admin/tenants" variant="ghost">
      <ArrowLeft />
      {t('admin.tenants.backToList')}
    </AdminLinkButton>
  );

  if (result.status === 'unavailable') {
    return (
      <>
        <AdminPageHeader
          icon={<Building2 />}
          title={t('admin.tenants.detailTitle')}
          actions={back}
        />
        <AdminNote tone="warning" title={t('admin.tenants.migrationTitle')}>
          {t('admin.tenants.detailUnavailable')}
        </AdminNote>
      </>
    );
  }

  const detail = result.detail;
  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');
  const suspended = Boolean(detail.suspendedAt);
  const location = [detail.city, detail.district, detail.state].filter(Boolean).join(', ');

  const plans: PlanOption[] = (
    (plansResult.data ?? []) as {
      code: string;
      name: string;
      active: boolean;
      price_monthly_inr: number;
    }[]
  ).map((plan) => ({
    code: plan.code,
    name: plan.name,
    active: plan.active,
    price: Number(plan.price_monthly_inr),
  }));

  const roleEntries = Object.entries(detail.members.byRole).sort((a, b) => b[1] - a[1]);
  const statusEntries = Object.entries(detail.applicationsByStatus).sort((a, b) => b[1] - a[1]);
  const statusMax = Math.max(...statusEntries.map(([, value]) => value), 1);
  const usageEntries = Object.entries(detail.usageThisPeriod);

  return (
    <>
      <AdminPageHeader
        icon={<AdminAvatar label={detail.name} size="lg" />}
        title={detail.name}
        description={location || undefined}
        actions={back}
        meta={
          <>
            {suspended ? (
              <AdminBadge tone="danger" dot>
                {t('admin.tenants.statusSuspended')}
              </AdminBadge>
            ) : (
              <AdminBadge tone="success" dot>
                {t('admin.tenants.statusActive')}
              </AdminBadge>
            )}
            <AdminBadge tone="info">{detail.planCode}</AdminBadge>
            <AdminBadge>{t(`onboarding.businessTypes.${detail.businessType}`)}</AdminBadge>
            <span className="text-xs text-slate-500">
              {t('admin.tenants.since', { date: formatIndianDate(detail.createdAt) ?? '—' })}
            </span>
          </>
        }
      />

      {suspended ? (
        <AdminNote
          tone="danger"
          icon={<ShieldAlert />}
          title={t('admin.tenants.suspendedBanner', {
            date: formatConsoleDateTime(detail.suspendedAt, locale),
          })}
        >
          {detail.suspensionReason
            ? t('admin.tenants.suspendedReason', { reason: detail.suspensionReason })
            : null}
        </AdminNote>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile
          icon={<Users />}
          label={t('admin.tenants.detail.staff')}
          value={n(detail.members.active)}
          hint={t('admin.tenants.detail.invited', { count: n(detail.members.invited) })}
        />
        <StatTile
          icon={<Users />}
          label={t('admin.tenants.customers')}
          value={n(detail.volumes.customers)}
        />
        <StatTile
          icon={<FileText />}
          label={t('admin.tenants.detail.documents')}
          value={n(detail.volumes.documents)}
        />
        <StatTile
          icon={<ListChecks />}
          label={t('admin.tenants.applications')}
          value={n(detail.volumes.applications)}
        />
        <StatTile
          icon={<Activity />}
          tone={detail.volumes.fillSessions30d > 0 ? 'success' : 'neutral'}
          label={t('admin.tenants.fills30d')}
          value={n(detail.volumes.fillSessions30d)}
          hint={t('admin.tenants.detail.fieldsFilled', {
            count: n(detail.volumes.fieldsFilled30d),
          })}
        />
        <StatTile
          icon={<HardDrive />}
          label={t('admin.tenants.detail.storage')}
          value={formatBytes(detail.volumes.storageBytes)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <AdminCard icon={<Building2 />} title={t('admin.tenants.detail.profileTitle')}>
            <AdminKeyValue
              items={[
                {
                  label: t('admin.tenants.detail.businessType'),
                  value: t(`onboarding.businessTypes.${detail.businessType}`),
                },
                { label: t('admin.tenants.location'), value: location || '—' },
                {
                  label: t('admin.tenants.detail.language'),
                  value: detail.preferredLocale === 'hi' ? 'हिंदी' : 'English',
                },
                {
                  label: t('admin.tenants.detail.created'),
                  value: formatConsoleDateTime(detail.createdAt, locale),
                },
                {
                  label: t('admin.tenants.lastActivity'),
                  value: detail.lastActivityAt
                    ? formatConsoleDateTime(detail.lastActivityAt, locale)
                    : t('admin.tenants.never'),
                },
                {
                  label: t('admin.tenants.detail.organizationId'),
                  value: <span className="font-mono text-xs text-slate-400">{detail.id}</span>,
                },
              ]}
            />
          </AdminCard>

          <AdminCard icon={<ListChecks />} title={t('admin.tenants.detail.applicationsTitle')}>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.overview.noData')}</p>
            ) : (
              <ul className="space-y-2.5">
                {statusEntries.map(([status, count]) => (
                  <li key={status} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm text-slate-400">
                      {isApplicationStatus(status)
                        ? localised(APPLICATION_STATUS_LABELS[status], locale)
                        : status}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <span
                        className="block h-full rounded-full bg-sky-500/70"
                        style={{ width: `${Math.max((count / statusMax) * 100, 2)}%` }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-300">
                      {n(count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          {history ? (
            <AdminCard
              flush
              icon={<History />}
              title={t('admin.tenants.detail.historyTitle')}
              description={t('admin.tenants.detail.historySubtitle')}
              actions={
                history.total > history.entries.length ? (
                  <Link
                    href={`/admin/audit?entity=${detail.id}`}
                    className="text-xs font-medium text-sky-300 hover:text-sky-200"
                  >
                    {t('admin.overview.viewAll')}
                  </Link>
                ) : null
              }
            >
              {history.entries.length === 0 ? (
                <AdminEmpty icon={<History />} title={t('admin.tenants.detail.historyEmpty')} />
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {history.entries.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <AdminAvatar label={entry.actorEmail ?? 'system'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{entry.description}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {entry.actorEmail ?? t('admin.audit.unknownActor')} ·{' '}
                          {formatConsoleDateTime(entry.createdAt, locale)}
                        </p>
                      </div>
                      <AdminBadge tone={entry.sensitivity === 'critical' ? 'danger' : 'neutral'}>
                        {t(`admin.audit.sensitivity.${entry.sensitivity}`)}
                      </AdminBadge>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <AdminCard icon={<CreditCard />} title={t('admin.tenants.detail.subscriptionTitle')}>
            {detail.subscription ? (
              <AdminKeyValue
                items={[
                  { label: t('admin.tenants.plan'), value: detail.subscription.planCode },
                  {
                    label: t('admin.tenants.status'),
                    value: <AdminBadge tone="info">{detail.subscription.status}</AdminBadge>,
                  },
                  {
                    label: t('admin.tenants.detail.provider'),
                    value: t(`admin.tenants.detail.providers.${detail.subscription.provider}`),
                  },
                  {
                    label: t('admin.tenants.detail.periodEnd'),
                    value: detail.subscription.currentPeriodEnd
                      ? formatIndianDate(detail.subscription.currentPeriodEnd)
                      : t('admin.tenants.detail.noEnd'),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-slate-400">
                {t('admin.tenants.detail.noSubscription', { plan: detail.planCode })}
              </p>
            )}

            <div className="mt-5 border-t border-slate-800/80 pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {t('admin.tenants.detail.usageTitle')}
              </p>
              {usageEntries.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {t('admin.tenants.detail.usageEmpty')}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {usageEntries.map(([type, total]) => (
                    <li key={type} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">
                        {t(`admin.tenants.detail.usage.${type}`)}
                      </span>
                      <span className="tabular-nums text-slate-200">{n(total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AdminCard>

          <AdminCard icon={<Users />} title={t('admin.tenants.detail.teamTitle')}>
            {roleEntries.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.overview.noData')}</p>
            ) : (
              <ul className="space-y-1.5">
                {roleEntries.map(([role, count]) => (
                  <li key={role} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">
                      {isOrgRole(role) ? localised(ORG_ROLE_LABELS[role], locale) : role}
                    </span>
                    <span className="tabular-nums text-slate-200">{n(count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          {canSuspend || canOverride ? (
            <TenantManagePanel
              organizationId={detail.id}
              organizationName={detail.name}
              suspended={suspended}
              currentPlanCode={detail.planCode}
              paidProvider={
                detail.subscription && !['mock', 'manual'].includes(detail.subscription.provider)
                  ? detail.subscription.provider
                  : null
              }
              plans={plans}
              canSuspend={canSuspend}
              canOverride={canOverride}
            />
          ) : (
            <AdminNote>{t('admin.tenants.manage.readOnly')}</AdminNote>
          )}
        </div>
      </div>

      <AdminNote>{t('admin.tenants.privacyNote')}</AdminNote>
    </>
  );
}
