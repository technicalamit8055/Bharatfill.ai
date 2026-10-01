'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from '@assistigo/ui';
import { resetPasswordAction, type AuthFormState } from '@/app/(auth)/actions';
import { PasswordField } from '@/components/auth/password-field';
import { PasswordStrength } from '@/components/auth/password-strength';
import { useTranslations } from '@/lib/i18n/client';

export function ResetPasswordForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPasswordAction,
    {},
  );
  // Held only to drive the strength meter; it is never submitted separately or logged.
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert tone="danger">{t(state.error)}</Alert> : null}

      <div>
        <PasswordField
          label={t('auth.newPassword')}
          name="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrength value={password} />
      </div>

      <PasswordField
        label={t('auth.confirmNewPassword')}
        name="confirmPassword"
        autoComplete="new-password"
        required
      />

      <Button
        type="submit"
        size="lg"
        loading={pending}
        className="w-full rounded-xl bg-gradient-to-r from-[#0066FF] via-blue-600 to-cyan-500 font-bold shadow-lg shadow-blue-500/25 transition-all duration-300 hover:from-blue-700 hover:via-blue-700 hover:to-cyan-600 hover:shadow-blue-500/40 disabled:bg-none disabled:bg-blue-300"
      >
        {t('auth.setNewPassword')}
      </Button>
    </form>
  );
}
