import { findPreset } from '@assistigo/document-tools';
import { summariseChecklist, type ChecklistItem } from '@assistigo/form-engine';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatBytes } from '@/lib/documents/format';
import type { Locale, Translator } from '@/lib/i18n';
import { loadChecklistTargets, loadCustomerChecklist } from '@/lib/documents/checklist';
import { ChecklistIcon } from '../icons';
import { DetailCard } from './detail-card';
import { ChecklistTargetPicker, type TargetOption } from './checklist-target-picker';
import { ChecklistRows, type ChecklistRowView } from './checklist-rows';

/**
 * "Documents needed": the operator picks the form or scheme the customer is applying for, and
 * every document it asks for shows as ready, needing a resize, missing, or one to check by eye —
 * with the one action that moves it forward (master spec §9.7 step 3, §13.3).
 *
 * Everything is worked out here, on the server; the browser receives labels and links only.
 */
export async function DocumentChecklistCard({
  customerId,
  organizationId,
  viewerOrganizationId,
  targetId,
  canUpload,
  canPrepare,
  canReview,
}: {
  customerId: string;
  /** The customer's own organization — the home centre, for a roaming visit. */
  organizationId: string;
  /** The operator's own organization: which forms and schemes they can see. */
  viewerOrganizationId: string;
  targetId: string | null;
  canUpload: boolean;
  canPrepare: boolean;
  canReview: boolean;
}) {
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const targets = await loadChecklistTargets(supabase, viewerOrganizationId, locale);
  if (targets.length === 0) return null;

  const target = targets.find((candidate) => candidate.id === targetId) ?? null;
  const items = target
    ? await loadCustomerChecklist(supabase, { id: customerId, organizationId }, target)
    : [];
  const summary = summariseChecklist(items);

  const options: TargetOption[] = targets.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.subtitle ? `${candidate.title} — ${candidate.subtitle}` : candidate.title,
  }));

  const rows: ChecklistRowView[] = items.map((item) =>
    toRowView(item, { customerId, canUpload, canPrepare, locale, t }),
  );

  return (
    <DetailCard icon={ChecklistIcon} tone="emerald" title={t('customers.checklist.title')}>
      <div className="space-y-4">
        <ChecklistTargetPicker
          options={options}
          value={target?.id ?? ''}
          label={t('customers.checklist.pickLabel')}
          placeholder={t('customers.checklist.pickPlaceholder')}
          formsLabel={t('customers.checklist.groupForms')}
          schemesLabel={t('customers.checklist.groupSchemes')}
        />

        {target ? (
          <>
            <p className="text-sm text-slate-600">
              {summary.outstanding === 0
                ? t('customers.checklist.allReady')
                : t('customers.checklist.summary', {
                    ready: String(summary.ready),
                    total: String(summary.total),
                  })}
            </p>
            <ChecklistRows
              customerId={customerId}
              rows={rows}
              canReview={canReview}
              uploadingLabel={t('customers.checklist.uploadingFor')}
            />
          </>
        ) : (
          <p className="text-sm text-slate-500">{t('customers.checklist.intro')}</p>
        )}
      </div>
    </DetailCard>
  );
}

type Translate = Translator;

function presetHint(code: string | null, locale: Locale, t: Translate): string | null {
  const preset = code ? findPreset(code) : null;
  if (!preset) return null;
  const label = (locale === 'hi' ? preset.labelHi : undefined) ?? preset.label;
  const size =
    preset.minBytes && preset.maxBytes
      ? t('customers.checklist.sizeRange', {
          min: formatBytes(preset.minBytes),
          max: formatBytes(preset.maxBytes),
        })
      : preset.maxBytes
        ? t('customers.checklist.sizeMax', { max: formatBytes(preset.maxBytes) })
        : null;
  return size ? `${label} · ${size}` : label;
}

function prepareHref(item: ChecklistItem, customerId: string): string | null {
  const preset = item.requirement.presetCode ? findPreset(item.requirement.presetCode) : null;
  if (!preset) return null;
  const params = new URLSearchParams({ customerId, preset: preset.code });
  if (preset.category === 'photo' || preset.category === 'signature') {
    if (item.documentId) params.set('documentId', item.documentId);
    return `/document-tools/photo-signature?${params.toString()}`;
  }
  return `/document-tools/pdf-studio?${params.toString()}`;
}

function toRowView(
  item: ChecklistItem,
  context: {
    customerId: string;
    canUpload: boolean;
    canPrepare: boolean;
    locale: Locale;
    t: Translate;
  },
): ChecklistRowView {
  const { t, locale } = context;
  const { requirement } = item;
  const label = (locale === 'hi' ? requirement.label.hi : undefined) ?? requirement.label.en;

  let action: ChecklistRowView['action'] = null;
  if (item.state === 'needs_preparing' && context.canPrepare) {
    const href = prepareHref(item, context.customerId);
    if (href) action = { kind: 'link', href, label: t('customers.checklist.actions.prepare') };
  } else if (item.state === 'ready' && item.documentId) {
    action = {
      kind: 'link',
      href: `/documents/${item.documentId}`,
      label: t('common.view'),
    };
  } else if ((item.state === 'missing' || item.state === 'check_manually') && context.canUpload) {
    action = {
      kind: 'upload',
      documentType: item.uploadType,
      label: t('customers.checklist.actions.upload'),
    };
  }

  return {
    key: requirement.key,
    label,
    state: item.state,
    stateLabel: t(`customers.checklist.states.${item.state}`),
    help:
      item.state === 'needs_preparing' || item.state === 'check_manually'
        ? t(`customers.checklist.stateHelp.${item.state}`)
        : null,
    hint: presetHint(requirement.presetCode, locale, t),
    optional: !requirement.required,
    optionalLabel: t('common.optional'),
    action,
  };
}
