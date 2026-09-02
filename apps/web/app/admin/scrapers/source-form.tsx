'use client';

import { useActionState, useState } from 'react';
import { SCRAPER_FETCHERS, SCRAPER_FETCHER_LABELS } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import {
  AdminButton,
  AdminCard,
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminNote,
  AdminSelect,
  AdminTextarea,
} from '../ui';
import { saveSourceAction, type ScraperActionState } from './actions';

export type SourceDraft = {
  slug: string;
  name: string;
  portalName: string;
  sourceUrl: string;
  fetcher: string;
  isEnabled: boolean;
  intervalMinutes: number;
  notes: string;
};

/** Interval options in hours. A notification page is not a live feed; one hour is the floor. */
const INTERVALS = [1, 6, 12, 24, 72, 168] as const;

export function SourceForm({
  sourceId,
  initial,
  readOnly,
}: {
  sourceId?: string;
  initial: SourceDraft;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ScraperActionState, FormData>(
    saveSourceAction,
    {},
  );
  const [fetcher, setFetcher] = useState(initial.fetcher);

  const fieldError = (key: string) => (state.fields?.[key] ? t(state.fields[key]!) : undefined);

  return (
    <form action={formAction}>
      <AdminCard
        title={t('admin.scrapers.configTitle')}
        description={t('admin.scrapers.configSubtitle')}
      >
        {sourceId ? <input type="hidden" name="id" value={sourceId} /> : null}

        {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
        {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AdminField label={t('admin.scrapers.name')} error={fieldError('name')}>
            <AdminInput name="name" defaultValue={initial.name} disabled={readOnly} required />
          </AdminField>

          <AdminField
            label={t('admin.scrapers.slug')}
            hint={t('admin.scrapers.slugHint')}
            error={fieldError('slug')}
          >
            <AdminInput name="slug" defaultValue={initial.slug} disabled={readOnly} required />
          </AdminField>

          <AdminField label={t('admin.scrapers.portalName')} error={fieldError('portalName')}>
            <AdminInput
              name="portalName"
              defaultValue={initial.portalName}
              disabled={readOnly}
              required
            />
          </AdminField>

          <AdminField
            label={t('admin.scrapers.sourceUrl')}
            hint={t('admin.scrapers.sourceUrlHint')}
            error={fieldError('sourceUrl')}
          >
            <AdminInput
              name="sourceUrl"
              type="url"
              defaultValue={initial.sourceUrl}
              disabled={readOnly}
              required
            />
          </AdminField>

          <AdminField label={t('admin.scrapers.fetcher')} hint={t(`admin.scrapers.fetcherHint.${fetcher}`)}>
            <AdminSelect
              name="fetcher"
              value={fetcher}
              disabled={readOnly}
              onChange={(event) => setFetcher(event.target.value)}
            >
              {SCRAPER_FETCHERS.map((kind) => (
                <option key={kind} value={kind}>
                  {SCRAPER_FETCHER_LABELS[kind].en}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          <AdminField label={t('admin.scrapers.interval')}>
            <AdminSelect
              name="intervalMinutes"
              defaultValue={String(initial.intervalMinutes)}
              disabled={readOnly}
            >
              {INTERVALS.map((hours) => (
                <option key={hours} value={hours * 60}>
                  {t('admin.scrapers.everyHours', { hours })}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </div>

        <div className="mt-3">
          <AdminField label={t('admin.scrapers.notes')}>
            <AdminTextarea
              name="notes"
              rows={2}
              defaultValue={initial.notes}
              disabled={readOnly}
            />
          </AdminField>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <AdminCheckbox
            name="isEnabled"
            label={t('admin.scrapers.enabled')}
            defaultChecked={initial.isEnabled}
            disabled={readOnly}
          />
          {!readOnly ? (
            <AdminButton type="submit" variant="primary" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </AdminButton>
          ) : null}
        </div>

        {fetcher === 'http' ? (
          <div className="mt-3">
            <AdminNote tone="warning">{t('admin.scrapers.httpFormNote')}</AdminNote>
          </div>
        ) : null}
      </AdminCard>
    </form>
  );
}
