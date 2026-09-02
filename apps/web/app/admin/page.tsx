import Link from 'next/link';
import { ORG_ROLE_LABELS, formatIndianDate, isOrgRole } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadPlatformMetrics } from '@/lib/admin/metrics';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { AdminCard, AdminNote, AdminPageHeader, StatTile } from './ui';

export const metadata = { title: 'Overview' };

const WINDOW_DAYS = 30;

/**
 * Platform analytics.
 *
 * Everything here comes from `platform_metrics()` — one reviewable SQL function that returns
 * counts and nothing else (0021). There is no drill-down from any number on this page to a
 * customer record, and that is the design: spec §6.1 gives internal staff organization metadata,
 * usage and error reports, and stops there.
 */
export default async function AdminOverviewPage() {
  const session = await requirePlatformPagePermission('platform.analytics.view');
  const { t, locale } = await getTranslations();
  const { metrics, live } = await loadPlatformMetrics(session.supabase, WINDOW_DAYS);

  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');

  const catalogueNeedsWork = metrics.catalog.expired > 0;
  const queueWaiting = metrics.scrapers.queuePending > 0;

  return (
    <>
      <AdminPageHeader
        title={t('admin.overview.title')}
        description={t('admin.overview.subtitle', { days: WINDOW_DAYS })}
      />

      {!live ? <AdminNote tone="danger">{t('admin.overview.metricsUnavailable')}</AdminNote> : null}

      {catalogueNeedsWork ? (
        <AdminNote tone="warning">
          {t('admin.overview.expiredWarning', { count: metrics.catalog.expired })}{' '}
          <Link href="/admin/deadlines" className="font-medium underline underline-offset-2">
            {t('admin.overview.fixDeadlines')}
          </Link>
        </AdminNote>
      ) : null}

      {queueWaiting ? (
        <AdminNote tone="info">
          {t('admin.overview.queueWaiting', { count: metrics.scrapers.queuePending })}{' '}
          <Link href="/admin/queue" className="font-medium underline underline-offset-2">
            {t('admin.overview.openQueue')}
          </Link>
        </AdminNote>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('admin.overview.tenants')}
          value={n(metrics.tenants.total)}
          hint={t('admin.overview.tenantsHint', { count: metrics.tenants.new, days: WINDOW_DAYS })}
        />
        <StatTile
          label={t('admin.overview.activeTenants')}
          value={n(metrics.tenants.active)}
          tone="success"
          hint={t('admin.overview.activeTenantsHint', { days: WINDOW_DAYS })}
        />
        <StatTile
          label={t('admin.overview.fieldsFilled')}
          value={n(metrics.usage.fieldsFilled)}
          hint={t('admin.overview.fieldsFilledHint', { days: WINDOW_DAYS })}
        />
        <StatTile
          label={t('admin.overview.members')}
          value={n(metrics.members.total)}
          hint={t('admin.overview.membersHint')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard
          title={t('admin.overview.catalogueTitle')}
          description={t('admin.overview.catalogueSubtitle')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label={t('admin.overview.publishedSchemes')}
              value={n(metrics.catalog.publishedSchemes)}
              hint={t('admin.overview.ofTotal', { total: n(metrics.catalog.globalSchemes) })}
            />
            <StatTile
              label={t('admin.overview.closingSoon')}
              value={n(metrics.catalog.closingSoon)}
              tone={metrics.catalog.closingSoon > 0 ? 'warning' : 'neutral'}
              hint={t('admin.overview.closingSoonHint')}
            />
            <StatTile
              label={t('admin.overview.expired')}
              value={n(metrics.catalog.expired)}
              tone={metrics.catalog.expired > 0 ? 'danger' : 'success'}
              hint={t('admin.overview.expiredHint')}
            />
            <StatTile
              label={t('admin.overview.activeAdapters')}
              value={n(metrics.catalog.activeAdapters)}
              hint={t('admin.overview.ofTotal', { total: n(metrics.catalog.globalAdapters) })}
            />
          </div>
        </AdminCard>

        <AdminCard
          title={t('admin.overview.pipelineTitle')}
          description={t('admin.overview.pipelineSubtitle')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label={t('admin.overview.queuePending')}
              value={n(metrics.scrapers.queuePending)}
              tone={metrics.scrapers.queuePending > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label={t('admin.overview.sourcesEnabled')}
              value={n(metrics.scrapers.enabled)}
              hint={t('admin.overview.ofTotal', { total: n(metrics.scrapers.sources) })}
            />
            <StatTile
              label={t('admin.overview.queueApproved')}
              value={n(metrics.scrapers.queueApproved)}
              tone="success"
              hint={t('admin.overview.inWindow', { days: WINDOW_DAYS })}
            />
            <StatTile
              label={t('admin.overview.unhealthySources')}
              value={n(metrics.scrapers.unhealthy)}
              tone={metrics.scrapers.unhealthy > 0 ? 'danger' : 'neutral'}
              hint={t('admin.overview.unhealthyHint')}
            />
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/*
          The safety counters are on the platform dashboard rather than buried in a report because
          rules 1–4 in docs/DEVELOPMENT_RULES.md are the ones an auditor asks about, and "we have
          never filled one" should be a number somebody can read, not a claim in a document.
        */}
        <AdminCard
          title={t('admin.overview.safetyTitle')}
          description={t('admin.overview.safetySubtitle')}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label={t('admin.overview.captchaSeen')}
              value={n(metrics.safety.captchaFieldsSeen)}
            />
            <StatTile label={t('admin.overview.otpSeen')} value={n(metrics.safety.otpFieldsSeen)} />
            <StatTile
              label={t('admin.overview.paymentSeen')}
              value={n(metrics.safety.paymentFieldsSeen)}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {t('admin.overview.safetyNote')}
          </p>
        </AdminCard>

        <AdminCard
          title={t('admin.overview.jobsTitle')}
          description={t('admin.overview.jobsSubtitle')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label={t('admin.overview.jobsPending')} value={n(metrics.jobs.pending)} />
            <StatTile label={t('admin.overview.jobsRunning')} value={n(metrics.jobs.running)} />
            <StatTile
              label={t('admin.overview.jobsFailed')}
              value={n(metrics.jobs.failed)}
              tone={metrics.jobs.failed > 0 ? 'danger' : 'success'}
              hint={t('admin.overview.inWindow', { days: WINDOW_DAYS })}
            />
            <StatTile
              label={t('admin.overview.jobsCompleted')}
              value={n(metrics.jobs.completed)}
              tone="success"
              hint={t('admin.overview.inWindow', { days: WINDOW_DAYS })}
            />
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title={t('admin.overview.byPlanTitle')}>
          <DistributionList
            entries={Object.entries(metrics.tenants.byPlan)}
            emptyLabel={t('admin.overview.noData')}
            format={n}
          />
        </AdminCard>
        <AdminCard title={t('admin.overview.byRoleTitle')}>
          <DistributionList
            entries={Object.entries(metrics.members.byRole).map(([key, value]) => [
              isOrgRole(key) ? localised(ORG_ROLE_LABELS[key], locale) : key,
              value,
            ])}
            emptyLabel={t('admin.overview.noData')}
            format={n}
          />
        </AdminCard>
      </div>

      <p className="text-xs text-slate-600">
        {t('admin.overview.generatedAt', {
          at: (live ? formatIndianDate(metrics.generatedAt) : null) ?? '—',
        })}{' '}
        · {t('admin.overview.privacyFooter')}
      </p>
    </>
  );
}

/**
 * A count-per-key breakdown as a bar list.
 *
 * Bars are scaled against the largest value rather than the total, so a distribution with one
 * dominant bucket still shows the small ones instead of rendering them as invisible slivers.
 */
function DistributionList({
  entries,
  emptyLabel,
  format,
}: {
  entries: [string, number][];
  emptyLabel: string;
  format: (value: number) => string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sorted.map(([, value]) => value), 1);

  return (
    <ul className="space-y-2">
      {sorted.map(([key, value]) => (
        <li key={key} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm text-slate-400">{key}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-sky-500/70"
              style={{ width: `${Math.max((value / max) * 100, 2)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-sm tabular-nums text-slate-300">
            {format(value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
