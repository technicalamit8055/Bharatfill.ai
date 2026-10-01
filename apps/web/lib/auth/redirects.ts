/**
 * Where a successful sign-in may send someone. Shared by the password form and the Google flow so
 * the two cannot disagree about what counts as a safe destination.
 */

const DEFAULT_DESTINATION = '/dashboard';

/** Only same-origin relative paths may be used as a post-sign-in destination. */
export function safeNext(value: string | undefined | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_DESTINATION;
  }
  return value;
}

/**
 * The URL an OAuth provider returns to. It goes through `/auth/callback`, which exchanges the
 * one-time code for a session on the server and re-checks `next` before redirecting.
 */
export function oauthCallbackUrl(appUrl: string, next: string | undefined | null): string {
  const url = new URL('/auth/callback', appUrl);
  url.searchParams.set('next', safeNext(next));
  return url.toString();
}
