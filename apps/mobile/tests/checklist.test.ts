/**
 * The document checklist (`lib/checklist`): what counts as ready, the forms offered, how a
 * document is added, the route params, and the copy. All documents are fake.
 */

import { BUILT_IN_SCHEMES, SCHEME_DOCUMENT_KEYS } from '@assistigo/core';
import { describe, expect, it } from 'vitest';

import {
  addMethods,
  CHECKLIST_GROUPS,
  CHECKLIST_TYPES,
  checklistProgress,
  coreChecklist,
  formBySlug,
  formChecklist,
  formGroups,
  presetFor,
} from '../lib/checklist/checklist';
import { originParam, parseScanGoal } from '../lib/checklist/scan-goal';
import { categoryOf } from '../lib/vault/categories';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

const NOW = new Date(2026, 10, 25, 12);
const doc = (
  id: string,
  documentType?: (typeof CHECKLIST_TYPES)['core'][number],
  expiresOn?: string,
  createdAt = '2026-01-01T00:00:00.000Z',
) => ({ id, documentType, expiresOn, createdAt });
const stateOf = (documents: ReturnType<typeof doc>[], key: string) =>
  coreChecklist(documents, NOW).find((item) => item.key === key);

describe('coreChecklist', () => {
  it('calls everything missing in an empty vault', () => {
    const items = coreChecklist([], NOW);
    expect(items.every((item) => item.state === 'missing')).toBe(true);
    expect(checklistProgress(items)).toEqual({ ready: 0, total: 5 });
  });

  it('ticks what is filed under its type, photo and signature included', () => {
    const items = coreChecklist([doc('a', 'photo'), doc('b', 'signature'), doc('c', 'pan')], NOW);
    expect(checklistProgress(items).ready).toBe(3);
  });

  it('ignores documents with no type, or as Other', () => {
    expect(checklistProgress(coreChecklist([doc('a'), doc('b', 'generic')], NOW)).ready).toBe(0);
  });

  it('is valid through its expiry date, and expired after it', () => {
    expect(stateOf([doc('a', 'pan', '2026-11-25')], 'pan')?.state).toBe('ready');
    expect(stateOf([doc('a', 'pan', '2026-11-24')], 'pan')).toMatchObject({
      state: 'expired',
      documentId: 'a',
    });
  });

  it('prefers a valid copy over a newer expired one', () => {
    const documents = [
      doc('old', 'pan'),
      doc('new', 'pan', '2026-02-01', '2026-01-31T00:00:00.000Z'),
    ];
    expect(stateOf(documents, 'pan')).toMatchObject({ state: 'ready', documentId: 'old' });
  });
});

describe('forms', () => {
  it('lists every catalogue form that asks for documents, once', () => {
    const listed = formGroups().flatMap((group) => group.schemes.map((scheme) => scheme.slug));
    expect(listed.sort()).toEqual(
      BUILT_IN_SCHEMES.filter((scheme) => scheme.eligibility.requiredDocuments?.length)
        .map((scheme) => scheme.slug)
        .sort(),
    );
  });

  it('checks a form against the vault, and never ticks what it cannot recognise', () => {
    const scheme = formBySlug('pm-kisan');
    if (!scheme) throw new Error('pm-kisan is in the catalogue');
    const items = formChecklist(scheme, [doc('a', 'aadhaar_like'), doc('b', 'generic')], NOW);
    expect(items.map((item) => [item.key, item.state])).toEqual([
      ['aadhaar', 'ready'],
      ['bank_account', 'check_manually'],
    ]);
    expect(items[1]?.label?.hi).toBeTruthy();
  });

  it('has no form for an unknown or malformed slug', () => {
    for (const slug of ['nope', undefined, ['pm-kisan']]) expect(formBySlug(slug)).toBeNull();
  });

  it('builds a list for every form using known document keys', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      for (const item of formChecklist(scheme, [], NOW)) {
        expect(SCHEME_DOCUMENT_KEYS).toContain(item.key);
      }
    }
  });
});

describe('adding a document', () => {
  it('lists only types the vault can file', () => {
    for (const group of CHECKLIST_GROUPS) {
      for (const type of CHECKLIST_TYPES[group]) expect(categoryOf(type), type).not.toBeNull();
    }
  });

  it('opens the right scanner for each kind', () => {
    expect(addMethods('pan')).toEqual(['scan_card', 'scan', 'upload']);
    expect(presetFor('pan', 'scan_card')).toBe('id_card');
    expect(addMethods('photo')).toEqual(['photo', 'upload']);
    expect(presetFor('photo', 'photo')).toBe('photo');
    expect(presetFor('signature', 'scan')).toBe('signature');
    expect(presetFor('marksheet_10', 'scan')).toBe('document');
  });

  it('never shrinks an A4 letter or PDF to the size of a card', () => {
    expect(presetFor('aadhaar_like', 'scan')).toBe('document');
    expect(presetFor('aadhaar_like', 'upload')).toBe('document');
  });
});

describe('parseScanGoal', () => {
  it('round-trips each origin', () => {
    expect(parseScanGoal('pan', originParam({ screen: 'home' }))).toEqual({
      documentType: 'pan',
      returnTo: null,
    });
    expect(parseScanGoal('pan', originParam({ screen: 'checklist' }))?.returnTo).toBe('/checklist');
    expect(
      parseScanGoal('photo', originParam({ screen: 'form', slug: 'ssc-cgl' }))?.returnTo,
    ).toEqual({ pathname: '/form-checklist', params: { slug: 'ssc-cgl' } });
  });

  it('drops anything it does not recognise', () => {
    expect(parseScanGoal(undefined, undefined)).toBeNull();
    expect(parseScanGoal('passport', 'https://example.test')).toBeNull();
    expect(parseScanGoal('pan', 'form:nope')?.returnTo).toBeNull();
  });
});

const KEYS = (value: unknown, path = ''): string[] =>
  typeof value === 'string'
    ? [path]
    : Object.entries(value as object).flatMap(([key, child]) => KEYS(child, `${path}.${key}`));

describe('copy', () => {
  it('has the same keys in both languages', () => {
    expect(KEYS(hi.checklist)).toEqual(KEYS(en.checklist));
  });

  it('names every group and add method, and keeps its placeholders', () => {
    expect(Object.keys(en.checklist.groups)).toEqual([...CHECKLIST_GROUPS]);
    const methods = new Set([...addMethods('pan'), ...addMethods('photo')]);
    expect(Object.keys(en.checklist.add.methods).sort()).toEqual([...methods].sort());
    for (const messages of [en, hi]) {
      expect(messages.checklist.progress).toContain('{ready}');
      expect(messages.checklist.progress).toContain('{total}');
      expect(messages.checklist.add.title).toContain('{name}');
      expect(messages.common.cancel).toBeTruthy();
    }
  });
});
