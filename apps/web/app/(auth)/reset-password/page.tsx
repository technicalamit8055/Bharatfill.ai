import Link from 'next/link';
import { Alert } from '@assistigo/ui';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Where the emailed recovery link ends up, via `/auth/callback`, which has already turned the
 * one-time code into a session cookie. The page therefore only asks whether a session exists:
 * with one it shows the form, without one (expired, reused, or opened in another browser) it says
 * so and offers a fresh link. The check is advisory — `resetPasswordAction` verifies again.
 */
export default async function ResetPasswordPage() {
  const { t } = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const canReset = Boolean(data.user);

  return (
    <AuthCard
      title={t('auth.setNewPasswordTitle')}
      subtitle={canReset ? t('auth.setNewPasswordSubtitle') : undefined}
      footer={
        <Link href="/sign-in" className="font-semibold text-[#0066FF] hover:underline">
          {t('auth.signIn')}
        </Link>
      }
    >
      {canReset ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-5">
          <Alert tone="danger">{t('auth.resetLinkInvalid')}</Alert>
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0066FF] via-blue-600 to-cyan-500 px-4 py-3 text-base font-bold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40"
          >
            {t('auth.requestNewLink')}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
