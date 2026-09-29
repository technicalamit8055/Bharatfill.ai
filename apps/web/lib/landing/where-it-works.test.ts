/**
 * Guards the landing "Where it works" section: the filter chips partition the catalogue, and
 * every key the section builds from a category or portal resolves in both catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { PORTAL_CATEGORIES, PORTAL_LOGOS, PORTALS, portalsIn } from './where-it-works';

const PREFIX = 'landing.whereItWorks';

const REQUIRED_KEYS = [
  'pill',
  'titleHighlight',
  'subtitle',
  'filterLabel',
  'callout.title',
  'callout.body',
  'callout.action',
  ...PORTAL_CATEGORIES.map((category) => `categories.${category}`),
  ...PORTALS.flatMap(({ key }) =>
    ['title', 'subtitle', 'badge'].map((field) => `portals.${key}.${field}`),
  ),
].map((key) => `${PREFIX}.${key}`);

/** The title halves either side of the highlight, and single-line badges, may be empty. */
const OPTIONAL_KEYS = [
  'titleBefore',
  'titleAfter',
  ...PORTALS.map(({ key }) => `portals.${key}.badgeCaption`),
].map((key) => `${PREFIX}.${key}`);

function lookup(dictionary: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );
}

describe('where it works catalogue', () => {
  it('lists every portal under "all", in catalogue order', () => {
    expect(portalsIn('all')).toEqual(PORTALS);
  });

  it('puts each portal under exactly one chip, and leaves no chip empty', () => {
    const chips = PORTAL_CATEGORIES.filter((category) => category !== 'all');
    for (const category of chips) expect(portalsIn(category).length).toBeGreaterThan(0);

    const listed = chips.flatMap((category) => portalsIn(category).map(({ key }) => key));
    expect([...listed].sort()).toEqual(PORTALS.map(({ key }) => key).sort());
  });

  it('declares logos for every portal, with unique file names', () => {
    expect(Object.keys(PORTAL_LOGOS).sort()).toEqual(PORTALS.map(({ key }) => key).sort());
    const names = Object.values(PORTAL_LOGOS).flatMap((logos) => logos.map(({ name }) => name));
    expect(new Set(names).size).toBe(names.length);
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
});
