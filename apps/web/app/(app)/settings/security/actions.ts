'use server';

import { logger } from '@/lib/api/logger';
import { requireSession } from '@/lib/auth/session';
import { publicEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PasswordLinkState = { error?: string; notice?: string };

/** Emails the caller their own recovery link. The address is the session's, never the form's. */
export async function sendPasswordLinkAction(): Promise<PasswordLinkState> {
  const session = await requireSession();
  if (!session.email) return { error: 'settings.securityPage.noEmail' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(session.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    logger.warn('auth.password_link_failed', { code: error.code });
    return { error: 'settings.securityPage.linkFailed' };
  }
  return { notice: 'settings.securityPage.linkSent' };
}
