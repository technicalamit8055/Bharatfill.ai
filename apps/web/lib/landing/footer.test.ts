/**
 * Guards the landing footer: every key the CTA banner and the footer build resolves in both
 * catalogues, no copy sits unused, its links go where they should, and the disclaimer keeps
 * saying Bharatfill is independent of government.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import {
  FOOTER_LEGAL_LINKS,
  FOOTER_PILLARS,
  FOOTER_PRODUCT_LINKS,
  FOOTER_SOCIALS,
  FOOTER_TRUST,
} from './footer';

const PREFIX = 'landing.footer';

const REQUIRED_KEYS = [
  'cta.pill',
  'cta.titleHighlight',
  'cta.subtitle',
  'cta.primary',
  'cta.secondary',
  'cta.trust.label',
  'cta.mockup.label',
  'cta.mockup.filledTitle',
  'cta.mockup.filledCaption',
  'cta.mockup.accuracyValue',
  'cta.mockup.accuracyLabel',
  'tagline',
  'status',
  'socials.label',
  'product.title',
  'legal.title',
  'digital.title',
  'digital.body',
  'digital.pillars.label',
  'copyright',
  'disclaimer',
  ...FOOTER_TRUST.map((key) => `cta.trust.${key}`),
  ...FOOTER_SOCIALS.map(({ key }) => `socials.${key}`),
  ...FOOTER_PRODUCT_LINKS.map(({ key }) => `product.${key}`),
  ...FOOTER_LEGAL_LINKS.map(({ key }) => `legal.${key}`),
  ...FOOTER_PILLARS.map((key) => `digital.pillars.${key}`),
].map((key) => `${PREFIX}.${key}`);

/** The title halves either side of the highlight may be empty. */
const OPTIONAL_KEYS = ['cta.titleBefore', 'cta.titleAfter'].map((key) => `${PREFIX}.${key}`);

function lookup(dictionary: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );
}

function placeholders(value: unknown): string[] {
  return typeof value === 'string'
    ? [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '')
    : [];
}

describe('landing footer catalogue', () => {
  it('lists each trust point, link, profile and pillar once', () => {
    const lists = [
      FOOTER_TRUST,
      FOOTER_PILLARS,
      FOOTER_SOCIALS.map(({ key }) => key),
      FOOTER_PRODUCT_LINKS.map(({ key }) => key),
      FOOTER_LEGAL_LINKS.map(({ key }) => key),
    ];
    for (const keys of lists) expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of REQUIRED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
    for (const key of OPTIONAL_KEYS) expect(typeof lookup(dictionary, key), key).toBe('string');
  });

  it('leaves no copy in the catalogues that the footer does not render', () => {
    const rendered = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
    for (const dictionary of [en, hi]) {
      const leaves: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
        } else leaves.push(path);
      };
      walk(lookup(dictionary, PREFIX), PREFIX);
      expect(leaves.filter((key) => !rendered.has(key))).toEqual([]);
    }
  });

  it('only interpolates the year, into the copyright line', () => {
    for (const dictionary of [en, hi]) {
      for (const key of REQUIRED_KEYS) {
        const expected = key === `${PREFIX}.copyright` ? ['year'] : [];
        expect(placeholders(lookup(dictionary, key)), key).toEqual(expected);
      }
    }
  });

  it('points product links at landing sections or routes, legal links at routes, profiles off-site', () => {
    // `/#section` rather than `#section`, so the links still work from pages other than home.
    for (const { href } of FOOTER_PRODUCT_LINKS) expect(href).toMatch(/^\/(#[a-z-]+|[a-z-]+)$/);
    for (const { href } of FOOTER_LEGAL_LINKS) expect(href).toMatch(/^\/legal\/[a-z-]+$/);
    for (const { href } of FOOTER_SOCIALS) expect(new URL(href).protocol).toBe('https:');
  });

  it('keeps the disclaimer stating that Bharatfill is independent of government', () => {
    const disclaimer = lookup(en, `${PREFIX}.disclaimer`);
    expect(disclaimer).toMatch(/independent software tool/);
    expect(disclaimer).toMatch(
      /not affiliated with, endorsed by, or connected to any government department or official portal/,
    );
  });
});
