/**
 * Guards the Home dashboard copy: every key the screen renders, including the ones built from
 * a scan mode, a vault category, a document age or a count, must resolve in both catalogues —
 * and keep the placeholders the screen fills in.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { documentAgeMessage, documentCountMessage, QUICK_SCAN_MODES } from '../lib/home/dashboard';
import { VAULT_CATEGORIES } from '../lib/vault/categories';

const NOW = new Date('2026-09-23T12:00:00Z');
const AGES_MS = [0, 60_000, 5 * 60_000, 3_600_000, 2 * 3_600_000, 86_400_000, 5 * 86_400_000];

const RENDERED_KEYS = [
  'tabs.home',
  'home.title',
  'home.greeting',
  'home.greetingNoName',
  'home.tagline',
  'home.notifications',
  'home.notificationsUnread',
  'home.notificationsUnavailable',
  'home.openProfile',
  'home.hero.title',
  'home.hero.body',
  'home.hero.action',
  ...QUICK_SCAN_MODES.flatMap((mode) => [
    `home.quickActions.${mode}.label`,
    `home.quickActions.${mode}.caption`,
  ]),
  'home.connect.title',
  'home.connect.body',
  'home.connect.action',
  'home.connect.unavailable',
  'home.vault.title',
  'home.vault.viewAll',
  'home.vault.viewAllHint',
  ...VAULT_CATEGORIES.map((category) => `home.vault.categories.${category}`),
  ...[0, 1, 2, 12].map((count) => documentCountMessage(count).key),
  'home.recent.title',
  'home.recent.seeAll',
  'home.recent.seeAllHint',
  'home.recent.emptyTitle',
  'home.recent.emptyBody',
  'home.recent.moreActions',
  'home.recent.actionsUnavailable',
  ...AGES_MS.map((ms) => documentAgeMessage(new Date(NOW.getTime() - ms), NOW).key),
  'home.demo.aadhaar',
  'home.demo.marksheet',
  'home.demo.photo',
  'home.demo.signature',
  'common.comingSoon',
  'common.ok',
];

/** Keys whose copy must keep a placeholder the screen interpolates. */
const PLACEHOLDERS: Record<string, string> = {
  'home.greeting': '{name}',
  'home.recent.moreActions': '{title}',
  'home.vault.count.other': '{count}',
  'home.recent.age.minutesOther': '{count}',
  'home.recent.age.hoursOther': '{count}',
  'home.recent.age.daysOther': '{count}',
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('home dashboard copy', () => {
  it('builds every age and count form the catalogues define', () => {
    const built = new Set(RENDERED_KEYS);
    for (const form of Object.keys(en.home.recent.age)) {
      expect(built.has(`home.recent.age.${form}`), form).toBe(true);
    }
    for (const form of Object.keys(en.home.vault.count)) {
      expect(built.has(`home.vault.count.${form}`), form).toBe(true);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the interpolation placeholders in %s', (_locale, dictionary) => {
    for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
      expect(lookup(dictionary, key), key).toContain(placeholder);
    }
  });
});
