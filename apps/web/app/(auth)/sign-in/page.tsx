'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState, useId } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { Alert, Button, Field, Input } from '@assistigo/ui';
import { AuthCard } from '@/components/auth/auth-card';
import { PasswordField } from '@/components/auth/password-field';
import { useTranslations } from '@/lib/i18n/client';
import { signInAction, signInWithGoogleAction, type AuthFormState } from '../actions';

export default function SignInPage() {
  const t = useTranslations();
  const params = useSearchParams();
  const emailId = useId();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, {});
  const [googleState, googleAction, googlePending] = useActionState<AuthFormState, FormData>(
    signInWithGoogleAction,
    {},
  );
  const next = params.get('next') ?? '/dashboard';
  const error = state.error ?? googleState.error;

  return (
    <AuthCard
      title={t('auth.signInTitle')}
      highlight={t('app.name')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link href="/sign-up" className="font-semibold text-[#0066FF] hover:underline">
            {t('auth.signUp')}
          </Link>
        </>
      }
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        {error ? <Alert tone="danger">{t(error)}</Alert> : null}

        <Field label={t('auth.email')} htmlFor={emailId} required>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400"
            >
              <Mail size={18} strokeWidth={1.8} />
            </span>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus
              className="rounded-xl py-3 pl-11 focus:ring-[#0066FF] focus-visible:outline-none"
            />
          </div>
        </Field>

        <div className="space-y-2">
          <PasswordField
            label={t('auth.password')}
            name="password"
            autoComplete="current-password"
            required
            icon={<Lock size={18} strokeWidth={1.8} />}
          />
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-[#0066FF] hover:underline"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={googlePending}
          className="group w-full gap-2 rounded-xl bg-gradient-to-r from-[#0066FF] to-cyan-500 h-12 font-bold shadow-lg shadow-blue-500/25 transition-all duration-300 hover:from-blue-700 hover:to-cyan-600 hover:shadow-blue-500/40 disabled:bg-none disabled:bg-blue-300"
        >
          {t('auth.signIn')}
          <ArrowRight
            aria-hidden
            size={18}
            strokeWidth={2.2}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4 text-sm text-slate-400">
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
        {t('auth.orContinue')}
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
      </div>

      <form action={googleAction}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          disabled={googlePending || pending}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 h-12 text-base font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Image src="/auth/google-icon.svg" alt="" width={20} height={20} unoptimized />
          {t('auth.continueWithGoogle')}
        </button>
      </form>
    </AuthCard>
  );
}
