import { requireSession } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { PreferencesForm } from './preferences-form';

export const metadata = { title: 'My preferences' };

/**
 * Settings an operator can change for themselves (master spec §12 — "Language"), plus the
 * starting values for the document tools (§13).
 *
 * Every member can open this page — nothing on it touches organization data, billing or
 * security. The document-tool section only shows for roles that can use those tools.
 */
export default async function PreferencesPage() {
  const session = await requireSession();
  const { t } = await getTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('settings.preferences.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {t('settings.preferences.subtitle')}
        </p>
      </div>

      <PreferencesForm canUseDocumentTools={session.permissions.has('documenttool.use')} />
    </div>
  );
}
