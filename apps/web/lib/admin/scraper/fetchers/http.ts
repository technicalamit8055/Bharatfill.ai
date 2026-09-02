import 'server-only';

import { z } from 'zod';
import { readNotificationWindow, providerUnavailable } from '@assistigo/core';
import { serverEnv } from '../../../env';
import { logger } from '../../../api/logger';
import { candidateFromWindow } from '../window-candidate';
import type { Fetcher, FetchContext, FetchOutcome } from './types';

/**
 * The HTTP fetcher: reads a public notification page and stages the application window it states.
 *
 * This is the only part of Assistigo that makes an outbound request to a third party the user did
 * not initiate, so it is deliberately the most constrained. Four gates, all of which must pass
 * before a single byte leaves the server:
 *
 *   1. `SCRAPER_HTTP_ENABLED=on`. A deployment switch, not a per-source setting: configuring a
 *      source is a content decision an employee makes, but pointing this deployment's servers at
 *      a government portal is an operational and legal one belonging to whoever runs it.
 *   2. The host is on the allowlist — the built-in public government domains below, plus anything
 *      in `SCRAPER_ALLOWED_HOSTS`. An arbitrary URL in a database row can therefore never become
 *      an arbitrary request, which also closes the obvious SSRF path.
 *   3. `robots.txt` allows the path for our user agent. Fetched first, cached per run, and a
 *      failure to read it is treated as a refusal, not as permission.
 *   4. The response is capped in size and time, and only `text/html` or `text/plain` is read.
 *
 * What it deliberately does NOT do: log in, submit anything, solve a CAPTCHA, follow a
 * cross-host redirect, or read anything behind authentication. Spec §7.3 forbids scraping
 * protected government data, and the design here is that there is no code path that could.
 *
 * It also does not try to discover new schemes. A source names one scheme slug it is watching and
 * the fetcher reports that scheme's dates — so the worst a misparse can produce is a wrong date
 * on a known scheme, sitting in a review queue, rather than an invented scheme.
 */

/**
 * Public government domains a source may be pointed at without extra configuration.
 *
 * Suffix-matched against the host, so `ssc.gov.in` and `www.ssc.gov.in` both match `gov.in`. The
 * list is intentionally the public service domains and nothing else.
 */
const BUILT_IN_ALLOWED_SUFFIXES = ['gov.in', 'nic.in', 'ac.in'] as const;

const USER_AGENT = 'AssistigoSchemeBot/1.0 (+https://assistigo.ai/bot)';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;

