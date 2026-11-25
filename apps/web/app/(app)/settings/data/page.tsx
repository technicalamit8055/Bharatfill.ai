import { Clock, Download, FolderClock } from 'lucide-react';
import { DEFAULT_RETENTION, RETENTION_PRESETS } from '@assistigo/core';
import { Alert, Badge } from '@assistigo/ui';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { requirePagePermission } from '@/lib/auth/session';
import { localised } from '@/lib/i18n';
import { getTranslations } from '@/lib/i18n/server';

export const metadata = { title: 'Data retention' };

const ROWS = ['customers', 'documents', 'walkIn', 'activity'] as const;

/**
 * What is kept, and for how long. Deliberately read-only: no `retention.sweep` handler exists, so
 * offering a period here would promise a deletion that never runs. The period shown is what the
 * software does today, not the unused `organizations.settings.retention` value.
 */
export default async function DataRetentionPage() {
  await requirePagePermission('org.settings');
  const { t, locale } = await getTranslations();
  const policy = RETENTION_PRESETS.find((preset) => preset.code === DEFAULT_RETENTION);

  return (
    <div className="space-y-5">
      <SettingsPageHeader
        section="data"
        title={t('settings.dataRetention')}
        subtitle={t('settings.data.subtitle')}
      />

      <SettingsCard
        icon={<Clock className="h-5 w-5" aria-hidden />}
        title={t('settings.data.policyTitle')}
        action={policy ? <Badge tone="info">{localised(policy.label, locale)}</Badge> : null}
      >
        <p className="text-sm text-slate-600">{t('settings.data.policyBody')}</p>
      </SettingsCard>

      <SettingsCard
        icon={<FolderClock className="h-5 w-5" aria-hidden />}
        title={t('settings.data.keptTitle')}
      >
        <dl className="divide-y divide-slate-100">
          {ROWS.map((row) => (
            <div key={row} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm font-semibold text-slate-900">
                {t(`settings.data.rows.${row}.label`)}
              </dt>
              <dd className="text-sm text-slate-600 sm:col-span-2">
                {t(`settings.data.rows.${row}.body`)}
              </dd>
            </div>
          ))}
        </dl>
      </SettingsCard>

      <SettingsCard
        icon={<Download className="h-5 w-5" aria-hidden />}
        title={t('settings.data.exportTitle')}
      >
        <Alert tone="info">{t('settings.data.exportBody')}</Alert>
      </SettingsCard>
    </div>
  );
}
