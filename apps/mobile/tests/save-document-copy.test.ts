/**
 * Guards the Save Document copy: every key the screen and its route render, including the ones
 * built from a scan status, a document type or an expiry error, must resolve in both
 * catalogues and keep the placeholders filled in. Also checks the reminder notification says
 * nothing about which document it is, since it can show on the lock screen.
 */

import { DOCUMENT_TYPES } from '@assistigo/core';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { VAULT_CATEGORIES } from '../lib/vault/categories';
import { DATE_MEANINGS, EVERYDAY_KINDS } from '../lib/vault/everyday';
import type { ExpiryStatus, ScanStatus } from '../lib/vault/save-document';

const SCAN_STATUSES: readonly ScanStatus[] = ['processing', 'clear', 'uncropped', 'failed'];
const EXPIRY_ERRORS: readonly Exclude<ExpiryStatus, 'valid'>[] = [
  'invalid',
  'not_future',
  'too_far',
];

const RENDERED_KEYS = [
  'saveDocument.title',
  'saveDocument.subtitle',
  'saveDocument.back',
  'saveDocument.pageOf',
  'saveDocument.previewLabel',
  'saveDocument.editScan',
  'saveDocument.optional',
  'saveDocument.sheetClose',
  ...SCAN_STATUSES.flatMap((status) => [
    `saveDocument.status.${status}.title`,
    `saveDocument.status.${status}.body`,
  ]),
  ...Object.keys(en.saveDocument.name).map((key) => `saveDocument.name.${key}`),
  ...Object.keys(en.saveDocument.type).map((key) => `saveDocument.type.${key}`),
  ...Object.keys(en.saveDocument.folder).map((key) => `saveDocument.folder.${key}`),
  ...Object.keys(en.saveDocument.tags).map((key) => `saveDocument.tags.${key}`),
  'saveDocument.secure.title',
  ...Object.keys(en.saveDocument.sharing).map((key) => `saveDocument.sharing.${key}`),
  'saveDocument.secure.body',
  ...Object.keys(en.saveDocument.reminder).map((key) => `saveDocument.reminder.${key}`),
  'saveDocument.save',
  'saveDocument.saving',
  'saveDocument.errors.titleRequired',
  'saveDocument.errors.typeRequired',
  ...EXPIRY_ERRORS.map((error) => `saveDocument.errors.expiry.${error}`),
  ...DATE_MEANINGS.flatMap((meaning) => [
    `saveDocument.notification.title.${meaning}`,
    `saveDocument.notification.${meaning}`,
  ]),
  'saveDocument.notification.channel',
  'reminders.when.today',
  'reminders.when.tomorrow',
  'reminders.when.days',
  ...DOCUMENT_TYPES.map((type) => `documentTypes.${type}`),
  ...EVERYDAY_KINDS.map((kind) => `everydayKinds.${kind}`),
  ...VAULT_CATEGORIES.map((category) => `vault.categories.${category}`),
  'scanReview.save',
  'scanReview.saveFailed',
  'scanner.errors.title',
];

const PLACEHOLDERS: Record<string, readonly string[]> = {
  'saveDocument.pageOf': ['{number}', '{total}'],
  'saveDocument.previewLabel': ['{number}', '{total}'],
  'saveDocument.tags.remove': ['{tag}'],
  'saveDocument.tags.full': ['{max}'],
  'saveDocument.reminder.expiresOn': ['{date}'],
  'saveDocument.reminder.when': ['{date}'],
  'saveDocument.errors.expiry.too_far': ['{years}'],
  'saveDocument.notification.expires': ['{when}', '{date}'],
  'saveDocument.notification.due': ['{when}', '{date}'],
  'saveDocument.reminder.dueOn': ['{date}'],
  'reminders.when.days': ['{days}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

function placeholders(value: string): string[] {
  return value.match(/\{\w+\}/g) ?? [];
}

describe('save document copy', () => {
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
    for (const [key, expected] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of expected) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });

  it('defines the same keys in Hindi as in English', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(hi.saveDocument).sort()).toEqual(keys(en.saveDocument).sort());
    expect(keys(hi.documentTypes).sort()).toEqual(keys(en.documentTypes).sort());
    expect(keys(hi.everydayKinds).sort()).toEqual(keys(en.everydayKinds).sort());
    expect(keys(hi.reminders).sort()).toEqual(keys(en.reminders).sort());
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the lock-screen reminder free of document details in %s', (_locale, dictionary) => {
    for (const meaning of DATE_MEANINGS) {
      const title = lookup(dictionary, `saveDocument.notification.title.${meaning}`) as string;
      const body = lookup(dictionary, `saveDocument.notification.${meaning}`) as string;
      expect(placeholders(title), meaning).toEqual([]);
      // How far off and the date only: no name, type, kind or tag.
      expect(placeholders(body).sort(), meaning).toEqual(['{date}', '{when}']);
    }
    // The countdown words carry nothing but a number of days.
    for (const key of ['reminders.when.today', 'reminders.when.tomorrow', 'reminders.when.days']) {
      const value = lookup(dictionary, key) as string;
      expect(placeholders(value), key).toEqual(key.endsWith('days') ? ['{days}'] : []);
    }
  });
});

describe('sharing copy', () => {
  it('never says a phone-only document leaves the phone', () => {
    expect(en.saveDocument.sharing.phoneBody.toLowerCase()).toContain('never uploaded');
    expect(en.saveDocument.sharing.phoneTitle.toLowerCase()).toContain('only on this phone');
  });
});
