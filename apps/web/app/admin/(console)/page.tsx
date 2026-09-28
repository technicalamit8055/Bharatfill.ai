import Link from 'next/link';
import {
  Activity,
  BookOpen,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  FileText,
  Inbox,
  Layers,
  ListChecks,
  Radar,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { ORG_ROLE_LABELS, formatIndianDate, isOrgRole } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadPlatformMetrics } from '@/lib/admin/metrics';
import { loadPlatformAuditLog } from '@/lib/admin/audit-log';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import {
  AdminAvatar,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminLinkButton,
  AdminNote,
  AdminPageHeader,
  AdminProgress,
  StatTile,
  type Tone,
} from './ui';
import { formatRelative } from './format';

export const metadata = { title: 'Overview' };

const WINDOW_DAYS = 30;

type AttentionItem = { key: string; tone: Tone; title: string; detail: string; href?: string };

/**
 * Platform analytics.
 *
 * Everything here comes from `platform_metrics()` — one reviewable SQL function that returns
 * counts and nothing else (0021) — plus the platform audit trail for the activity feed. There is
 * no drill-down from any number on this page to a customer record, and that is the design: spec
 * §6.1 gives internal staff organization metadata, usage and error reports, and stops there.
 */
export default async function AdminOverviewPage() {
  const session = await requirePlatformPagePermission('platform.analytics.view');
  const { t, locale } = await getTranslations();
  const canAudit = session.permissions.has('platform.audit.view');
  const can = (permission: Parameters<typeof session.permissions.has>[0]) =>
    session.permissions.has(permission);

  const [{ metrics, live }, activity] = await Promise.all([
    loadPlatformMetrics(session.supabase, WINDOW_DAYS),
    canAudit ? loadPlatformAuditLog(session.supabase, {}, { pageSize: 6 }) : Promise.resolve(null),
  ]);

  const n = (value: number) => value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN');
  const activeShare =
    metrics.tenants.total > 0
      ? Math.round((metrics.tenants.active / metrics.tenants.total) * 100)
      : 0;

  // What needs a human today, most damaging first. Each links to the screen that fixes it, and
  // only when the viewer's role can open that screen.
  const attention: AttentionItem[] = [];
  if (!live) {
    attention.push({
      key: 'metrics',
      tone: 'danger',
      title: t('admin.overview.attention.metricsTitle'),
      detail: t('admin.overview.metricsUnavailable'),
    });
  }
  if (metrics.catalog.expired > 0) {
    attention.push({
      key: 'expired',
      tone: 'danger',
      title: t('admin.overview.attention.expiredTitle', { count: n(metrics.catalog.expired) }),
      detail: t('admin.overview.attention.expiredDetail'),
      href: can('platform.deadlines.edit') ? '/admin/deadlines' : undefined,
    });
  }
  if (metrics.jobs.failed > 0) {
    attention.push({
      key: 'jobs',
      tone: 'danger',
      title: t('admin.overview.attention.jobsTitle', { count: n(metrics.jobs.failed) }),
      detail: t('admin.overview.attention.jobsDetail', { days: WINDOW_DAYS }),
    });
  }
  if (metrics.scrapers.queuePending > 0) {
    attention.push({
      key: 'queue',
      tone: 'warning',
      title: t('admin.overview.attention.queueTitle', { count: n(metrics.scrapers.queuePending) }),
      detail: t('admin.overview.attention.queueDetail'),
      href: can('platform.queue.view') ? '/admin/queue' : undefined,
    });
  }
  if (metrics.scrapers.unhealthy > 0) {
    attention.push({
      key: 'scrapers',
      tone: 'warning',
      title: t('admin.overview.attention.scrapersTitle', { count: n(metrics.scrapers.unhealthy) }),
      detail: t('admin.overview.unhealthyHint'),
      href: can('platform.scrapers.view') ? '/admin/scrapers' : undefined,
    });
  }
  if (metrics.catalog.closingSoon > 0) {
    attention.push({
      key: 'closing',
      tone: 'info',
      title: t('admin.overview.attention.closingTitle', { count: n(metrics.catalog.closingSoon) }),
      detail: t('admin.overview.closingSoonHint'),
      href: can('platform.deadlines.edit') ? '/admin/deadlines' : undefined,
    });
  }
  if (session.via === 'bootstrap') {
    attention.push({
      key: 'bootstrap',
      tone: 'warning',
      title: t('admin.overview.attention.bootstrapTitle'),
      detail: t('admin.overview.attention.bootstrapDetail'),
      href: can('platform.team.view') ? '/admin/team' : undefined,
    });
  }

  const greetingName = session.email?.split('@')[0] ?? '';

  return (
    <>
      <AdminPageHeader
        title={t('admin.overview.welcome', { name: greetingName })}
        description={t('admin.overview.subtitle', { days: WINDOW_DAYS })}
        actions={
          <>
            {can('platform.queue.review') && metrics.scrapers.queuePending > 0 ? (
              <AdminLinkButton href="/admin/queue" variant="outline">
                <Inbox />
                {t('admin.overview.reviewQueue')}
              </AdminLinkButton>
            ) : null}
            {can('platform.schemes.edit') ? (
              <AdminLinkButton href="/admin/schemes/new" variant="primary">
                <Sparkles />
                {t('admin.shell.actionNewScheme')}
              </AdminLinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Building2 />}
          tone="info"
          label={t('admin.overview.tenants')}
          value={n(metrics.tenants.total)}
          hint={t('admin.overview.tenantsHint', {
            count: n(metrics.tenants.new),
            days: WINDOW_DAYS,
          })}
          href={can('platform.tenants.view') ? '/admin/tenants' : undefined}
        />
        <StatTile
          icon={<Activity />}
          tone="success"
          label={t('admin.overview.activeTenants')}
          value={n(metrics.tenants.active)}
          hint={t('admin.overview.activeShare', { percent: activeShare, days: WINDOW_DAYS })}
        />
        <StatTile
          icon={<ListChecks />}
          tone="accent"
          label={t('admin.overview.fieldsFilled')}
          value={n(metrics.usage.fieldsFilled)}
          hint={t('admin.overview.fieldsFilledHint', { days: WINDOW_DAYS })}
        />
        <StatTile
          icon={<Users />}
          label={t('admin.overview.members')}
          value={n(metrics.members.total)}
          hint={t('admin.overview.membersHint')}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AdminCard
          className="xl:col-span-2"
          flush
          icon={<TriangleAlert />}
          title={t('admin.overview.attentionTitle')}
          description={t('admin.overview.attentionSubtitle')}
          actions={
            attention.length > 0 ? (
              <AdminBadge tone="warning">{n(attention.length)}</AdminBadge>
            ) : null
          }
        >
          {attention.length === 0 ? (
            <AdminEmpty
              icon={<CircleCheck />}
              title={t('admin.overview.allClearTitle')}
              description={t('admin.overview.allClearDetail')}
            />
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {attention.map((item) => {
                const dot: Record<Tone, string> = {
                  danger: 'bg-rose-400',
                  warning: 'bg-amber-400',
                  info: 'bg-sky-400',
                  success: 'bg-emerald-400',
                  neutral: 'bg-slate-400',
                  accent: 'bg-violet-400',
                };
                const body = (
                  <>
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[item.tone]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-100">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                        {item.detail}
                      </span>
                    </span>
                    {item.href ? (
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
                    ) : null}
                  </>
                );
                return (
                  <li key={item.key}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-900/60"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-5 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>

        <AdminCard
          icon={<Layers />}
          title={t('admin.overview.usageTitle')}
          description={t('admin.overview.usageSubtitle')}
        >
          <dl className="grid grid-cols-2 gap-4">
            {(
              [
                ['customers', metrics.usage.customers],
                ['applications', metrics.usage.applications],
                ['documents', metrics.usage.documents],
                ['fillSessions', metrics.usage.fillSessions],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-slate-500">{t(`admin.overview.usage.${key}`)}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">
                  {n(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
            {t('admin.overview.usageNote', { days: WINDOW_DAYS })}
          </p>
        </AdminCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard
          icon={<BookOpen />}
          title={t('admin.overview.catalogueTitle')}
          description={t('admin.overview.catalogueSubtitle')}
          actions={
            can('platform.schemes.view') ? (
              <Link
                href="/admin/schemes"
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {t('admin.overview.viewAll')}
              </Link>
            ) : null
          }
        >
          <div className="space-y-4">
            <AdminProgress
              label={t('admin.overview.publishedSchemes')}
              value={metrics.catalog.publishedSchemes}
              total={metrics.catalog.globalSchemes}
              tone="success"
              format={n}
            />
            <AdminProgress
              label={t('admin.overview.activeAdapters')}
              value={metrics.catalog.activeAdapters}
              total={metrics.catalog.globalAdapters}
              tone="info"
              format={n}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatTile
              icon={<CalendarClock />}
              label={t('admin.overview.closingSoon')}
              value={n(metrics.catalog.closingSoon)}
              tone={metrics.catalog.closingSoon > 0 ? 'warning' : 'neutral'}
              hint={t('admin.overview.closingSoonHint')}
            />
            <StatTile
              icon={<FileText />}
              label={t('admin.overview.expired')}
              value={n(metrics.catalog.expired)}
              tone={metrics.catalog.expired > 0 ? 'danger' : 'success'}
              hint={t('admin.overview.expiredHint')}
            />
          </div>
        </AdminCard>

        <AdminCard
          icon={<Radar />}
          title={t('admin.overview.pipelineTitle')}
          description={t('admin.overview.pipelineSubtitle')}
          actions={
            can('platform.scrapers.view') ? (
              <Link
                href="/admin/scrapers"
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {t('admin.overview.viewAll')}
              </Link>
            ) : null
          }
        >
          <div className="space-y-4">
            <AdminProgress
              label={t('admin.overview.sourcesEnabled')}
              value={metrics.scrapers.enabled}
              total={metrics.scrapers.sources}
              tone="info"
              format={n}
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatTile
              label={t('admin.overview.queuePending')}
              value={n(metrics.scrapers.queuePending)}
              tone={metrics.scrapers.queuePending > 0 ? 'warning' : 'neutral'}
              href={can('platform.queue.view') ? '/admin/queue' : undefined}
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
            />
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/*
          The safety counters are on the platform dashboard rather than buried in a report because
          rules 1–4 in docs/DEVELOPMENT_RULES.md are the ones an auditor asks about, and "we have
          never filled one" should be a number somebody can read, not a claim in a document.
        */}
        <AdminCard
          icon={<ShieldCheck />}
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
          icon={<Server />}
          title={t('admin.overview.jobsTitle')}
          description={t('admin.overview.jobsSubtitle')}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t('admin.overview.jobsPending')} value={n(metrics.jobs.pending)} />
            <StatTile
              label={t('admin.overview.jobsRunning')}
              value={n(metrics.jobs.running)}
              tone="info"
            />
            <StatTile
              label={t('admin.overview.jobsFailed')}
              value={n(metrics.jobs.failed)}
              tone={metrics.jobs.failed > 0 ? 'danger' : 'success'}
            />
            <StatTile
              label={t('admin.overview.jobsCompleted')}
              value={n(metrics.jobs.completed)}
              tone="success"
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {t('admin.overview.inWindow', { days: WINDOW_DAYS })}
          </p>
        </AdminCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
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

        {activity ? (
          <AdminCard
            flush
            icon={<ScrollText />}
            title={t('admin.overview.activityTitle')}
            actions={
              <Link
                href="/admin/audit"
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {t('admin.overview.viewAll')}
              </Link>
            }
          >
            {activity.entries.length === 0 ? (
              <AdminEmpty icon={<ScrollText />} title={t('admin.audit.empty')} />
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {activity.entries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <AdminAvatar label={entry.actorEmail ?? entry.actorType} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">{entry.description}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {entry.actorEmail ?? t('admin.audit.unknownActor')} ·{' '}
                        {formatRelative(entry.createdAt, locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        ) : null}
      </div>

      {!live ? <AdminNote tone="danger">{t('admin.overview.metricsUnavailable')}</AdminNote> : null}

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
    <ul className="space-y-2.5">
      {sorted.map(([key, value]) => (
        <li key={key} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-slate-400">{key}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-sky-500/70"
              style={{ width: `${Math.max((value / max) * 100, 2)}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-300">
            {format(value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
