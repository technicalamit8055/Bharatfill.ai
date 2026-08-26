import { CUSTOMER_FIELDS } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AI_PROVIDER_PRESETS } from '@/lib/ai/vendor-settings';
import type { OrganizationAiSettingsRow } from '@/lib/supabase/database.types';
import { AiSettingsForm } from './ai-settings-form';

export const metadata = { title: 'AI settings' };

/**
 * Organization AI vendor settings (docs/AI_PIPELINE.md §2, docs/SECURITY.md §4).
 *
 * Owner-only (`org.security`), same as any other org security setting — a manager can change
 * ordinary org settings but not this one, because this page is where a third-party API key gets
 * stored and where AI processing gets turned on for every document this workspace ever uploads.
 */
export default async function AiSettingsPage() {
  const session = await requirePagePermission('org.security');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('organization_ai_settings')
    .select('organization_id, provider, wire_format, base_url, model, custom_prompt, api_key_encrypted')
    .eq('organization_id', session.organization.id)
    .maybeSingle();

  const row = data as Pick<
    OrganizationAiSettingsRow,
    'provider' | 'wire_format' | 'base_url' | 'model' | 'custom_prompt' | 'api_key_encrypted'
  > | null;

  const settings = (session.organization.settings ?? {}) as Record<string, unknown>;

  const fieldKeys = CUSTOMER_FIELDS.filter((field) => field.storage.kind !== 'derived').map(
    (field) => ({ key: field.key, label: field.label.en }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('settings.ai.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('settings.ai.subtitle')}</p>
      </div>

      <AiSettingsForm
        initial={{
          provider: row?.provider ?? 'deepseek',
          baseUrl: row?.base_url ?? '',
          model: row?.model ?? '',
          customPrompt: row?.custom_prompt ?? '',
          hasApiKey: Boolean(row?.api_key_encrypted),
          enabled: settings.ai_processing_enabled === true,
        }}
        fieldKeys={fieldKeys}
        presets={AI_PROVIDER_PRESETS}
      />
    </div>
  );
}
