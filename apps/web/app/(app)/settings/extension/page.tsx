import Link from 'next/link';
import { ListChecks, Puzzle, ShieldCheck } from 'lucide-react';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { requireSession } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { ExtensionStatus } from './extension-status';

export const metadata = { title: 'Browser extension' };

const STEPS = ['install', 'open', 'connect'] as const;

/**
 * Setup help for the extension. Pairing itself must start from the extension, which names itself
 * to /extension/connect, so this page explains that rather than linking there.
 */
export default async function ExtensionSettingsPage() {
  await requireSession();
  const { t } = await getTranslations();

  return (
    <div className="space-y-5">
      <SettingsPageHeader
        section="extension"
        title={t('settings.extension.title')}
        subtitle={t('settings.extension.subtitle')}
      />

      <SettingsCard
        icon={<Puzzle className="h-5 w-5" aria-hidden />}
        title={t('settings.extension.statusTitle')}
        action={<ExtensionStatus />}
      >
        <p className="text-sm text-slate-600">{t('settings.extension.statusBody')}</p>
      </SettingsCard>

      <SettingsCard
        icon={<ListChecks className="h-5 w-5" aria-hidden />}
        title={t('settings.extension.stepsTitle')}
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="rounded-xl bg-slate-50/70 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {t(`settings.extension.steps.${step}.title`)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t(`settings.extension.steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </SettingsCard>

      <SettingsCard
        icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        title={t('settings.extension.disconnectTitle')}
      >
        <p className="text-sm text-slate-600">{t('settings.sessions.extensionNote')}</p>
        <Link
          href="/settings/sessions"
          className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
        >
          {t('settings.securityPage.sessionsAction')}
        </Link>
      </SettingsCard>
    </div>
  );
}
