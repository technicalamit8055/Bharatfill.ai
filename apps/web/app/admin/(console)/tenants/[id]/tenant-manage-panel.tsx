'use client';

import { useActionState, useState } from 'react';
import { CirclePause, CreditCard, RotateCcw, Settings2 } from 'lucide-react';
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { AdminButton, AdminCard, AdminField, AdminInput, AdminNote, AdminSelect } from '../../ui';
import {
  overridePlanAction,
  reactivateTenantAction,
  suspendTenantAction,
  type TenantActionState,
} from './actions';

export type PlanOption = { code: string; name: string; active: boolean; price: number };

/**
 * Super Admin controls for one centre.
 *
 * Every control here is also enforced by the server action it posts to — permission, the pure
 * rules in packages/core/src/platform/tenants.ts, and the confirmation. What the panel adds is
 * friction in the right places: suspension is behind a disclosure, needs a reason and the
 * centre's name typed out, and the plan override says plainly when a paid provider owns the
 * subscription instead of offering a button that would be refused.
 */
export function TenantManagePanel({
  organizationId,
  organizationName,
  suspended,
  currentPlanCode,
  paidProvider,
  plans,
  canSuspend,
  canOverride,
}: {
  organizationId: string;
  organizationName: string;
  suspended: boolean;
  currentPlanCode: string;
  /** The live subscription's provider when it is a paid one (razorpay, stripe), else null. */
  paidProvider: string | null;
  plans: PlanOption[];
  canSuspend: boolean;
  canOverride: boolean;
}) {
  const t = useTranslations();

  return (
    <AdminCard
      icon={<Settings2 />}
      title={t('admin.tenants.manage.title')}
      description={t('admin.tenants.manage.subtitle')}
    >
      <div className="space-y-6">
        {canOverride ? (
          <PlanOverrideForm
            organizationId={organizationId}
            currentPlanCode={currentPlanCode}
            paidProvider={paidProvider}
            plans={plans}
          />
        ) : null}

        {canSuspend ? (
          suspended ? (
            <ReactivateForm organizationId={organizationId} />
          ) : (
            <SuspendForm organizationId={organizationId} organizationName={organizationName} />
          )
        ) : null}
      </div>
    </AdminCard>
  );
}

function Feedback({ state }: { state: TenantActionState }) {
  const t = useTranslations();
  if (state.error) return <AdminNote tone="danger">{t(state.error)}</AdminNote>;
  if (state.notice) return <AdminNote tone="success">{t(state.notice)}</AdminNote>;
  return null;
}

function ReasonField({ label }: { label: string }) {
  const t = useTranslations();
  return (
    <AdminField
      label={label}
      hint={t('admin.tenants.manage.reasonHint', { min: ADMIN_REASON_MIN })}
    >
      <textarea
        name="reason"
        required
        minLength={ADMIN_REASON_MIN}
        maxLength={ADMIN_REASON_MAX}
        rows={2}
        className="w-full rounded-lg border border-slate-700/80 bg-console-field px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
        placeholder={t('admin.tenants.manage.reasonPlaceholder')}
      />
    </AdminField>
  );
}

function PlanOverrideForm({
  organizationId,
  currentPlanCode,
  paidProvider,
  plans,
}: {
  organizationId: string;
  currentPlanCode: string;
  paidProvider: string | null;
  plans: PlanOption[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    overridePlanAction,
    {},
  );
  const choices = plans.filter((plan) => plan.active && plan.code !== currentPlanCode);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-100">
          {t('admin.tenants.manage.planTitle')}
        </h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        {t('admin.tenants.manage.planSubtitle')}
      </p>

      {paidProvider ? (
        <AdminNote tone="warning">
          {t('admin.tenants.manage.paidSubscriptionHint', { provider: paidProvider })}
        </AdminNote>
      ) : choices.length === 0 ? (
        <AdminNote>{t('admin.tenants.manage.noOtherPlans')}</AdminNote>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={organizationId} />
          <Feedback state={state} />
          <AdminField label={t('admin.tenants.manage.newPlan')}>
            <AdminSelect name="planCode" required defaultValue="">
              <option value="" disabled>
                {t('admin.tenants.manage.choosePlan')}
              </option>
              {choices.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name} · ₹{plan.price.toLocaleString('en-IN')}/
                  {t('admin.tenants.manage.perMonth')}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <ReasonField label={t('admin.tenants.manage.reason')} />
          <AdminButton type="submit" variant="primary" disabled={pending} className="w-full">
            {pending ? t('common.saving') : t('admin.tenants.manage.applyPlan')}
          </AdminButton>
        </form>
      )}
    </section>
  );
}

function SuspendForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    suspendTenantAction,
    {},
  );
  const matches = confirm.trim().toLowerCase() === organizationName.trim().toLowerCase();

  return (
    <section className="space-y-3 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
      <div className="flex items-center gap-2">
        <CirclePause className="h-4 w-4 text-rose-300" />
        <h3 className="text-sm font-medium text-rose-100">
          {t('admin.tenants.manage.suspendTitle')}
        </h3>
      </div>
      <p className="text-xs leading-relaxed text-rose-200/80">
        {t('admin.tenants.manage.suspendSubtitle')}
      </p>

      {state.notice ? <Feedback state={state} /> : null}

      {!open ? (
        <AdminButton
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="w-full"
        >
          {t('admin.tenants.manage.suspendStart')}
        </AdminButton>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={organizationId} />
          {state.error ? <Feedback state={state} /> : null}
          <ReasonField label={t('admin.tenants.manage.reason')} />
          <AdminField label={t('admin.tenants.manage.confirmLabel', { name: organizationName })}>
            <AdminInput
              name="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              placeholder={organizationName}
            />
          </AdminField>
          <div className="flex gap-2">
            <AdminButton type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </AdminButton>
            <AdminButton
              type="submit"
              variant="danger"
              disabled={pending || !matches}
              className="flex-1"
            >
              {pending ? t('common.saving') : t('admin.tenants.manage.suspendConfirm')}
            </AdminButton>
          </div>
        </form>
      )}
    </section>
  );
}

function ReactivateForm({ organizationId }: { organizationId: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    reactivateTenantAction,
    {},
  );

  return (
    <section className="space-y-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-emerald-300" />
        <h3 className="text-sm font-medium text-emerald-100">
          {t('admin.tenants.manage.reactivateTitle')}
        </h3>
      </div>
      <p className="text-xs leading-relaxed text-emerald-200/80">
        {t('admin.tenants.manage.reactivateSubtitle')}
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={organizationId} />
        <Feedback state={state} />
        <ReasonField label={t('admin.tenants.manage.reason')} />
        <AdminButton type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? t('common.saving') : t('admin.tenants.manage.reactivateConfirm')}
        </AdminButton>
      </form>
    </section>
  );
}
