'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import {
  AdminBadge,
  AdminButton,
  AdminCheckbox,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  TD,
} from '../ui';
import { updateAdapterAction, type AdapterActionState } from './actions';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  testing: 'info',
  active: 'success',
  deprecated: 'danger',
};

export function AdapterRow({
  adapter,
  readOnly,
}: {
  adapter: {
    id: string;
    slug: string;
    portalName: string;
    formName: string;
    region: string | null;
    version: string;
    status: string;
    notes: string | null;
    knownIssues: string | null;
    lastVerifiedAt: string | null;
    mappingCount: number;
    successRate: number | null;
  };
  readOnly: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AdapterActionState, FormData>(
    updateAdapterAction,
    {},
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="hover:bg-slate-900/40">
        <TD>
          <div className="font-medium text-slate-100">{adapter.portalName}</div>
          <div className="text-xs text-slate-400">{adapter.formName}</div>
          <div className="font-mono text-xs text-slate-600">{adapter.slug}</div>
        </TD>
        <TD>{adapter.region ?? '—'}</TD>
        <TD>
          <AdminBadge tone={STATUS_TONE[adapter.status] ?? 'neutral'}>
            {t(`formLibrary.status.${adapter.status}`)}
          </AdminBadge>
        </TD>
        <TD className="text-right tabular-nums">{adapter.mappingCount}</TD>
        <TD className="text-right tabular-nums">
          {/*
            An adapter with no fill history has no success rate — shown as a dash rather than 0%,
            because "never used" and "always fails" are opposite signals and must not look alike.
          */}
          {adapter.successRate === null ? '—' : `${Math.round(adapter.successRate * 100)}%`}
        </TD>
        <TD className="text-right">
          <AdminButton type="button" variant="ghost" onClick={() => setOpen((value) => !value)}>
            {open ? t('common.close') : readOnly ? t('common.view') : t('common.edit')}
          </AdminButton>
        </TD>
      </tr>

      {open ? (
        <tr className="bg-slate-900/60">
          <TD colSpan={6}>
            <form action={formAction} className="space-y-3 py-2">
              <input type="hidden" name="id" value={adapter.id} />

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    {t('admin.forms.status')}
                  </span>
                  <AdminSelect name="status" defaultValue={adapter.status} disabled={readOnly}>
                    {['draft', 'testing', 'active', 'deprecated'].map((status) => (
                      <option key={status} value={status}>
                        {t(`formLibrary.status.${status}`)}
                      </option>
                    ))}
                  </AdminSelect>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    {t('admin.forms.version')}
                  </span>
                  <AdminInput value={adapter.version} readOnly disabled />
                </label>

                <div className="flex items-end pb-1.5">
                  <AdminCheckbox
                    name="markVerified"
                    label={t('admin.forms.markVerified')}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">{t('admin.forms.notes')}</span>
                <AdminTextarea
                  name="notes"
                  rows={2}
                  defaultValue={adapter.notes ?? ''}
                  disabled={readOnly}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  {t('admin.forms.knownIssues')}
                </span>
                <AdminTextarea
                  name="knownIssues"
                  rows={2}
                  defaultValue={adapter.knownIssues ?? ''}
                  disabled={readOnly}
                />
              </label>

              <p className="text-xs text-slate-600">{t('admin.forms.mappingsNote')}</p>

              {state.error ? <p className="text-xs text-rose-400">{t(state.error)}</p> : null}
              {state.notice ? <p className="text-xs text-emerald-400">{t(state.notice)}</p> : null}

              {!readOnly ? (
                <AdminButton type="submit" variant="primary" disabled={pending}>
                  {pending ? t('common.saving') : t('common.save')}
                </AdminButton>
              ) : null}
            </form>
          </TD>
        </tr>
      ) : null}
    </>
  );
}
