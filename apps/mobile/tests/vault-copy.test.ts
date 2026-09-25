/**
 * Guards the Vault tab copy: every key the screen renders, including the ones built from a
 * filter, a sort, a document source or an empty state, must resolve in both catalogues — and
 * keep the placeholders the screen fills in.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { DOCUMENT_SOURCES } from '../lib/vault/vault-index';
import { MONTH_KEYS } from '../lib/profile/date-of-birth';
import { VAULT_CATEGORIES } from '../lib/vault/categories';
import { VAULT_FILTERS, VAULT_SORTS } from '../lib/vault/vault-screen';

const RENDERED_KEYS = [
  'vault.title',
  'vault.heading',
  'vault.subtitle',
  'vault.search',
  'vault.searchPlaceholder',
  'vault.closeSearch',
  'vault.more',
  ...VAULT_FILTERS.map((filter) => `vault.filters.${filter}`),
  'vault.folderHint',
  'vault.allDocuments',
  'vault.clearCategory',
  'vault.sort.label',
  'vault.sort.title',
  'vault.sort.close',
  ...VAULT_SORTS.map((sort) => `vault.sort.options.${sort}`),
  'vault.layout.list',
  'vault.layout.grid',
  'vault.star',
  'vault.unstar',
  'vault.moreActions',
  ...Object.keys(en.vault.actions).map((action) => `vault.actions.${action}`),
  ...DOCUMENT_SOURCES.flatMap((source) => [`vault.untitled.${source}`, `vault.source.${source}`]),
  'vault.meta.format',
  'vault.meta.pages',
  'vault.meta.date',
  ...MONTH_KEYS.map((month) => `profileSetup.months.${month}`),
  ...Object.keys(en.vault.empty).map((reason) => `vault.empty.${reason}`),
  'vault.emptyAction',
  'vault.loadError',
  'vault.starFailed',
  'vault.deleteFailed',
  ...Object.keys(en.vault.demo).map((key) => `vault.demo.${key}`),
  ...VAULT_CATEGORIES.map((category) => `home.vault.categories.${category}`),
  'common.loading',
  'common.retry',
  'common.errorTitle',
  'common.ok',
];

/** Keys whose copy must keep a placeholder the screen interpolates. */
const PLACEHOLDERS: Record<string, readonly string[]> = {
  'vault.sort.label': ['{sort}'],
  'vault.star': ['{title}'],
  'vault.unstar': ['{title}'],
  'vault.moreActions': ['{title}'],
  'vault.actions.deleteBody': ['{title}'],
  'vault.meta.format': ['{format}'],
  'vault.meta.pages': ['{count}'],
  'vault.meta.date': ['{day}', '{month}', '{year}'],
  'vault.empty.recent': ['{days}'],
  'vault.empty.search': ['{search}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('vault copy', () => {
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
    for (const [key, placeholders] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of placeholders) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });

  it('defines the same vault keys in Hindi as in English', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(hi.vault).sort()).toEqual(keys(en.vault).sort());
  });
});
