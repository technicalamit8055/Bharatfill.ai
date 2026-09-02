import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatIndianDate } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { httpFetchingEnabled } from '@/lib/admin/scraper/fetchers';
import { getTranslations } from '@/lib/i18n/server';
import type { ScraperRunRow, ScraperSourceRow } from '@/lib/supabase/database.types';
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPageHeader,
  AdminTable,
  TD,
  TH,
} from '../../ui';
import { SourceForm } from '../source-form';
import { RunPanel } from './run-panel';

export const metadata = { title: 'Scraper source' };

const RUN_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'neutral',
  running: 'info',
  succeeded: 'success',
  partial: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
};

export default async function AdminScraperSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePlatformPagePermission('platform.scrapers.view');
  const { t } = await getTranslations();
  const { id } = await params;

  const [sourceResult, runsResult] = await Promise.all([
    session.supabase.from('scraper_sources').select('*').eq('id', id).maybeSingle(),
    session.supabase
      .from('scraper_runs')
      .select('*')
      .eq('source_id', id)
      .order('started_at', { ascending: false })
      .limit(20),
  ]);

  if (!sourceResult.data) notFound();
  const source = sourceResult.data as ScraperSourceRow;
  const runs = (runsResult.data ?? []) as ScraperRunRow[];

  const canConfigure = session.permissions.has('platform.scrapers.configure');
  const canRun = session.permissions.has('platform.scrapers.run');

  return (
    <>
      <AdminPageHeader
        title={source.name}
        description={source.portal_name}
        actions={
          <Link
            href="/admin/scrapers"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            {t('common.back')}
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SourceForm
          sourceId={source.id}
          readOnly={!canConfigure}
          initial={{
            slug: source.slug,
            name: source.name,
            portalName: source.portal_name,
            sourceUrl: source.source_url,
            fetcher: source.fetcher,
            isEnabled: source.is_enabled,
            intervalMinutes: source.interval_minutes,
            notes: source.notes ?? '',
          }}
        />

        <RunPanel
          sourceId={source.id}
          fetcher={source.fetcher}
          config={JSON.stringify(source.config ?? {}, null, 2)}
          canRun={canRun}
          canConfigure={canConfigure}
          httpEnabled={httpFetchingEnabled()}
        />
      </div>

      <AdminCard
        title={t('admin.scrapers.historyTitle')}
        description={t('admin.scrapers.historySubtitle')}
      >
        <AdminTable
          head={
            <tr>
              <TH>{t('admin.scrapers.started')}</TH>
              <TH>{t('admin.scrapers.runStatusLabel')}</TH>
              <TH>{t('admin.scrapers.trigger')}</TH>
              <TH className="text-right">{t('admin.scrapers.found')}</TH>
              <TH className="text-right">{t('admin.scrapers.stagedShort')}</TH>
              <TH className="text-right">{t('admin.scrapers.skippedShort')}</TH>
              <TH>{t('admin.scrapers.error')}</TH>
            </tr>
          }
          empty={
            runs.length === 0 ? <AdminEmpty title={t('admin.scrapers.noRuns')} /> : undefined
          }
        >
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-slate-900/40">
              <TD className="whitespace-nowrap text-xs">{formatIndianDate(run.started_at)}</TD>
              <TD>
                <AdminBadge tone={RUN_TONE[run.status] ?? 'neutral'}>
                  {t(`admin.scrapers.runStatus.${run.status}`)}
                </AdminBadge>
              </TD>
              <TD className="text-xs text-slate-400">
                {t(`admin.scrapers.trigger_${run.trigger}`)}
              </TD>
              <TD className="text-right tabular-nums">{run.items_found}</TD>
              <TD className="text-right tabular-nums text-emerald-400">{run.items_staged}</TD>
              <TD className="text-right tabular-nums text-slate-500">{run.items_skipped}</TD>
              <TD className="max-w-xs truncate font-mono text-xs text-rose-400">
                {run.error_text ?? ''}
              </TD>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </>
  );
}
