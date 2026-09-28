/**
 * Guards the landing FAQ: every key the section builds from a question, assurance or stat
 * resolves in both catalogues, no copy sits unused, and the safety answer keeps promising what
 * the product rules require — no auto-submit, no CAPTCHA bypass, no OTP handling.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { FAQ_ASSURANCES, FAQ_ITEMS, FAQ_STATS } from './faq';

const PREFIX = 'landing.faq';

const REQUIRED_KEYS = [
  'pill',
  'titleHighlight',
  'subtitle',
  'bubble.line1',
  'bubble.line2',
  'assurances.label',
  'stats.label',
  ...FAQ_ITEMS.flatMap((item) => [`items.${item}.question`, `items.${item}.answer`]),
  ...FAQ_ASSURANCES.flatMap((key) => [`assurances.${key}.title`, `assurances.${key}.body`]),
  ...FAQ_STATS.flatMap((key) => [`stats.${key}.title`, `stats.${key}.body`]),
].map((key) => `${PREFIX}.${key}`);

/** The title halves either side of the highlight may be empty. */
const OPTIONAL_KEYS = ['titleBefore', 'titleAfter'].map((key) => `${PREFIX}.${key}`);

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

describe('landing faq catalogue', () => {
  it('lists each question, assurance and stat once', () => {
    for (const keys of [FAQ_ITEMS, FAQ_ASSURANCES, FAQ_STATS]) {
      expect(new Set(keys).size).toBe(keys.length);
    }
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

  it('only interpolates the button label, and names it in both locales', () => {
    for (const dictionary of [en, hi]) {
      for (const key of REQUIRED_KEYS) {
        const expected = key === `${PREFIX}.items.install.answer` ? ['button'] : [];
        expect(placeholders(lookup(dictionary, key)), key).toEqual(expected);
      }
    }
  });

  it('keeps the safety answer stating that nothing is submitted, bypassed or automated', () => {
    const answer = lookup(en, `${PREFIX}.items.safety.answer`);
    expect(answer).toMatch(/NEVER submits forms automatically/);
    expect(answer).toMatch(/NEVER bypasses CAPTCHAs/);
    expect(answer).toMatch(/NEVER handles OTPs/);
  });
});
