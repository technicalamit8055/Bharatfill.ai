import Link from 'next/link';
import { SCRAPER_FETCHER_LABELS, formatIndianDate, type ScraperFetcher } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { httpFetchingEnabled } from '@/lib/admin/scraper/fetchers';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import type { ScraperSourceRow } from '@/lib/supabase/database.types';
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminPageHeader,
  AdminTable,
  TD,
  TH,
} from '../ui';

export const metadata = { title: 'Scrapers' };

/** Three consecutive failures is where a source stops being "flaky" and starts being broken. */
const UNHEALTHY_AT = 3;

export default async function AdminScrapersPage() {
  const session = await requirePlatformPagePermission('platform.scrapers.view');
  const { t, locale } = await getTranslations();

  const { data } = await session.supabase
    .from('scraper_sources')
    .select('*')
    .order('name', { ascending: true });

  const sources = (data ?? []) as ScraperSourceRow[];
  const canConfigure = session.permissions.has('platform.scrapers.configure');
  const httpEnabled = httpFetchingEnabled();
  const httpSources = sources.filter((source) => source.fetcher === 'http').length;

  return (
    <>
      <AdminPageHeader
        title={t('admin.scrapers.title')}
        description={t('admin.scrapers.subtitle')}
        actions={
          canConfigure ? (
            <Link
              href="/admin/scrapers/new"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              {t('admin.scrapers.new')}
            </Link>
          ) : null
        }
      />

      {/*
        The single most confusing thing about this screen would be an `http` source that looks
        configured and quietly stages nothing. Stated up front rather than discovered from an
        empty run history.
      */}
      <AdminNote tone={httpEnabled ? 'info' : 'warning'}>
        {httpEnabled
          ? t('admin.scrapers.httpEnabledNote')
          : t('admin.scrapers.httpDisabledNote', { count: httpSources })}
      </AdminNote>

      <AdminNote>{t('admin.scrapers.reviewNote')}</AdminNote>

      <AdminCard>
        <AdminTable
          head={
            <tr>
              <TH>{t('admin.scrapers.source')}</TH>
              <TH>{t('admin.scrapers.fetcher')}</TH>
              <TH>{t('admin.scrapers.interval')}</TH>
              <TH>{t('admin.scrapers.lastRun')}</TH>
              <TH>{t('admin.scrapers.health')}</TH>
              <TH />
            </tr>
          }
          empty={
            sources.length === 0 ? (
              <AdminEmpty
                title={t('admin.scrapers.empty')}
                description={t('admin.scrapers.emptyHelp')}
              />
            ) : undefined
          }
        >
          {sources.map((source) => {
            const unhealthy = source.consecutive_failures >= UNHEALTHY_AT;
            const inert = source.fetcher === 'http' && !httpEnabled;

            return (
              <tr key={source.id} className="hover:bg-slate-900/40">
                <TD>
                  <div className="font-medium text-slate-100">{source.name}</div>
                  <div className="text-xs text-slate-400">{source.portal_name}</div>
                  <a
                    href={source.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block max-w-xs truncate font-mono text-xs text-sky-500 hover:text-sky-400"
                  >
                    {source.source_url}
                  </a>
                </TD>
                <TD>
                  <AdminBadge tone={source.fetcher === 'http' ? 'info' : 'neutral'}>
                    {localised(SCRAPER_FETCHER_LABELS[source.fetcher as ScraperFetcher], locale)}
                  </AdminBadge>
                  {inert ? (
                    <div className="mt-1 text-xs text-amber-400">{t('admin.scrapers.inert')}</div>
                  ) : null}
                </TD>
                <TD className="text-xs text-slate-400">
                  {t('admin.scrapers.everyHours', {
                    hours: Math.round(source.interval_minutes / 60),
                  })}
                </TD>
                <TD className="text-xs">
                  {source.last_run_at ? (
                    <>
                      <div className="text-slate-300">{formatIndianDate(source.last_run_at)}</div>
                      {source.last_status ? (
                        <div className="text-slate-500">
                          {t(`admin.scrapers.runStatus.${source.last_status}`)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-600">{t('admin.scrapers.neverRun')}</span>
                  )}
                </TD>
                <TD>
                  {!source.is_enabled ? (
                    <AdminBadge tone="neutral">{t('admin.scrapers.disabled')}</AdminBadge>
                  ) : unhealthy ? (
                    <AdminBadge tone="danger">
                      {t('admin.scrapers.failing', { count: source.consecutive_failures })}
                    </AdminBadge>
                  ) : (
                    <AdminBadge tone="success">{t('admin.scrapers.healthy')}</AdminBadge>
                  )}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/admin/scrapers/${source.id}`}
                    className="text-sm font-medium text-sky-400 hover:text-sky-300"
                  >
                    {t('common.open')}
                  </Link>
                </TD>
              </tr>
            );
          })}
        </AdminTable>
      </AdminCard>
    </>
  );
}
