import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from '@/lib/i18n/server';
import type { SettingsSectionKey } from '@/lib/settings/sections';
import { SETTINGS_ICONS } from './settings-icons';

/** The tinted banner that opens each page under /settings, with the way back to the list. */
export async function SettingsPageHeader({
  section,
  title,
  subtitle,
}: {
  section: SettingsSectionKey;
  title: string;
  subtitle: string;
}) {
  const { t } = await getTranslations();
  const Icon = SETTINGS_ICONS[section].icon;

  return (
    <div className="space-y-3">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('settings.title')}
      </Link>
      <section className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e7f1fe] via-[#f1f7ff] to-white px-5 py-6 sm:px-8">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p>
        </div>
      </section>
    </div>
  );
}
