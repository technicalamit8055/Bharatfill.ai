/**
 * Headers that tell Supabase Auth who the *person* is when our server calls it for them.
 *
 * Sign-in, sign-out and token refresh all run on the Next server (server actions, middleware,
 * `/api/extension/refresh`), so without these the auth service records every session as Node's
 * user agent and our server's IP, and the sessions roster (/settings/sessions) cannot tell one
 * browser from another. GoTrue takes the first address in `X-Forwarded-For` and the
 * `User-Agent` header as the session's `ip` / `user_agent`.
 *
 * Only the browser's own values are forwarded, and only when they look like what they claim to
 * be. Edge-safe — no `server-only`, no Node APIs — because middleware uses it too.
 */

const MAX_USER_AGENT_LENGTH = 512;

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function clientIp(get: (name: string) => string | null): string | null {
  const candidate =
    get('x-forwarded-for')?.split(',')[0]?.trim() || get('x-real-ip')?.trim() || null;
  if (!candidate) return null;
  if (IPV4.test(candidate)) return candidate;
  if (candidate.includes(':') && IPV6.test(candidate) && candidate.length <= 45) return candidate;
  return null;
}

export function forwardedClientHeaders(
  get: (name: string) => string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const userAgent = get('user-agent')?.trim();
  if (userAgent) headers['user-agent'] = userAgent.slice(0, MAX_USER_AGENT_LENGTH);

  const ip = clientIp(get);
  if (ip) headers['x-forwarded-for'] = ip;

  return headers;
}
