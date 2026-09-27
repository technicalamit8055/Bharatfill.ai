import { describe, expect, it } from 'vitest';
import { BUILT_IN_ADAPTERS } from '@assistigo/form-engine';
import type { CatalogAdapter } from './adapters';
import {
  adapterCategories,
  adapterRegions,
  filterAdapters,
  isAdapterStatus,
  portalDisplayName,
  portalHost,
  portalLaunchUrl,
  portalLogoSrc,
} from './present';

/** The shipped adapters as the catalogue would return them before any row is seeded. */
const CATALOG: CatalogAdapter[] = BUILT_IN_ADAPTERS.map((adapter) => ({
  ...adapter,
  persisted: false,
  maintainedByPlatform: true,
  lastVerifiedAt: null,
  health: { successRate: null, lastFailureAt: null },
}));

const ALL = { q: '', region: '', status: '', category: '' };

describe('portalLaunchUrl', () => {
  /** The old card linked straight to the glob, which is not a page anyone can open. */
  it('turns a glob into the portal home page', () => {
    expect(portalLaunchUrl({ urlPatterns: ['https://ssc.gov.in/**'] })).toBe('https://ssc.gov.in/');
    expect(portalLaunchUrl({ urlPatterns: ['https://Serviceonline.Bihar.gov.in/rtps/*'] })).toBe(
      'https://serviceonline.bihar.gov.in/',
    );
  });

  it('skips a pattern whose host is a wildcard rather than guessing a site', () => {
    expect(
      portalLaunchUrl({ urlPatterns: ['https://*.ssc.gov.in/**', 'https://ssc.gov.in/**'] }),
    ).toBe('https://ssc.gov.in/');
    expect(portalLaunchUrl({ urlPatterns: ['https://*.ssc.gov.in/**'] })).toBeNull();
  });

  it('refuses anything that is not an http(s) origin', () => {
    expect(portalLaunchUrl({ urlPatterns: ['javascript:alert(1)'] })).toBeNull();
    expect(portalLaunchUrl({ urlPatterns: ['//ssc.gov.in/**'] })).toBeNull();
    expect(portalLaunchUrl({ urlPatterns: ['**'] })).toBeNull();
  });

  it('keeps an http demo portal on http', () => {
    expect(portalLaunchUrl({ urlPatterns: ['http://localhost:3000/demo-forms/**'] })).toBe(
      'http://localhost:3000/',
    );
  });

  it('gives every built-in adapter somewhere to go', () => {
    for (const adapter of CATALOG) expect(portalLaunchUrl(adapter)).not.toBeNull();
  });
});

describe('portalHost', () => {
  it('prints the bare host', () => {
    expect(portalHost({ urlPatterns: ['https://serviceonline.bihar.gov.in/**'] })).toBe(
      'serviceonline.bihar.gov.in',
    );
  });
});

describe('portalDisplayName', () => {
  it('drops a trailing domain the card already prints on its own line', () => {
    expect(portalDisplayName('RTPS Bihar — ServicePlus (serviceonline.bihar.gov.in)')).toBe(
      'RTPS Bihar — ServicePlus',
    );
    expect(portalDisplayName('Staff Selection Commission (ssc.gov.in)')).toBe(
      'Staff Selection Commission',
    );
  });

  it('keeps a parenthetical that is part of the name', () => {
    expect(portalDisplayName('SSC (CGL / CHSL)')).toBe('SSC (CGL / CHSL)');
    expect(portalDisplayName('Scholarship portal')).toBe('Scholarship portal');
  });
});

describe('portalLogoSrc', () => {
  it('has an emblem for each built-in and none for anything else', () => {
    expect(portalLogoSrc('bihar-rtps-serviceonline')).toBe('/form-library/rtps-bihar-logo.png');
    expect(portalLogoSrc('ssc-portal')).toBe('/form-library/ssc-logo.png');
    expect(portalLogoSrc('some-centre-adapter')).toBeNull();
  });
});

describe('filterAdapters', () => {
  it('returns everything with no filters', () => {
    expect(filterAdapters(CATALOG, ALL)).toHaveLength(CATALOG.length);
  });

  it('filters by region, status and category', () => {
    expect(filterAdapters(CATALOG, { ...ALL, region: 'Bihar' }).map((a) => a.slug)).toEqual([
      'bihar-rtps-serviceonline',
    ]);
    expect(filterAdapters(CATALOG, { ...ALL, category: 'recruitment' }).map((a) => a.slug)).toEqual(
      ['ssc-portal'],
    );
    expect(filterAdapters(CATALOG, { ...ALL, status: 'active' })).toHaveLength(0);
  });

  it('searches the name, form, region and host, ignoring case', () => {
    expect(filterAdapters(CATALOG, { ...ALL, q: '  STAFF ' }).map((a) => a.slug)).toEqual([
      'ssc-portal',
    ]);
    expect(filterAdapters(CATALOG, { ...ALL, q: 'caste' }).map((a) => a.slug)).toEqual([
      'bihar-rtps-serviceonline',
    ]);
    expect(filterAdapters(CATALOG, { ...ALL, q: 'ssc.gov.in' }).map((a) => a.slug)).toEqual([
      'ssc-portal',
    ]);
  });
});

describe('filter options', () => {
  it('lists only regions and categories something belongs to', () => {
    expect(adapterRegions(CATALOG)).toEqual(['All India', 'Bihar']);
    expect(adapterCategories(CATALOG)).toEqual(['certificate', 'recruitment']);
    expect(
      adapterCategories([...CATALOG, { ...CATALOG[0]!, slug: 'own', category: undefined }]),
    ).toEqual(['certificate', 'recruitment']);
  });

  it('recognises only real adapter statuses', () => {
    expect(isAdapterStatus('testing')).toBe(true);
    expect(isAdapterStatus('verified')).toBe(false);
  });
});
