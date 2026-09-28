'use client';

import { useActionState, useState } from 'react';
import { SUPPORT_LEVELS } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { serializePlanDraft, type AdminPlanInput } from '@/lib/admin/plan-write';
import {
  AdminButton,
  AdminCard,
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminNote,
  AdminSelect,
} from '../ui';
import { savePlanAction, type PlanActionState } from './actions';

/**
 * The plan editor. Posts the whole draft as one JSON field, like the scheme editor, so the
 * server validates exactly one schema (`adminPlanInputSchema`).
 */

type Props = {
  /** Absent for a new plan. */
  planId?: string;
  initial: AdminPlanInput;
  /** Organizations on the plan. When above zero the price is locked. */
  organizations: number;
  readOnly?: boolean;
};

type UnlimitedKey = 'includedFills' | 'includedAiExtractions' | 'maxCustomers';

/** Parses a number input; an empty or non-numeric box becomes NaN, which the schema rejects. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

export function PlanForm({ planId, initial, organizations, readOnly = false }: Props) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(savePlanAction, {});
  const [draft, setDraft] = useState<AdminPlanInput>(initial);
  // The last number typed into each unlimited-capable box, restored when "Unlimited" is unticked.
  const [lastLimits, setLastLimits] = useState<Record<UnlimitedKey, number>>({
    includedFills: initial.includedFills ?? 100,
    includedAiExtractions: initial.includedAiExtractions ?? 50,
    maxCustomers: initial.maxCustomers ?? 500,
  });

  const isNew = !planId;
  const priceLocked = !isNew && organizations > 0;

  const set = <K extends keyof AdminPlanInput>(key: K, value: AdminPlanInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setFeature = <K extends keyof AdminPlanInput['features']>(
    key: K,
    value: AdminPlanInput['features'][K],
  ) => setDraft((current) => ({ ...current, features: { ...current.features, [key]: value } }));

  const fieldError = (path: string) => (state.fields?.[path] ? t(state.fields[path]!) : undefined);

  const numberField = (key: 'priceMonthlyInr' | 'includedSeats' | 'storageMb' | 'sortOrder', options?: { disabled?: boolean }) => (
    <AdminInput
      id={key}
      type="number"
      inputMode="numeric"
      min={key === 'includedSeats' ? 1 : 0}
      step={1}
      value={Number.isNaN(draft[key]) ? '' : draft[key]}
      disabled={readOnly || options?.disabled}
      onChange={(event) => set(key, toNumber(event.target.value))}
    />
  );

  const limitField = (key: UnlimitedKey, label: string) => {
    const unlimited = draft[key] === null;
    return (
      <AdminField label={label} error={fieldError(key)} htmlFor={key}>
        <div className="flex items-center gap-3">
          <AdminInput
            id={key}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={unlimited ? '' : Number.isNaN(draft[key]) ? '' : (draft[key] ?? '')}
            placeholder={unlimited ? t('billing.unlimited') : undefined}
            disabled={readOnly || unlimited}
            onChange={(event) => {
              const value = toNumber(event.target.value);
              set(key, value);
              if (!Number.isNaN(value)) setLastLimits((current) => ({ ...current, [key]: value }));
            }}
          />
          <AdminCheckbox
            label={t('billing.unlimited')}
            checked={unlimited}
            disabled={readOnly}
            className="shrink-0"
            onChange={(event) => set(key, event.target.checked ? null : lastLimits[key])}
          />
        </div>
      </AdminField>
    );
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="plan" value={serializePlanDraft(draft)} />
      {planId ? <input type="hidden" name="id" value={planId} /> : null}

      {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
      {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}
      {readOnly ? <AdminNote>{t('admin.plans.readOnly')}</AdminNote> : null}
      {!isNew && organizations > 0 ? (
        <AdminNote tone="warning">{t('admin.plans.liveWarning', { count: organizations })}</AdminNote>
      ) : null}

      <AdminCard title={t('admin.plans.sectionIdentity')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField
            label={t('admin.plans.code')}
            hint={isNew ? t('admin.plans.codeHint') : t('admin.plans.codeImmutable')}
            error={fieldError('code')}
            htmlFor="code"
          >
            <AdminInput
              id="code"
              value={draft.code}
              disabled={readOnly || !isNew}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => set('code', event.target.value.trim().toLowerCase())}
            />
          </AdminField>

          <AdminField
            label={t('admin.plans.sortOrder')}
            hint={t('admin.plans.sortOrderHint')}
            error={fieldError('sortOrder')}
            htmlFor="sortOrder"
          >
            {numberField('sortOrder')}
          </AdminField>

          <AdminField label={t('admin.plans.nameEn')} error={fieldError('name')} htmlFor="name">
            <AdminInput
              id="name"
              value={draft.name}
              disabled={readOnly}
              maxLength={80}
              onChange={(event) => set('name', event.target.value)}
            />
          </AdminField>

          <AdminField
            label={t('admin.plans.nameHi')}
            hint={t('admin.plans.nameHiHint')}
            error={fieldError('nameHi')}
            htmlFor="nameHi"
          >
            <AdminInput
              id="nameHi"
              lang="hi"
              value={draft.nameHi}
              disabled={readOnly}
              maxLength={80}
              onChange={(event) => set('nameHi', event.target.value)}
            />
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard title={t('admin.plans.sectionPrice')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField
            label={t('admin.plans.priceMonthly')}
            hint={priceLocked ? t('admin.plans.priceLocked') : t('admin.plans.priceHint')}
            error={fieldError('priceMonthlyInr')}
            htmlFor="priceMonthlyInr"
          >
            {numberField('priceMonthlyInr', { disabled: priceLocked })}
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard title={t('admin.plans.sectionLimits')} description={t('admin.plans.limitsHint')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {limitField('includedFills', t('admin.plans.includedFills'))}
          {limitField('includedAiExtractions', t('admin.plans.includedAiExtractions'))}
          {limitField('maxCustomers', t('admin.plans.maxCustomers'))}
          <AdminField
            label={t('admin.plans.includedSeats')}
            error={fieldError('includedSeats')}
            htmlFor="includedSeats"
          >
            {numberField('includedSeats')}
          </AdminField>
          <AdminField
            label={t('admin.plans.storageMb')}
            error={fieldError('storageMb')}
            htmlFor="storageMb"
          >
            {numberField('storageMb')}
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard title={t('admin.plans.sectionFeatures')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <AdminCheckbox
              label={t('billing.plans.featureAdapterLibrary')}
              checked={draft.features.adapterLibrary}
              disabled={readOnly}
              onChange={(event) => setFeature('adapterLibrary', event.target.checked)}
            />
            <AdminCheckbox
              label={t('billing.plans.featureAdvancedDocumentTools')}
              checked={draft.features.advancedDocumentTools}
              disabled={readOnly}
              onChange={(event) => setFeature('advancedDocumentTools', event.target.checked)}
            />
            <AdminCheckbox
              label={t('billing.plans.featureBulkImport')}
              checked={draft.features.bulkImport}
              disabled={readOnly}
              onChange={(event) => setFeature('bulkImport', event.target.checked)}
            />
            <AdminCheckbox
              label={t('admin.plans.featureApiAccess')}
              checked={draft.features.apiAccess}
              disabled={readOnly}
              onChange={(event) => setFeature('apiAccess', event.target.checked)}
            />
          </div>
          <AdminField label={t('billing.plans.featureSupport')} htmlFor="support">
            <AdminSelect
              id="support"
              value={draft.features.support}
              disabled={readOnly}
              onChange={(event) =>
                setFeature('support', event.target.value as AdminPlanInput['features']['support'])
              }
            >
              {SUPPORT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`billing.plans.support.${level}`)}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard title={t('admin.plans.sectionAvailability')}>
        <AdminCheckbox
          label={t('admin.plans.activeLabel')}
          checked={draft.active}
          disabled={readOnly}
          onChange={(event) => set('active', event.target.checked)}
        />
        <p className="mt-2 text-xs text-slate-500">
          {fieldError('active') ?? t('admin.plans.activeHint')}
        </p>
      </AdminCard>

      {!readOnly ? (
        <div className="flex justify-end">
          <AdminButton type="submit" variant="primary" disabled={pending}>
            {pending ? t('admin.plans.saving') : isNew ? t('admin.plans.create') : t('admin.plans.save')}
          </AdminButton>
        </div>
      ) : null}
    </form>
  );
}
