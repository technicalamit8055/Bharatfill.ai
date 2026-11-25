import Link from 'next/link';
import { Check, History, KeyRound, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { Alert, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { logger } from '@/lib/api/logger';
import { requireSession } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { SECURITY_ACTIVITY_ACTIONS } from '@/lib/settings/sections';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PasswordLinkForm } from './password-link-form';

export const metadata = { title: 'Security' };

const PROTECTION_KEYS = ['noSubmit', 'noOtp', 'masked', 'links'] as const;

/**
 * Every member manages their own password here. The centre's recent account events show only with
 * `audit.view` (and, by RLS, to owners and managers); they cover accounts and team changes, never
 * customers.
 */
export default async function SecurityPage() {
  const session = await requireSession();
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const activity = session.permissions.has('audit.view')
    ? await supabase
        .from('audit_logs')
        .select('id, action, actor_user_id, created_at')
        .eq('organization_id', session.organization.id)
        .in('action', [...SECURITY_ACTIVITY_ACTIONS])
        .order('created_at', { ascending: false })
        .limit(10)
    : null;
  if (activity?.error) {
    logger.error('settings.security_activity_failed', { dbError: activity.error.message });
  }

  const dateTime = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-5">
      <SettingsPageHeader
        section="security"
        title={t('settings.security')}
        subtitle={t('settings.securityPage.subtitle')}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsCard
          icon={<KeyRound className="h-5 w-5" aria-hidden />}
          title={t('settings.securityPage.passwordTitle')}
        >
          <p className="mb-4 text-sm text-slate-600">{t('settings.securityPage.passwordBody')}</p>
          <PasswordLinkForm />
        </SettingsCard>

        <SettingsCard
          icon={<MonitorSmartphone className="h-5 w-5" aria-hidden />}
          title={t('settings.sessions.title')}
        >
          <p className="mb-4 text-sm text-slate-600">{t('settings.securityPage.sessionsBody')}</p>
          <Link
            href="/settings/sessions"
            className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t('settings.securityPage.sessionsAction')}
          </Link>
        </SettingsCard>
      </div>

      <SettingsCard
        icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        title={t('settings.securityPage.protectionsTitle')}
        subtitle={t('settings.securityPage.protectionsSubtitle')}
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {PROTECTION_KEYS.map((key) => (
            <li
              key={key}
              className="flex gap-3 rounded-xl bg-slate-50/70 p-4 text-sm text-slate-700"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              {t(`settings.securityPage.protections.${key}`)}
            </li>
          ))}
        </ul>
      </SettingsCard>

      {activity ? (
        <SettingsCard
          icon={<History className="h-5 w-5" aria-hidden />}
          title={t('settings.securityPage.activityTitle')}
          subtitle={t('settings.securityPage.activitySubtitle')}
        >
          {activity.error ? (
            <Alert tone="danger">{t('errors.internal')}</Alert>
          ) : !activity.data?.length ? (
            <EmptyState title={t('settings.securityPage.activityEmpty')} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <Table>
                <THead>
                  <TR>
                    <TH className="px-4">{t('settings.securityPage.event')}</TH>
                    <TH className="px-4">{t('settings.member')}</TH>
                    <TH className="px-4">{t('settings.securityPage.when')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {activity.data.map((row) => (
                    <TR key={row.id}>
                      <TD className="px-4 py-3">{t(`audit.actions.${row.action}`)}</TD>
                      <TD className="px-4 py-3 text-slate-600">
                        {row.actor_user_id === session.userId ? (
                          t('settings.youBadge')
                        ) : (
                          <span className="font-mono text-xs">
                            {row.actor_user_id?.slice(0, 8) ?? '—'}
                          </span>
                        )}
                      </TD>
                      <TD className="px-4 py-3 text-slate-500">
                        {dateTime.format(new Date(row.created_at))}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </SettingsCard>
      ) : null}
    </div>
  );
}
