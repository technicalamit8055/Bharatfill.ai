/**
 * Guards the landing pricing section: one plan is featured, each plan lists distinct features,
 * prices render in rupees, and every key the section builds from a plan, badge or assurance
 * resolves in both catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { PRICING_ASSURANCES, PRICING_BADGES, PRICING_PLANS, formatPlanPrice } from './pricing';

const PREFIX = 'landing.pricing';

const REQUIRED_KEYS = [
  'pill',
  'titleHighlight',
  'subtitle',
  'doodle',
  'stickyNote.line1',
  'stickyNote.line2',
  'stickyNote.line3',
  'fillCard.title',
  'fillCard.caption',
  'badges.label',
  'mostPopular',
  ...new Set(PRICING_PLANS.map(({ period }) => `period.${period}`)),
  ...PRICING_BADGES.map((badge) => `badges.${badge}`),
  ...PRICING_PLANS.flatMap(({ key, features }) => [
    ...['name', 'audience', 'description', 'cta'].map((field) => `plans.${key}.${field}`),
    ...features.map((feature) => `plans.${key}.features.${feature}`),
  ]),
  ...PRICING_ASSURANCES.flatMap((key) => [`assurances.${key}.title`, `assurances.${key}.body`]),
].map((key) => `${PREFIX}.${key}`);

/** The title halves either side of the highlight, a plan's tag and its CTA note may be empty. */
const OPTIONAL_KEYS = [
  'titleBefore',
  'titleAfter',
  ...PRICING_PLANS.flatMap(({ key }) => [`plans.${key}.tag`, `plans.${key}.note`]),
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

describe('landing pricing catalogue', () => {
  it('features exactly one plan', () => {
    expect(PRICING_PLANS.filter(({ featured }) => featured)).toHaveLength(1);
  });

  it('gives every plan distinct keys and distinct features', () => {
    const keys = PRICING_PLANS.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { key, features } of PRICING_PLANS) {
      expect(new Set(features).size, key).toBe(features.length);
      expect(features.length, key).toBeGreaterThan(0);
    }
  });

  it('lists plans cheapest first, with only the free plan priced at zero', () => {
    const prices = PRICING_PLANS.map(({ priceInr }) => priceInr);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const { key, priceInr, period } of PRICING_PLANS) {
      expect(period === 'forever', key).toBe(priceInr === 0);
    }
  });

  it.each(['en', 'hi'])('formats prices in whole rupees, grouped the Indian way (%s)', (locale) => {
    expect(formatPlanPrice(0, locale)).toBe('₹0');
    expect(formatPlanPrice(1299, locale)).toBe('₹1,299');
    expect(formatPlanPrice(100000, locale)).toBe('₹1,00,000');
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

  it('leaves no copy in the catalogues that the section does not render', () => {
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
});
