import { cookies } from 'next/headers';
import { PLATFORM_ROLE_LABELS } from '@assistigo/core';
import { CONSOLE_THEME_COOKIE, parseConsoleTheme } from '@/lib/admin/console-theme';
import { requirePlatformSession } from '@/lib/admin/session';
import { publicEnv } from '@/lib/env';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { ConsoleShell } from './console-shell';

/**
 * The console shell.
 *
 * `requirePlatformSession()` runs here, so every page under `/admin` is gated before it renders —
 * but each page gates itself again on its own permission, because a layout that happens to run
 * first is a convenience, not a guarantee (a route could be reached in a way that skips it, and
 * "the layout checked" is not a claim worth betting the platform catalogue on).
 *
 * Visually unlike the operator dashboard on purpose — its own chrome, dense tables, and dark by
 * default with a light theme on request (`ConsoleThemeRoot`, tailwind.config.ts): an employee
 * holding both should never be unsure which surface they are editing in.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformSession();
  const { locale } = await getTranslations();
  const theme = parseConsoleTheme((await cookies()).get(CONSOLE_THEME_COOKIE)?.value);

  const [queue, membership] = await Promise.all([
    // The inbox count drives the sidebar badge. Read here rather than per page so it is present
    // on every screen — a queue nobody is reminded of is a queue that grows.
    session.permissions.has('platform.queue.view')
      ? session.supabase
          .from('scraped_schemes_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    // Whether "back to the dashboard" leads anywhere. A staff-only account has no centre, and the
    // link would drop them into onboarding. A head-only count on their own membership rows.
    session.supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.userId)
      .eq('status', 'active'),
  ]);

  return (
    <ConsoleShell
      user={{
        email: session.email,
        roleLabel: localised(PLATFORM_ROLE_LABELS[session.role], locale),
        portal: session.portal,
        viaBootstrap: session.via === 'bootstrap',
        consoleExpiresAt: session.consoleExpiresAt,
      }}
      permissions={[...session.permissions]}
      queueCount={queue.count ?? 0}
      hasDashboard={(membership.count ?? 0) > 0}
      appEnv={publicEnv().NEXT_PUBLIC_APP_ENV}
      initialTheme={theme}
    >
      {children}
    </ConsoleShell>
  );
}
