'use client';

import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Info, LockKeyhole, TriangleAlert } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { CONSOLE_PORTAL_PATHS, type ConsolePortal } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { consoleSignInAction, type ConsoleSignInState } from '@/app/admin/login/actions';
import type { ConsoleLoginReason } from '@/lib/admin/console-login';

/**
 * The console sign-in form, shared by both portals.
 *
 * When the browser is already signed in (a dashboard session, or a console session that lapsed)
 * the address is filled in and the page reads as "confirm your password" — the step-up pattern —
 * rather than asking a colleague to retype who they are. It stays editable, so signing in as a
 * different account is one change away.
 */

const FIELD =
  'block w-full rounded-lg border border-slate-700/80 bg-console-field px-3 py-2.5 text-sm text-slate-100 shadow-sm placeholder:text-slate-600 transition focus:outline-none focus:ring-2 disabled:opacity-60';

export function ConsoleLoginForm({
  portal,
  signedInEmail,
  next,
  reason,
}: {
  portal: ConsolePortal;
  signedInEmail: string | null;
  next: string;
  reason: ConsoleLoginReason;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ConsoleSignInState, FormData>(
    consoleSignInAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  const isSuper = portal === 'super_admin';
  const focusRing = isSuper
    ? 'focus:border-amber-500/70 focus:ring-amber-500/25'
    : 'focus:border-sky-500/70 focus:ring-sky-500/25';
  const copy = isSuper ? 'admin.login.super' : 'admin.login.team';

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
          {t(`${copy}.formTitle`)}
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          {signedInEmail
            ? t('admin.login.continueAs', { email: signedInEmail })
            : t(`${copy}.formSubtitle`)}
        </p>
      </div>

      {reason && !state.error ? (
        <div className="mb-5 flex gap-2.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-xs leading-relaxed text-slate-300">
          <Info className="mt-px h-4 w-4 shrink-0 text-sky-400" />
          <span>{t(`admin.login.reason.${reason}`)}</span>
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-lg border border-rose-900/80 bg-rose-950/40 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200"
        >
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <p>{t(state.error)}</p>
            {state.otherPortal ? (
              <Link
                href={CONSOLE_PORTAL_PATHS[state.otherPortal]}
                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-rose-100 underline-offset-2 hover:underline"
              >
                {state.otherPortal === 'super_admin'
                  ? t('admin.login.switchToSuper')
                  : t('admin.login.switchToTeam')}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="portal" value={portal} />
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1.5">
          <label htmlFor={emailId} className="block text-xs font-medium text-slate-300">
            {t('admin.login.email')}
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={signedInEmail ?? ''}
            autoFocus={!signedInEmail}
            placeholder={t('admin.login.emailPlaceholder')}
            className={cn(FIELD, focusRing)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={passwordId} className="block text-xs font-medium text-slate-300">
            {t('admin.login.password')}
          </label>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              autoFocus={Boolean(signedInEmail)}
              className={cn(FIELD, focusRing, 'pr-11')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-70',
            isSuper
              ? 'bg-amber-400 text-neutral-950 shadow-amber-950/30 hover:bg-amber-300 focus-visible:ring-amber-400'
              : 'bg-sky-600 text-white shadow-sky-950/30 hover:bg-sky-500 focus-visible:ring-sky-400',
          )}
        >
          <LockKeyhole className="h-4 w-4" />
          {pending ? t('admin.login.signingIn') : t(`${copy}.submit`)}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          {t('admin.login.auditNotice')}
        </p>

        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>
      </form>
    </div>
  );
}
