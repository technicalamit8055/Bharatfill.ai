/**
 * Guards the cloud sign-in copy: every key the Vault PIN screens, the cloud errors and the
 * server's error catalogue render must resolve in both catalogues — and every `errors.vault.*`
 * key the server can send (packages/core, apps/web) must exist here too, so a citizen never
 * sees a fallback where a real message was meant.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';

const RENDERED_KEYS = [
  ...['create', 'restore'].flatMap((mode) =>
    ['headlineLead', 'headlineAccent', 'subtitle', 'pinLabel', 'pinHint', 'submit'].map(
      (key) => `vaultPin.${mode}.${key}`,
    ),
  ),
  'vaultPin.create.confirmLabel',
  'vaultPin.create.syncTitle',
  'vaultPin.create.syncBody',
  'vaultPin.create.consent',
  'vaultPin.restore.otherWays',
  'vaultPin.errors.incomplete',
  'vaultPin.errors.weak',
  'vaultPin.errors.mismatch',
  'vaultPin.errors.consent',
  ...[
    'title',
    'rate_limited',
    'invalid_code',
    'rejected',
    'signed_out',
    'unavailable',
    'network',
  ].map((key) => `cloud.errors.${key}`),
  'registration.back',
  'registration.ok',
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

/** Every `errors.vault.*` key written in the server and core sources. */
function serverVaultKeys(): string[] {
  const root = join(__dirname, '..', '..', '..');
  const files = [
    'packages/core/src/citizen-vault/types.ts',
    'apps/web/lib/citizen/account.ts',
    'apps/web/lib/citizen/secrets.ts',
  ];
  const keys = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const match of source.matchAll(/'(errors\.vault\.[a-z_]+)'/g)) keys.add(match[1]!);
  }
  return [...keys];
}

describe('cloud sign-in copy', () => {
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
  ])('carries every server vault error in %s', (_locale, dictionary) => {
    const keys = serverVaultKeys();
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(typeof lookup(dictionary, key), key).toBe('string');
  });
});
