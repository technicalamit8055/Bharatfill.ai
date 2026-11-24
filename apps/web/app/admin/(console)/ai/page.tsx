import { Bot } from 'lucide-react';
import { CUSTOMER_FIELDS } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadOwnAiKeySources } from '@/lib/ai/key-sources';
import { AI_PROVIDER_PRESETS, loadPlatformAiSettings } from '@/lib/ai/vendor-settings';
import { getTranslations } from '@/lib/i18n/server';
import { AdminNote, AdminPageHeader } from '../ui';
import { AiSettingsForm } from './ai-settings-form';

export const metadata = { title: 'AI settings' };

/**
 * The one AI setup every centre uses (docs/AI_PIPELINE.md §2). Super Admin only
 * (`platform.team.manage`), like Channels & Bots: a change here reaches every centre at once.
 */
export default async function AdminAiSettingsPage() {
  const session = await requirePlatformPagePermission('platform.team.manage');
  const { t } = await getTranslations();
  const [stored, keySources] = await Promise.all([
    loadPlatformAiSettings(session.supabase),
    loadOwnAiKeySources(session.supabase, session.userId),
  ]);

  const fieldKeys = CUSTOMER_FIELDS.filter((field) => field.storage.kind !== 'derived').map(
    (field) => ({ key: field.key, label: field.label.en }),
  );

  return (
    <>
      <AdminPageHeader
        icon={<Bot />}
        title={t('admin.aiSettings.title')}
        description={t('admin.aiSettings.subtitle')}
      />
      {stored ? null : <AdminNote tone="warning">{t('admin.aiSettings.notSavedYet')}</AdminNote>}
      <AiSettingsForm
        initial={{
          provider: stored?.provider ?? 'vertex',
          baseUrl: stored ? (stored.baseUrl ?? '') : AI_PROVIDER_PRESETS.vertex.defaultBaseUrl,
          model: stored?.model ?? '',
          customPrompt: stored?.customPrompt ?? '',
          hasApiKey: stored?.hasApiKey ?? false,
        }}
        keySources={keySources}
        fieldKeys={fieldKeys}
        presets={AI_PROVIDER_PRESETS}
      />
    </>
  );
}
