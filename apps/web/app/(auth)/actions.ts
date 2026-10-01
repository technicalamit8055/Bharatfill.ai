'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';
import { recordPasswordChange } from '@/lib/auth/password-audit';
import { oauthCallbackUrl, safeNext } from '@/lib/auth/redirects';
import { publicEnv, serverEnv } from '@/lib/env';

export type AuthFormState = { error?: string; notice?: string };

/**
 * Passwords: length is the property that actually resists guessing, so the rule is a longer
 * minimum plus a token check for mixed content, rather than a thicket of character classes
 * that pushes people towards Password1! (spec §19.4).
 */
const passwordSchema = z
  .string()
  .min(10, 'auth.passwordHint')
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), 'auth.passwordHint');

const signInSchema = z.object({
  email: z.string().trim().email('validation.email_invalid'),
  password: z.string().min(1, 'auth.invalidCredentials'),
  next: z.string().optional(),
});

const signUpSchema = z
  .object({
    email: z.string().trim().email('validation.email_invalid'),
    password: passwordSchema,
    confirmPassword: z.string(),
    consent: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'auth.passwordMismatch',
    path: ['confirmPassword'],
  })
  .refine((data) => data.consent === 'on', {
    message: 'auth.consentRequired',
    path: ['consent'],
  });

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately identical for "no such user" and "wrong password" so the form cannot be
    // used to enumerate which emails have accounts.
    logger.warn('auth.login_failed', { reason: error.message });
    return { error: 'auth.invalidCredentials' };
  }

  redirect(safeNext(parsed.data.next));
}

/**
 * Starts a Google sign-in. Off unless the deployment sets AUTH_GOOGLE_ENABLED=on, because turning
 * it on also needs a Google OAuth client configured in Supabase, and a first Google sign-in
 * creates an account without passing the sign-up consent step.
 */
export async function signInWithGoogleAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (serverEnv().AUTH_GOOGLE_ENABLED !== 'on') return { error: 'auth.googleUnavailable' };

  const next = formData.get('next');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: oauthCallbackUrl(
        publicEnv().NEXT_PUBLIC_APP_URL,
        typeof next === 'string' ? next : undefined,
      ),
    },
  });

  if (error || !data.url) {
    logger.warn('auth.oauth_start_failed', { provider: 'google', reason: error?.message });
    return { error: 'errors.internal' };
  }

  redirect(data.url);
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    logger.warn('auth.signup_failed', { reason: error.message });
    return { error: 'errors.internal' };
  }

  // With email confirmation on there is no session yet; tell them to check their inbox.
  if (!data.session) return { notice: 'auth.checkEmail' };

  redirect('/onboarding');
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = z.string().trim().email().safeParse(formData.get('email'));

  if (email.success) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email.data, {
      // Through the callback, which turns the one-time code into a session on the server; the
      // reset page then only has to ask "is there a session?" rather than handle a token itself.
      redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
    });
  }

  // Same answer whether or not the address exists, for the same enumeration reason as above.
  return { notice: 'auth.resetSent' };
}

const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'auth.passwordMismatch',
    path: ['confirmPassword'],
  });

/**
 * Completes a password recovery. The caller must already hold the session the emailed link
 * established (`/auth/callback`); without one there is nothing to authorise the change, and the
 * answer is the same "link expired" message the page shows.
 */
export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const supabase = await createSupabaseServerClient();
  // getUser() asks the auth server; getSession() would trust whatever the cookie claims.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'auth.resetLinkInvalid' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    // The reason is logged; the password never is. Supabase rejects reusing the current one and
    // weak-password policy hits, both of which the person can fix by choosing another.
    logger.warn('auth.password_reset_failed', { reason: error.message, code: error.code });
    return {
      error:
        error.code === 'same_password' ? 'auth.passwordUnchanged' : 'auth.passwordResetFailed',
    };
  }

  // Anyone else holding a session for this account — the reason people reset a password — is
  // signed out. This browser keeps its session so the person lands in the dashboard directly.
  const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
  if (revokeError) logger.warn('auth.other_sessions_revoke_failed', { reason: revokeError.message });

  const requestHeaders = await headers();
  await recordPasswordChange(supabase, {
    userId: userData.user.id,
    ipAddress:
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      requestHeaders.get('x-real-ip'),
    userAgent: requestHeaders.get('user-agent'),
    method: 'recovery',
  });

  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
