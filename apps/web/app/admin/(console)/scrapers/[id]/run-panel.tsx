'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import {
  AdminButton,
  AdminCard,
  AdminField,
  AdminInput,
  AdminNote,
  AdminTextarea,
} from '../../ui';
import {
  deleteSourceAction,
  runSourceAction,
  saveSourceConfigAction,
  type ScraperActionState,
} from '../actions';

/**
 * Trigger a run, edit fetcher options, remove the source.
 *
 * The manual fetcher's input lives here rather than on a separate page because that is the actual
 * workflow: an employee has the notification open in another tab, pastes it, and watches what the
 * date reader made of it. Nothing they paste is stored — only the dates read out of it reach the
 * queue (apps/web/lib/admin/scraper/fetchers/manual.ts).
 */
export function RunPanel({
  sourceId,
  fetcher,
  config,
  canRun,
  canConfigure,
  httpEnabled,
}: {
  sourceId: string;
  fetcher: string;
  config: string;
  canRun: boolean;
  canConfigure: boolean;
  httpEnabled: boolean;
}) {
  const t = useTranslations();
  const [runState, runAction, runPending] = useActionState<ScraperActionState, FormData>(
    runSourceAction,
    {},
  );
  const [configState, configAction, configPending] = useActionState<ScraperActionState, FormData>(
    saveSourceConfigAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ScraperActionState, FormData>(
    deleteSourceAction,
    {},
  );
  const [schemeSlug, setSchemeSlug] = useState('');

  const httpBlocked = fetcher === 'http' && !httpEnabled;
  const summary = runState.runSummary;

  return (
    <div className="space-y-4">
      {canRun ? (
        <AdminCard
          title={t('admin.scrapers.runTitle')}
          description={t('admin.scrapers.runSubtitle')}
        >
          <form action={runAction} className="space-y-3">
            <input type="hidden" name="id" value={sourceId} />

            {fetcher === 'manual' ? (
              <>
                <AdminField
                  label={t('admin.scrapers.targetScheme')}
                  hint={t('admin.scrapers.targetSchemeHint')}
                >
                  <AdminInput
                    name="schemeSlug"
                    value={schemeSlug}
                    onChange={(event) => setSchemeSlug(event.target.value)}
                    placeholder="ssc-gd-constable"
                    required
                  />
                </AdminField>

                <AdminField
                  label={t('admin.scrapers.pastedText')}
                  hint={t('admin.scrapers.pastedTextHint')}
                >
                  <AdminTextarea name="pastedText" rows={8} required spellCheck={false} />
                </AdminField>
              </>
            ) : null}

            {httpBlocked ? (
              <AdminNote tone="warning">{t('admin.scrapers.httpDisabledNoteShort')}</AdminNote>
            ) : null}

            {runState.error ? <AdminNote tone="danger">{t(runState.error)}</AdminNote> : null}
            {runState.notice && !runState.error ? (
              <AdminNote tone="success">{t(runState.notice)}</AdminNote>
            ) : null}

            {summary ? (
              <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                <div className="flex flex-wrap gap-4 tabular-nums">
                  <span>{t('admin.scrapers.found', { count: summary.found })}</span>
                  <span className="text-emerald-400">
                    {t('admin.scrapers.staged', { count: summary.staged })}
                  </span>
                  <span>{t('admin.scrapers.skipped', { count: summary.skipped })}</span>
                </div>
                {summary.warnings.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-amber-400">
                    {summary.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {summary.staged > 0 ? (
                  <p className="mt-2 text-slate-500">{t('admin.scrapers.stagedNext')}</p>
                ) : null}
              </div>
            ) : null}

            <AdminButton
              type="submit"
              variant="primary"
              disabled={runPending || httpBlocked}
            >
              {runPending ? t('admin.scrapers.running') : t('admin.scrapers.runNow')}
            </AdminButton>
          </form>
        </AdminCard>
      ) : null}

      {canConfigure ? (
        <AdminCard
          title={t('admin.scrapers.fetcherConfigTitle')}
          description={t(`admin.scrapers.fetcherConfigHelp.${fetcher}`)}
        >
          <form action={configAction} className="space-y-3">
            <input type="hidden" name="id" value={sourceId} />
            <AdminField
              label={t('admin.scrapers.configJson')}
              error={
                configState.fields?.config ? t(configState.fields.config) : undefined
              }
            >
              <AdminTextarea name="config" rows={8} defaultValue={config} spellCheck={false} />
            </AdminField>

            {configState.notice ? (
              <p className="text-xs text-emerald-400">{t(configState.notice)}</p>
            ) : null}

            <AdminButton type="submit" disabled={configPending}>
              {configPending ? t('common.saving') : t('admin.scrapers.saveConfig')}
            </AdminButton>
          </form>
        </AdminCard>
      ) : null}

      {canConfigure ? (
        <AdminCard title={t('admin.scrapers.dangerTitle')}>
          {deleteState.error ? (
            <AdminNote tone="danger">{t(deleteState.error)}</AdminNote>
          ) : null}
          <form
            action={deleteAction}
            className="mt-2"
            onSubmit={(event) => {
              if (!window.confirm(t('admin.scrapers.confirmDelete'))) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={sourceId} />
            <AdminButton type="submit" variant="danger" disabled={deletePending}>
              {t('admin.scrapers.delete')}
            </AdminButton>
          </form>
          <p className="mt-2 text-xs text-slate-600">{t('admin.scrapers.deleteNote')}</p>
        </AdminCard>
      ) : null}
    </div>
  );
}