const configSchema = z.object({
  /** The catalogue slug this source watches. Required — see the note above about discovery. */
  schemeSlug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export class ScraperDisabledError extends Error {
  readonly code = 'SCRAPER_HTTP_DISABLED';
  constructor() {
    super('The HTTP scraper fetcher is disabled for this deployment (SCRAPER_HTTP_ENABLED).');
    this.name = 'ScraperDisabledError';
  }
}

export function httpFetchingEnabled(): boolean {
  return serverEnv().SCRAPER_HTTP_ENABLED === 'on';
}

/** Hosts allowed by configuration, lower-cased. */
function extraAllowedHosts(): string[] {
  return (serverEnv().SCRAPER_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether a URL may be requested at all.
 *
 * Exported because this is the check worth testing directly: it is the difference between a
 * scraper and a server-side request forgery primitive.
 */
export function isAllowedSourceUrl(rawUrl: string, extraHosts: readonly string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  // Credentials in a URL mean somebody is trying to reach something authenticated.
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();

  // Belt and braces alongside the allowlist: no government portal is on a private address, so a
  // row that names one is either a mistake or an attempt to pivot inside the network.
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    return false;
  }

  if (extraHosts.includes(host)) return true;
  return BUILT_IN_ALLOWED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Minimal robots.txt evaluation for our own user agent.
 *
 * Only `Disallow` under a group that applies to us — `User-agent: *` or our own name — and the
 * longest matching prefix wins, which is the rule every major crawler implements. `Allow` is
 * honoured because a site that disallows `/` and allows `/notifications/` is saying something
 * specific and we should hear it.
 */
export function robotsAllows(robotsTxt: string, path: string, userAgent = USER_AGENT): boolean {
  const agentToken = userAgent.split('/')[0]?.toLowerCase() ?? '';
  let applies = false;
  let best: { allow: boolean; length: number } | null = null;
  // Consecutive `User-agent:` lines share one group of rules.
  let inAgentBlock = false;

  for (const line of robotsTxt.split(/\r?\n/)) {
    const clean = line.split('#')[0]?.trim() ?? '';
    if (!clean) continue;

    const [rawKey, ...rest] = clean.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      if (!inAgentBlock) applies = false;
      inAgentBlock = true;
      if (agent === '*' || agent === agentToken) applies = true;
      continue;
    }

    inAgentBlock = false;
    if (!applies) continue;
    if (key !== 'disallow' && key !== 'allow') continue;

    // `Disallow:` with an empty value means "nothing is disallowed" — not "everything is".
    if (key === 'disallow' && value === '') continue;
    if (!path.startsWith(value)) continue;
    if (!best || value.length > best.length) {
      best = { allow: key === 'allow', length: value.length };
    }
  }

  return best ? best.allow : true;
}

async function getText(url: string): Promise<{ ok: boolean; body: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      // A redirect off the allowlisted host would defeat gate 2, so redirects are not followed at
      // all and a 30x is simply not a page we read.
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain' },
    });

    if (!response.ok) return { ok: false, body: '', status: response.status };

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      return { ok: false, body: '', status: response.status };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return { ok: false, body: '', status: response.status };

    return { ok: true, body: new TextDecoder().decode(buffer), status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HTML to readable text.
 *
 * Regex rather than a parser on purpose: the only thing downstream wants is a flat string to run
 * date patterns over, and pulling a full DOM implementation into the server for that would be a
 * dependency and an attack surface bought for nothing. Script and style contents are dropped
 * first, or their bodies would contribute stray numbers.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const httpFetcher: Fetcher = {
  kind: 'http',

  async fetch(context: FetchContext): Promise<FetchOutcome> {
    if (!httpFetchingEnabled()) throw new ScraperDisabledError();

    const config = configSchema.safeParse(context.source.config);
    if (!config.success) return { candidates: [], warnings: ['config-missing-scheme-slug'] };

    const { source } = context;
    if (!isAllowedSourceUrl(source.source_url, extraAllowedHosts())) {
      return { candidates: [], warnings: ['host-not-allowed'] };
    }

    const url = new URL(source.source_url);

    // Gate 3. A robots.txt we cannot read is a refusal: proceeding would mean assuming permission
    // from a server that just failed to grant it.
    let robots: { ok: boolean; body: string; status: number };
    try {
      robots = await getText(`${url.origin}/robots.txt`);
    } catch {
      return { candidates: [], warnings: ['robots-unreachable'] };
    }
    // A 404 robots.txt is the documented "no restrictions" case; anything else read but not ok
    // means we could not establish permission.
    const robotsBody = robots.ok ? robots.body : robots.status === 404 ? '' : null;
    if (robotsBody === null) return { candidates: [], warnings: ['robots-unreadable'] };
    if (!robotsAllows(robotsBody, url.pathname)) {
      return { candidates: [], warnings: ['robots-disallowed'] };
    }

    let page: { ok: boolean; body: string; status: number };
    try {
      page = await getText(source.source_url);
    } catch (error) {
      logger.warn('scraper.http_fetch_failed', {
        source: source.slug,
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw providerUnavailable('admin.scrapers.fetchFailed');
    }
    if (!page.ok) return { candidates: [], warnings: [`fetch-not-ok:${page.status}`] };

    const live = context.lookupScheme(config.data.schemeSlug);
    if (!live) return { candidates: [], warnings: [`unknown-scheme:${config.data.schemeSlug}`] };

    const candidate = candidateFromWindow(live, readNotificationWindow(htmlToText(page.body)), {
      sourceUrl: source.source_url,
      // Lower than the manual path: nobody has looked at this page. It orders the inbox and
      // nothing else — there is no threshold at which this publishes itself.
      confidence: 0.45,
      note: 'dates read from fetched notification page',
    });

    if (!candidate) return { candidates: [], warnings: ['no-dates-found'] };
    return { candidates: [candidate], warnings: [] };
  },
};
