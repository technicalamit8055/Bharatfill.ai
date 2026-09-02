'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  SCHEME_CATEGORIES,
  SCHEME_CATEGORY_LABELS,
  schemeEligibilityCriteriaSchema,
} from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import type { AdminSchemeInput } from '@/lib/admin/scheme-write';
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
import { saveSchemeAction, type SchemeActionState } from './actions';

/**
 * The global scheme editor.
 *
 * The whole draft is posted as one JSON field rather than forty flat inputs. A scheme definition
 * is a nested object — localised `{en, hi}` pairs throughout and an eligibility criteria tree —
 * and flattening it into `FormData` keys would mean a second, unvalidated schema living in string
 * concatenation on both sides.
 *
 * Eligibility is edited as JSON on purpose. It is a small declarative language (age relaxations
 * per category, accepted qualifications, required documents), it is validated against the real
 * Zod schema as you type, and a generated form over it would be a worse editor than a textarea
 * with live validation — this is an internal tool used by people who know the vocabulary.
 */

type Props = {
  /** Absent for a new scheme. */
  schemeId?: string;
  initial: AdminSchemeInput;
  canPublish: boolean;
  readOnly?: boolean;
};

export function SchemeForm({ schemeId, initial, canPublish, readOnly = false }: Props) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SchemeActionState, FormData>(
    saveSchemeAction,
    {},
  );

  const [draft, setDraft] = useState<AdminSchemeInput>(initial);
  const [eligibilityText, setEligibilityText] = useState(() =>
    JSON.stringify(initial.eligibility, null, 2),
  );

  /**
   * Live validation of the eligibility JSON.
   *
   * Reported as you type rather than on submit because the failure mode this guards against is a
   * malformed criterion silently becoming `undefined` — which widens eligibility instead of
   * narrowing it, and tells a citizen they qualify for something they do not.
   */
  const eligibility = useMemo(() => {
    try {
      const parsed = schemeEligibilityCriteriaSchema.safeParse(JSON.parse(eligibilityText));
      if (!parsed.success) {
        return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'invalid' };
      }
      return { ok: true as const, value: parsed.data };
    } catch {
      return { ok: false as const, error: 'admin.schemes.eligibilityNotJson' };
    }
  }, [eligibilityText]);

  const set = <K extends keyof AdminSchemeInput>(key: K, value: AdminSchemeInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setLocalised = (
    key: 'title' | 'shortDescription' | 'benefitsSummary' | 'benefitHighlight' | 'pitchTemplate' | 'upcomingPitchTemplate',
    locale: 'en' | 'hi',
    value: string,
  ) => setDraft((current) => ({ ...current, [key]: { ...current[key], [locale]: value } }));

  const setSchedule = (patch: Partial<AdminSchemeInput['schedule']>) =>
    setDraft((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));

  const payload = JSON.stringify({
    ...draft,
    eligibility: eligibility.ok ? eligibility.value : draft.eligibility,
  });

  const fieldError = (path: string) => (state.fields?.[path] ? t(state.fields[path]!) : undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="scheme" value={payload} />
      {schemeId ? <input type="hidden" name="id" value={schemeId} /> : null}

      {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
      {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}
      {readOnly ? <AdminNote>{t('admin.schemes.readOnly')}</AdminNote> : null}

      <AdminCard title={t('admin.schemes.sectionIdentity')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField
            label={t('admin.schemes.slug')}
            hint={t('admin.schemes.slugHint')}
            error={fieldError('slug')}
            htmlFor="slug"
          >
            <AdminInput
              id="slug"
              value={draft.slug}
              disabled={readOnly}
              onChange={(event) => set('slug', event.target.value)}
            />
          </AdminField>

          <AdminField label={t('admin.schemes.category')} htmlFor="category">
            <AdminSelect
              id="category"
              value={draft.category}
              disabled={readOnly}
              onChange={(event) =>
                set('category', event.target.value as AdminSchemeInput['category'])
              }
            >
              {SCHEME_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {SCHEME_CATEGORY_LABELS[category].en}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          <AdminField label={t('admin.schemes.portalName')} error={fieldError('portalName')}>
            <AdminInput
              value={draft.portalName}
              disabled={readOnly}
              onChange={(event) => set('portalName', event.target.value)}
            />
          </AdminField>

          <AdminField label={t('admin.schemes.portalUrl')} error={fieldError('portalUrl')}>
            <AdminInput
              type="url"
              value={draft.portalUrl}
              disabled={readOnly}
              onChange={(event) => set('portalUrl', event.target.value)}
            />
          </AdminField>

          <AdminField
            label={t('admin.schemes.adapterSlug')}
            hint={t('admin.schemes.adapterSlugHint')}
          >
            <AdminInput
              value={draft.adapterSlug ?? ''}
              disabled={readOnly}
              onChange={(event) => set('adapterSlug', event.target.value || null)}
            />
          </AdminField>

          <AdminField
            label={t('admin.schemes.notificationUrl')}
            hint={t('admin.schemes.notificationUrlHint')}
            error={fieldError('officialNotificationUrl')}
          >
            <AdminInput
              type="url"
              value={draft.officialNotificationUrl ?? ''}
              disabled={readOnly}
              onChange={(event) => set('officialNotificationUrl', event.target.value || null)}
            />
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard
        title={t('admin.schemes.sectionCopy')}
        description={t('admin.schemes.sectionCopyHelp')}
      >
        <div className="space-y-3">
          {(
            [
              ['title', t('admin.schemes.fieldTitle')],
              ['benefitHighlight', t('admin.schemes.fieldHighlight')],
              ['shortDescription', t('admin.schemes.fieldShortDescription')],
              ['benefitsSummary', t('admin.schemes.fieldBenefits')],
              ['pitchTemplate', t('admin.schemes.fieldPitch')],
              ['upcomingPitchTemplate', t('admin.schemes.fieldUpcomingPitch')],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-3 sm:grid-cols-2">
              <AdminField label={`${label} (EN)`} error={fieldError(`${key}.en`)}>
                <AdminInput
                  value={draft[key].en}
                  disabled={readOnly}
                  onChange={(event) => setLocalised(key, 'en', event.target.value)}
                />
              </AdminField>
              <AdminField label={`${label} (हिं)`} error={fieldError(`${key}.hi`)}>
                <AdminInput
                  value={draft[key].hi}
                  disabled={readOnly}
                  onChange={(event) => setLocalised(key, 'hi', event.target.value)}
                />
              </AdminField>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title={t('admin.schemes.sectionWindow')}
        description={t('admin.schemes.sectionWindowHelp')}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <AdminField label={t('admin.schemes.startDate')}>
            <AdminInput
              type="date"
              value={draft.schedule.applicationStartDate ?? ''}
              disabled={readOnly}
              onChange={(event) =>
                setSchedule({ applicationStartDate: event.target.value || null })
              }
            />
          </AdminField>
          <AdminField
            label={t('admin.schemes.endDate')}
            error={fieldError('schedule.applicationEndDate')}
          >
            <AdminInput
              type="date"
              value={draft.schedule.applicationEndDate ?? ''}
              disabled={readOnly || draft.schedule.isAlwaysOpen}
              onChange={(event) => setSchedule({ applicationEndDate: event.target.value || null })}
            />
          </AdminField>
          <AdminField label={t('admin.schemes.examDate')}>
            <AdminInput
              type="date"
              value={draft.schedule.examDate ?? ''}
              disabled={readOnly}
              onChange={(event) => setSchedule({ examDate: event.target.value || null })}
            />
          </AdminField>
        </div>
        <div className="mt-3">
          <AdminCheckbox
            label={t('admin.schemes.alwaysOpenLabel')}
            checked={draft.schedule.isAlwaysOpen}
            disabled={readOnly}
            onChange={(event) =>
              // Ticking "open all year" clears the end date rather than letting the two disagree;
              // the database refuses that combination outright (0020).
              setSchedule({
                isAlwaysOpen: event.target.checked,
                applicationEndDate: event.target.checked ? null : draft.schedule.applicationEndDate,
              })
            }
          />
          <p className="mt-1 text-xs text-slate-600">{t('admin.schemes.noWindowHint')}</p>
        </div>
      </AdminCard>

      <AdminCard
        title={t('admin.schemes.sectionEligibility')}
        description={t('admin.schemes.sectionEligibilityHelp')}
      >
        <AdminField
          label={t('admin.schemes.eligibilityJson')}
          error={eligibility.ok ? undefined : t(eligibility.error)}
          hint={eligibility.ok ? t('admin.schemes.eligibilityValid') : undefined}
        >
          <AdminTextarea
            rows={14}
            spellCheck={false}
            value={eligibilityText}
            disabled={readOnly}
            onChange={(event) => setEligibilityText(event.target.value)}
          />
        </AdminField>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AdminField
            label={t('admin.schemes.operatorFee')}
            hint={t('admin.schemes.operatorFeeHint')}
            error={fieldError('estimatedOperatorFee')}
          >
            <AdminInput
              type="number"
              min={0}
              max={10000}
              value={draft.estimatedOperatorFee}
              disabled={readOnly}
              onChange={(event) => set('estimatedOperatorFee', Number(event.target.value))}
            />
          </AdminField>
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminCheckbox
          label={t('admin.schemes.publishLabel')}
          checked={draft.isPublished}
          disabled={readOnly || !canPublish}
          onChange={(event) => set('isPublished', event.target.checked)}
        />
        <div className="flex items-center gap-2">
          {!eligibility.ok ? (
            <span className="text-xs text-rose-400">{t('admin.schemes.fixEligibilityFirst')}</span>
          ) : null}
          <AdminButton
            type="submit"
            variant="primary"
            disabled={readOnly || pending || !eligibility.ok}
          >
            {pending ? t('common.saving') : t('common.save')}
          </AdminButton>
        </div>
      </div>

      {!canPublish ? <AdminNote>{t('admin.schemes.cannotPublishNote')}</AdminNote> : null}
    </form>
  );
}
