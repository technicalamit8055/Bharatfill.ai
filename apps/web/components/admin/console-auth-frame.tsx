import Link from 'next/link';
import { cookies } from 'next/headers';
import { Clock, EyeOff, LockKeyhole, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@assistigo/ui';
import type { ConsolePortal } from '@assistigo/core';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { CONSOLE_THEME_COOKIE, parseConsoleTheme } from '@/lib/admin/console-theme';
import { getTranslations } from '@/lib/i18n/server';
import { ConsoleThemeRoot, ConsoleThemeSwitch } from './console-theme';

/**
 * The frame around both console sign-in pages.
 *
 * Deliberately unlike the operator sign-in (light, blue, marketing copy): dark, sparse and
 * explicit about what the door leads to. The Super Admin portal is tinted amber–rose and the team
 * portal sky–indigo, so neither can be mistaken for the other — or for the centre login — at a
 * glance, and the same accent carries into the console's brand mark once inside.
 */

const POINTS: Record<ConsolePortal, { icon: typeof Clock; key: string }[]> = {
  super_admin: [
    { icon: ScrollText, key: 'admin.login.super.pointAudit' },
    { icon: Clock, key: 'admin.login.pointSession' },
    { icon: EyeOff, key: 'admin.login.pointPrivacy' },
  ],
  team: [
    { icon: Users, key: 'admin.login.team.pointRoles' },
    { icon: Clock, key: 'admin.login.pointSession' },
    { icon: EyeOff, key: 'admin.login.pointPrivacy' },
  ],
};

export async function ConsoleAuthFrame({
  portal,
  children,
}: {
  portal: ConsolePortal;
  children: React.ReactNode;
}) {
  const { t } = await getTranslations();
  const isSuper = portal === 'super_admin';
  const copy = isSuper ? 'admin.login.super' : 'admin.login.team';
  const theme = parseConsoleTheme((await cookies()).get(CONSOLE_THEME_COOKIE)?.value);

  return (
    <ConsoleThemeRoot
      initialTheme={theme}
      className="flex min-h-dvh bg-slate-950 text-slate-200 antialiased"
    >
      <aside className="relative hidden overflow-hidden border-r border-slate-800/80 lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden
          className={cn(
            'absolute -left-32 -top-32 h-96 w-96 rounded-full blur-3xl',
            isSuper ? 'bg-rose-600/20' : 'bg-indigo-600/25',
          )}
        />
        <div
          aria-hidden
          className={cn(
            'absolute -bottom-40 right-0 h-96 w-96 rounded-full blur-3xl',
            isSuper ? 'bg-amber-500/10' : 'bg-sky-500/15',
          )}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white shadow-lg',
              isSuper
                ? 'bg-gradient-to-br from-amber-400 to-rose-500 shadow-rose-950/50'
                : 'bg-gradient-to-br from-sky-400 to-indigo-500 shadow-indigo-950/50',
            )}
          >
            B
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-50">{t('admin.shell.brand')}</p>
            <p className="text-xs text-slate-500">{t('admin.login.internalOnly')}</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
              isSuper
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-200',
            )}
          >
            {isSuper ? (
              <LockKeyhole className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {t(`${copy}.eyebrow`)}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-50 xl:text-[2.75rem]">
            {t(`${copy}.headline`)}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-400">{t(`${copy}.subtitle`)}</p>

          <ul className="mt-10 space-y-4">
            {POINTS[portal].map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1.5">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">{t('admin.login.legalNote')}</p>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-2.5 lg:invisible">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white',
                isSuper
                  ? 'bg-gradient-to-br from-amber-400 to-rose-500'
                  : 'bg-gradient-to-br from-sky-400 to-indigo-500',
              )}
            >
              B
            </span>
            <span className="text-sm font-semibold text-slate-100">{t('admin.shell.brand')}</span>
          </div>
          <div className="flex items-center gap-2">
            <ConsoleThemeSwitch />
            <LocaleSwitcher tone="dark" />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="px-5 pb-8 sm:px-8">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 border-t border-slate-800/80 pt-5 text-center text-xs text-slate-500">
            <Link
              href={isSuper ? '/staff/login' : '/admin/login'}
              className="font-medium text-slate-300 transition-colors hover:text-slate-50"
            >
              {isSuper ? t('admin.login.switchToTeam') : t('admin.login.switchToSuper')}
            </Link>
            <Link href="/sign-in" className="transition-colors hover:text-slate-300">
              {t('admin.login.operatorLink')}
            </Link>
          </div>
        </footer>
      </div>
    </ConsoleThemeRoot>
  );
}
