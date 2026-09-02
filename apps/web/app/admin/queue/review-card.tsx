'use client';

import { useActionState, useState } from 'react';
import type { SchemeFieldDiff } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { AdminBadge, AdminButton, AdminNote, AdminTextarea } from '../ui';
import { DiffView } from './diff-view';
import {
  approveQueueItemAction,
  rejectQueueItemAction,
  type QueueActionState,
} from './actions';

/**
 * One inbox item: what changed, where it came from, approve or reject.
 *
 * Approve is not the primary-styled default action. It publishes to every centre in the country,
 * and a review UI whose most prominent button is "yes" trains people to click it — the diff is
 * meant to be read first, so the button waits until the reviewer has opened the changes.
 */
export function ReviewCard({
  item,
  canReview,
}: {
  item: {
    id: string;
    slug: string;
    title: string;
    sourceName: string;
    sourceUrl: string;
    changeKind: string;
    changes: SchemeFieldDiff[];
    confidence: number;
    fetcherNote: string | null;
    createdAt: string;
    isNew: boolean;
    payloadSummary: { start: string | null; end: string | null; alwaysOpen: boolean };
  };
  canReview: boolean;
}) {
  const t = useTranslations();
  const [approveState, approveAction, approvePending] = useActionState<QueueActionState, FormData>(
    approveQueueItemAction,
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<QueueActionState, FormData>(
    rejectQueueItemAction,
    {},
  );
  // A dates-only change is small enough to read at a glance, so it opens expanded; a content or
  // eligibility change is not, and starts collapsed so the list stays scannable.
  const [expanded, setExpanded] = useState(item.changeKind === 'deadline_only');
  const [note, setNote] = useState('');

  const state = approveState.error || approveState.notice ? approveState : rejectState;
  const pending = approvePending || rejectPending;
  const settled = Boolean(approveState.notice || rejectState.notice);

  const kindTone =
    item.changeKind === 'deadline_only'
      ? 'warning'
      : item.changeKind === 'new'
        ? 'info'
        : 'danger';

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/60">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
            <AdminBadge tone={kindTone}>{t(`admin.queue.kind.${item.changeKind}`)}</AdminBadge>
            {item.isNew ? (
              <AdminBadge tone="info">{t('admin.queue.newScheme')}</AdminBadge>
            ) : null}
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500">{item.slug}</div>
          <div className="mt-1 text-xs text-slate-500">
            {t('admin.queue.fromSource', { source: item.sourceName })} ·{' '}
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sky-500 underline underline-offset-2 hover:text-sky-400"
            >
              {t('admin.queue.openNotification')}
            </a>
          </div>
        </div>

        <div className="shrink-0 text-right text-xs text-slate-500">
          <div>{t('admin.queue.confidence', { value: Math.round(item.confidence * 100) })}</div>
          <div className="mt-0.5">{item.createdAt}</div>
        </div>
      </header>

      <div className="px-4 py-3">
        {/*
          The window the candidate proposes, always shown even when it is unchanged. A reviewer's
          first question is "what dates would this scheme end up with?", and answering it only
          inside the diff means a change to something else hides the answer.
        */}
        <div className="mb-3 flex flex-wrap gap-4 text-xs">
          <span className="text-slate-500">
            {t('admin.schemes.startDate')}:{' '}
            <span className="text-slate-200">{item.payloadSummary.start ?? '—'}</span>
          </span>
          <span className="text-slate-500">
            {t('admin.schemes.endDate')}:{' '}
            <span className="text-slate-200">
              {item.payloadSummary.alwaysOpen
                ? t('admin.schemes.alwaysOpen')
                : (item.payloadSummary.end ?? '—')}
            </span>
          </span>
        </div>

        {item.isNew ? (
          <AdminNote tone="info">{t('admin.queue.newSchemeNote')}</AdminNote>
        ) : item.changes.length === 0 ? (
          <AdminNote>{t('admin.queue.noChanges')}</AdminNote>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mb-2 text-xs font-medium text-sky-400 hover:text-sky-300"
            >
              {expanded
                ? t('admin.queue.hideDiff')
                : t('admin.queue.showDiff', { count: item.changes.length })}
            </button>
            {expanded ? (
              <DiffView changes={item.changes} labelFor={(path) => t(`admin.queue.field.${path}`)} />
            ) : null}
          </>
        )}

        {item.fetcherNote ? (
          <p className="mt-2 text-xs text-slate-600">{item.fetcherNote}</p>
        ) : null}

        {state.error ? (
          <div className="mt-3">
            <AdminNote tone="danger">{t(state.error)}</AdminNote>
          </div>
        ) : null}
        {state.notice ? (
          <div className="mt-3">
            <AdminNote tone="success">{t(state.notice)}</AdminNote>
          </div>
        ) : null}

        {canReview && !settled ? (
          <div className="mt-3 space-y-2">
            <AdminTextarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('admin.queue.notePlaceholder')}
              className="font-sans"
            />
            <div className="flex flex-wrap items-center gap-2">
              <form action={approveAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="note" value={note} />
                <AdminButton
                  type="submit"
                  variant={expanded ? 'primary' : 'secondary'}
                  disabled={pending}
                  title={expanded ? undefined : t('admin.queue.readFirst')}
                >
                  {approvePending ? t('admin.queue.publishing') : t('admin.queue.approve')}
                </AdminButton>
              </form>

              <form action={rejectAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="note" value={note} />
                <AdminButton type="submit" variant="ghost" disabled={pending}>
                  {t('admin.queue.reject')}
                </AdminButton>
              </form>

              <span className="text-xs text-slate-600">{t('admin.queue.approveHint')}</span>
            </div>
          </div>
        ) : !canReview ? (
          <p className="mt-3 text-xs text-slate-600">{t('admin.queue.cannotReview')}</p>
        ) : null}
      </div>
    </article>
  );
}
