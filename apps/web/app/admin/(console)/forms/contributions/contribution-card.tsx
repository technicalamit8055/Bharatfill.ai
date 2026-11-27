'use client';

import { useActionState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { AdminBadge, AdminButton, AdminNote } from '../../ui';
import {
  approveContributionAction,
  rejectContributionAction,
  type ContributionActionState,
} from './actions';

export type ContributionCardItem = {
  ids: string[];
  pageOrigin: string;
  pathPattern: string;
  labelText: string | null;
  sectionHeading: string | null;
  attribute: string | null;
  inputType: string;
  customerField: string;
  customerFieldLabel: string;
  centres: number;
  lastSeen: string;
  conflicts: { customerField: string; label: string; centres: number }[];
  targetAdapter: string | null;
};

/**
 * One taught mapping, as every centre that sent it agrees on it.
 *
 * Shows the portal's own text and the field it was taught as, side by side, because the
 * reviewer's only question is "is this box really that field?". A box centres disagree on says
 * so above the buttons.
 */
export function ContributionCard({
  item,
  canReview,
}: {
  item: ContributionCardItem;
  canReview: boolean;
}) {
  const t = useTranslations();
  const [approveState, approveAction, approvePending] = useActionState<
    ContributionActionState,
    FormData
  >(approveContributionAction, {});
  const [rejectState, rejectAction, rejectPending] = useActionState<
    ContributionActionState,
    FormData
  >(rejectContributionAction, {});

  const state = approveState.error || approveState.notice ? approveState : rejectState;
  const pending = approvePending || rejectPending;
  const settled = Boolean(approveState.notice || rejectState.notice);
  const ids = item.ids.join(',');

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/60">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-slate-500">
            {item.pageOrigin}
            {item.pathPattern}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {/* Portal text, rendered as text. */}
            <h3 className="text-sm font-semibold text-slate-100">
              {item.labelText ?? item.attribute ?? t('admin.contributions.noLabel')}
            </h3>
            <span className="text-slate-600" aria-hidden>
              →
            </span>
            <AdminBadge tone="accent">{item.customerFieldLabel}</AdminBadge>
            <span className="font-mono text-[11px] text-slate-500">{item.customerField}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {item.sectionHeading
              ? t('admin.contributions.section', { heading: item.sectionHeading })
              : null}
            {item.sectionHeading ? ' · ' : null}
            {t('admin.contributions.inputType', { type: item.inputType })}
            {item.attribute ? ` · ${item.attribute}` : null}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">
          <AdminBadge tone={item.centres > 1 ? 'success' : 'neutral'}>
            {t('admin.contributions.centres', { count: item.centres })}
          </AdminBadge>
          <div className="mt-1">{item.lastSeen}</div>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3">
        {item.conflicts.length > 0 ? (
          <AdminNote tone="warning">
            {t('admin.contributions.conflict', {
              others: item.conflicts
                .map((conflict) =>
                  t('admin.contributions.conflictItem', {
                    field: conflict.label,
                    count: conflict.centres,
                  }),
                )
                .join(', '),
            })}
          </AdminNote>
        ) : null}

        <p className="text-xs text-slate-500">
          {item.targetAdapter
            ? t('admin.contributions.target', { adapter: item.targetAdapter })
            : t('admin.contributions.targetNew')}
        </p>

        {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
        {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}

        {canReview && !settled ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={approveAction}>
              <input type="hidden" name="ids" value={ids} />
              <AdminButton type="submit" variant="secondary" disabled={pending}>
                {approvePending ? t('admin.contributions.approving') : t('admin.contributions.approve')}
              </AdminButton>
            </form>
            <form action={rejectAction}>
              <input type="hidden" name="ids" value={ids} />
              <AdminButton type="submit" variant="ghost" disabled={pending}>
                {t('admin.contributions.reject')}
              </AdminButton>
            </form>
            <span className="text-xs text-slate-600">{t('admin.contributions.approveHint')}</span>
          </div>
        ) : !canReview ? (
          <p className="text-xs text-slate-600">{t('admin.contributions.cannotReview')}</p>
        ) : null}
      </div>
    </article>
  );
}
