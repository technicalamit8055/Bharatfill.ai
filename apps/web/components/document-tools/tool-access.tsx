'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, UserPlus } from 'lucide-react';
import { cn } from '@assistigo/ui';
import { LaunchCta } from '@/components/landing/launch-dialog';
import { useTranslations } from '@/lib/i18n/client';
import { SIGN_UP_HREF, accountFeatureHref } from '@/lib/document-tools/public-tools';

/**
 * Who is using a document tool, as far as its account-only controls care.
 *
 * `account` is the dashboard (the default, so every existing tool page is unchanged). `guest` is
 * a public `/tools` page: the editors work exactly the same, but anything that would keep a file
 * on a server — the save-to-customer box — is replaced by `AccountGate`.
 *
 * Not an authorization boundary. A guest page has no session to save with, and the derivative
 * routes return 401 without one; this only decides which controls are worth showing.
 */
type ToolAccess =
  | { mode: 'account' }
  | {
      mode: 'guest';
      /** Display hint from cookie names (`looksSignedIn`), never a permission. */
      signedIn: boolean;
      /** The same tool inside the dashboard, where the account features live. */
      appHref: string;
    };

const ToolAccessContext = createContext<ToolAccess>({ mode: 'account' });

export function GuestToolAccess({
  signedIn,
  appHref,
  children,
}: {
  signedIn: boolean;
  appHref: string;
  children: ReactNode;
}) {
  return (
    <ToolAccessContext.Provider value={{ mode: 'guest', signedIn, appHref }}>
      {children}
    </ToolAccessContext.Provider>
  );
}

export function useToolAccess(): ToolAccess {
  return useContext(ToolAccessContext);
}

/**
 * The prompt that stands in for an account-only control on a public tool page.
 *
 * A guest gets "Create free account" first — the point of these pages is to bring people in — and
 * "Sign in" second, returning to the same tool in the dashboard. While sign-ups are closed the
 * create button opens the pre-launch dialog instead (`LaunchCta`). Someone already signed in is
 * offered the dashboard copy of the tool, where the control works.
 */
export function AccountGate({
  title,
  body,
  appHref,
  className,
}: {
  title: string;
  body: string;
  /** Overrides the page's own dashboard link — the PDF bundle prompt points at the bundle. */
  appHref?: string;
  className?: string;
}) {
  const t = useTranslations();
  const access = useToolAccess();
  const signedIn = access.mode === 'guest' && access.signedIn;
  const target = appHref ?? (access.mode === 'guest' ? access.appHref : '/document-tools');

  return (
    <div className={cn('rounded-xl border border-brand-100 bg-brand-50/60 p-3', className)}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm ring-1 ring-brand-100">
          <LockKeyhole className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {signedIn ? t('publicTools.gate.saveSignedIn') : body}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {signedIn ? (
          <Link href={accountFeatureHref(target, true)} className={PRIMARY}>
            {t('publicTools.account.openDashboard')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <>
            <LaunchCta href={SIGN_UP_HREF} className={PRIMARY}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {t('publicTools.account.signUp')}
            </LaunchCta>
            <Link href={accountFeatureHref(target, false)} className={SECONDARY}>
              {t('publicTools.account.signIn')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

const PRIMARY =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
