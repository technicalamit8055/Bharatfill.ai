import { ADAPTER_STATUSES, type AdapterStatus } from '@assistigo/form-engine';
import type { SchemeCategory } from '@assistigo/core';
import type { CatalogAdapter } from './adapters';

/**
 * Presentation helpers for the Form Library. Pure, so the page stays a layout and the rules
 * below can be tested without a Supabase client.
 */

export type FormLibraryQuery = {
  q: string;
  region: string;
  status: string;
  category: string;
  view: 'grid' | 'list';
};

export function isAdapterStatus(value: string): value is AdapterStatus {
  return (ADAPTER_STATUSES as readonly string[]).includes(value);
}

/**
 * The first URL pattern whose host is literal, split into scheme and host.
 *
 * Patterns are globs (`https://*.ssc.gov.in/**`), not URLs, so linking to one sends the operator
 * to a page that does not exist. A pattern with a wildcard in its host names no single site and
 * is skipped rather than guessed at.
 */
function literalOrigin(adapter: Pick<CatalogAdapter, 'urlPatterns'>): {
  scheme: string;
  host: string;
} | null {
  for (const pattern of adapter.urlPatterns) {
    const match = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(pattern);
    if (!match) continue;
    const [, scheme, host] = match;
    if (!scheme || !host || host.includes('*')) continue;
    return { scheme: scheme.toLowerCase(), host: host.toLowerCase() };
  }
  return null;
}

/** `serviceonline.bihar.gov.in` — shown under the portal name. */
export function portalHost(adapter: Pick<CatalogAdapter, 'urlPatterns'>): string | null {
  return literalOrigin(adapter)?.host ?? null;
}

/** The portal's home page: where "Launch portal" goes. */
export function portalLaunchUrl(adapter: Pick<CatalogAdapter, 'urlPatterns'>): string | null {
  const origin = literalOrigin(adapter);
  return origin ? `${origin.scheme}://${origin.host}/` : null;
}

/**
 * The portal name without a trailing `(domain)`: the card prints the host on its own line, so
 * "RTPS Bihar — ServicePlus (serviceonline.bihar.gov.in)" would say it twice. Only a
 * parenthetical that looks like a domain is dropped; "(CGL / CHSL)" is part of the name.
 */
export function portalDisplayName(portalName: string): string {
  return portalName.replace(/\s*\([a-z0-9-]+(?:\.[a-z0-9-]+)+\)\s*$/i, '').trim() || portalName;
}

/**
 * Emblems for the built-in adapters, keyed by slug. An adapter without one falls back to an icon
 * mark — never to someone else's emblem.
 */
const PORTAL_LOGOS: Record<string, string> = {
  'bihar-rtps-serviceonline': '/form-library/rtps-bihar-logo.png',
  'ssc-portal': '/form-library/ssc-logo.png',
};

export function portalLogoSrc(slug: string): string | null {
  return PORTAL_LOGOS[slug] ?? null;
}

export function adapterRegions(catalog: readonly CatalogAdapter[]): string[] {
  return Array.from(
    new Set(catalog.map((adapter) => adapter.region).filter((value): value is string => Boolean(value))),
  ).sort();
}

/** Only the categories something in the catalogue belongs to, so no option leads to an empty list. */
export function adapterCategories(catalog: readonly CatalogAdapter[]): SchemeCategory[] {
  return Array.from(
    new Set(
      catalog
        .map((adapter) => adapter.category)
        .filter((value): value is SchemeCategory => Boolean(value)),
    ),
  ).sort();
}

export function filterAdapters(
  catalog: readonly CatalogAdapter[],
  query: Pick<FormLibraryQuery, 'q' | 'region' | 'status' | 'category'>,
): CatalogAdapter[] {
  const q = query.q.trim().toLowerCase();
  return catalog.filter((adapter) => {
    if (query.region && adapter.region !== query.region) return false;
    if (query.status && adapter.status !== query.status) return false;
    if (query.category && adapter.category !== query.category) return false;
    if (q) {
      const haystack = [
        adapter.portalName,
        adapter.formName,
        adapter.region ?? '',
        portalHost(adapter) ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
