import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';
import { safeNext } from '@/lib/auth/redirects';

/**
 * Exchanges the one-time code from a confirmation or magic link for a session cookie.
 * Supabase Auth redirects here after email confirmation and password reset.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  // Only same-origin relative paths, so the callback cannot be turned into an open redirect.
  const destination = safeNext(next);

  // A recovery link that cannot be used (expired, already used, or opened in a different browser
  // from the one that asked for it) goes back to the reset page, which explains it and offers a
  // fresh link, rather than to a sign-in screen that has no idea what the person was doing.
  const failure = destination === '/reset-password' ? '/reset-password' : '/sign-in';

  if (!code) {
    return NextResponse.redirect(`${origin}${failure}?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn('auth.callback_failed', { reason: error.message });
    return NextResponse.redirect(`${origin}${failure}?error=invalid_code`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
