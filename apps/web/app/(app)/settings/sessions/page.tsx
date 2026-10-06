import { CircleHelp, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { Alert, Badge, Card } from '@assistigo/ui';
import type { DeviceClass } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { listActiveSessions, type ActiveSession } from '@/lib/auth/active-sessions';
import { getTranslations } from '@/lib/i18n/server';
import { logger } from '@/lib/api/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RevokeOthersButton, RevokeSessionButton } from './session-actions';

export const metadata = { title: 'Sessions & devices' };

/** Inside this window a session counts as "active now" rather than showing a time. */
const ACTIVE_NOW_MS = 5 * 60_000;

const DEVICE_ICONS: Record<DeviceClass, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: CircleHelp,
};

/**
 * Where this person's account is signed in (master spec §19.4 — device/session list and session
 * revocation; AUTH-05).
 *
 * Every member can open it: it shows and ends the caller's OWN sessions, never anyone else's,
 * so there is no organization permission to check. Data comes from `list_my_auth_sessions()`
 * (migration 0031), which selects by the caller's JWT.
 */
export default async function SessionsPage() {
  await requireSession();
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  let sessions: ActiveSession[] | null = null;
  try {
    sessions = await listActiveSessions(supabase);
  } catch (error) {
    logger.error('auth.session_list_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  const dateTime = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const formatTime = (iso: string) => dateTime.format(new Date(iso));
  const now = Date.now();

  const otherCount = sessions?.filter((session) => !session.isCurrent).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('settings.sessions.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('settings.sessions.subtitle')}</p>
      </div>

      {sessions === null ? (
        <Alert tone="danger" title={t('settings.sessions.loadFailedTitle')}>
          {t('settings.sessions.loadFailed')}
        </Alert>
      ) : (
        <Card
          title={t('settings.sessions.listTitle', { count: sessions.length })}
          actions={otherCount > 0 ? <RevokeOthersButton count={otherCount} /> : undefined}
        >
          {sessions.length === 0 ? (
            // Only reachable if the session behind this very request has already ended.
            <p className="text-sm text-slate-500">{t('settings.sessions.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((session) => {
                const Icon = DEVICE_ICONS[session.device];
                const activeNow = now - new Date(session.lastActiveAt).getTime() < ACTIVE_NOW_MS;
                const browser = session.browser ?? t('settings.sessions.unknownBrowser');
                const os = session.os ?? t('settings.sessions.unknownOs');

                return (
                  <li
                    key={session.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                          {t('settings.sessions.browserOnOs', { browser, os })}
                          {session.isCurrent ? (
                            <Badge tone="success">{t('settings.sessions.thisDevice')}</Badge>
                          ) : null}
                        </p>
                        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <div className="flex gap-1">
                            <dt>{t('settings.sessions.ipAddress')}:</dt>
                            <dd className="font-mono">
                              {session.ipAddress ?? t('settings.sessions.unknown')}
                            </dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>{t('settings.sessions.signedIn')}:</dt>
                            <dd>{formatTime(session.createdAt)}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>{t('settings.sessions.lastActive')}:</dt>
                            <dd>
                              {activeNow || session.isCurrent
                                ? t('settings.sessions.activeNow')
                                : formatTime(session.lastActiveAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    {session.isCurrent ? null : (
                      <div className="sm:shrink-0">
                        <RevokeSessionButton
                          sessionId={session.id}
                          label={t('settings.sessions.revokeLabel', { browser, os })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Alert tone="info">{t('settings.sessions.extensionNote')}</Alert>
    </div>
  );
}
