'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { AdminBadge, AdminButton, AdminCheckbox, AdminInput, TD } from '../ui';
import { updateScheduleAction, type SchemeActionState } from '../schemes/actions';

/**
 * One row of the deadline grid: three dates, a toggle, and a save.
 *
 * Each row is its own `<form>` with its own action state, rather than one big form over the whole
 * table. That is the difference between "I moved the SSC closing date" and "I submitted every
 * scheme in the catalogue and hope nothing else changed" — and it means a validation failure on
 * one row does not throw away the edits somebody made on four others.
 */
export function DeadlineRow({
  schemeId,
  title,
  slug,
  portalName,
  status,
  daysRemaining,
  initial,
  readOnly,
}: {
  schemeId: string;
  title: string;
  slug: string;
  portalName: string;
  status: string | null;
  daysRemaining: number | null;
  initial: {
    applicationStartDate: string | null;
    applicationEndDate: string | null;
    examDate: string | null;
    isAlwaysOpen: boolean;
  };
  readOnly: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SchemeActionState, FormData>(
    updateScheduleAction,
    {},
  );

  const [alwaysOpen, setAlwaysOpen] = useState(initial.isAlwaysOpen);
  const [endDate, setEndDate] = useState(initial.applicationEndDate ?? '');
  const [dirty, setDirty] = useState(false);

  const expired =
    !alwaysOpen &&
    endDate !== '' &&
    // Compared as strings: ISO dates sort lexicographically, and building a Date here would
    // reintroduce a timezone into a question that does not have one.
    endDate < new Date().toISOString().slice(0, 10);

  return (
    <tr className="align-top hover:bg-slate-900/40">
      <TD>
        <div className="font-medium text-slate-100">{title}</div>
        <div className="font-mono text-xs text-slate-500">{slug}</div>
        <div className="text-xs text-slate-600">{portalName}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {status ? (
            <AdminBadge tone={status === 'closing_soon' ? 'warning' : 'neutral'}>
              {t(`admin.lifecycle.${status}`)}
            </AdminBadge>
          ) : null}
          {expired ? <AdminBadge tone="danger">{t('admin.deadlines.expired')}</AdminBadge> : null}
          {daysRemaining !== null && daysRemaining >= 0 ? (
            <span className="text-xs text-slate-500">
              {t('admin.schemes.daysLeft', { days: daysRemaining })}
            </span>
          ) : null}
        </div>
      </TD>

      <TD colSpan={2}>
        <form action={formAction} onChange={() => setDirty(true)} className="space-y-2">
          <input type="hidden" name="id" value={schemeId} />

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-500">
                {t('admin.schemes.startDate')}
              </span>
              <AdminInput
                type="date"
                name="applicationStartDate"
                defaultValue={initial.applicationStartDate ?? ''}
                disabled={readOnly}
                className="w-36"
              />
            </label>

            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-500">
                {t('admin.schemes.endDate')}
              </span>
              <AdminInput
                type="date"
                name="applicationEndDate"
                value={alwaysOpen ? '' : endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={readOnly || alwaysOpen}
                className="w-36"
              />
            </label>

            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-500">
                {t('admin.schemes.examDate')}
              </span>
              <AdminInput
                type="date"
                name="examDate"
                defaultValue={initial.examDate ?? ''}
                disabled={readOnly}
                className="w-36"
              />
            </label>

            <div className="pb-1.5">
              <AdminCheckbox
                label={t('admin.deadlines.alwaysOpen')}
                name="isAlwaysOpen"
                checked={alwaysOpen}
                disabled={readOnly}
                onChange={(event) => {
                  setAlwaysOpen(event.target.checked);
                  // Clearing the end date here keeps the submitted pair legal; the database
                  // refuses "open all year" with a closing date outright (0020).
                  if (event.target.checked) setEndDate('');
                }}
              />
            </div>

            <AdminButton
              type="submit"
              variant={dirty ? 'primary' : 'secondary'}
              disabled={readOnly || pending}
              className="mb-0.5"
            >
              {pending ? t('common.saving') : t('common.save')}
            </AdminButton>
          </div>

          {state.error ? (
            <p className="text-xs text-rose-400">
              {t(state.fields?.applicationEndDate ?? state.error)}
            </p>
          ) : null}
          {state.notice ? <p className="text-xs text-emerald-400">{t(state.notice)}</p> : null}
        </form>
      </TD>
    </tr>
  );
}
