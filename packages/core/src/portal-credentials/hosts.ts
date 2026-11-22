/**
 * Portal host matching for the credential vault's one-click login.
 * Master spec §19.7a; docs/EXTENSION.md § Portal login.
 *
 * Dependency-free on purpose: the content script imports this file directly (by subpath, never
 * through the package barrel) to re-check the page it is about to type a password into.
 *
 * The rule is deliberately narrow. A password is only ever filled on:
 *   - `https:` — never `http:`, `file:` or anything else,
 *   - a hostname that equals an allow-listed host or is a subdomain of one, on a dot boundary,
 *     so `ssc.gov.in` and `otr.ssc.gov.in` match while `notssc.gov.in`, `ssc.gov.in.evil.com`
 *     and `sscXgov.in` do not,
 *   - the default port, and a URL with no embedded `user:pass@` part.
 */

function normaliseHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/** True when `hostname` is one of `allowedHosts` or a subdomain of one. */
export function hostMatchesAllowList(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = normaliseHost(hostname);
  if (host === '') return false;
  return allowedHosts.some((raw) => {
    const allowed = normaliseHost(raw);
    if (allowed === '') return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

/**
 * True when `url` is a page a portal password may be typed into.
 *
 * Accepts either a URL string or the `{ protocol, hostname, port }` triple a `Location` carries.
 */
export function isAllowedLoginLocation(
  location: string | { protocol: string; hostname: string; port: string; username?: string },
  allowedHosts: readonly string[],
): boolean {
  let parsed: { protocol: string; hostname: string; port: string; username?: string; password?: string };
  if (typeof location === 'string') {
    try {
      parsed = new URL(location);
    } catch {
      return false;
    }
  } else {
    parsed = location;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.port !== '' && parsed.port !== '443') return false;
  if (parsed.username || parsed.password) return false;
  return hostMatchesAllowList(parsed.hostname, allowedHosts);
}
