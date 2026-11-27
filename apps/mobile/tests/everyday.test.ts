/**
 * Everyday papers and smart reminders: the kinds stay on this phone, each kind's reminder fires
 * at its own lead, the suggested date, Home's "Coming up" list and its wording, the picker rows,
 * the Vault tab's Everyday filter, and the copy in both languages. Sample documents only — no
 * real citizen data.
 */

import { DOCUMENT_TYPES } from '@assistigo/core';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { planSync } from '../lib/cloud/sync-plan';
import {
  daysUntil,
  EVERYDAY_KINDS,
  reminderRuleFor,
  suggestedDate,
  upcomingMessage,
  upcomingReminders,
  type UpcomingSource,
} from '../lib/vault/everyday';
import {
  reminderPlanFor,
  resolveTypeChoice,
  SAVE_TYPE_CHOICES,
  type SaveDocumentForm,
  typeChoiceLabelKey,
  typeChoiceOf,
  validateSaveDocument,
} from '../lib/vault/save-document';
import {
  EMPTY_VAULT_INDEX,
  parseVaultIndex,
  phoneOnlyForNewDocument,
  serialiseVaultIndex,
  type VaultDocument,
  withDetails,
  withDocument,
} from '../lib/vault/vault-index';
import { emptyListMessage, type VaultItem, visibleItems } from '../lib/vault/vault-screen';

/** 24 Sep 2026, 14:00 on the test machine's own clock. */
const NOW = new Date(2026, 8, 24, 14, 0, 0);

const PUC_ID = '11111111-1111-4111-8111-111111111111';

const FORM: SaveDocumentForm = {
  title: 'Bike PUC',
  documentType: 'generic',
  everydayKind: 'vehicle_puc',
  category: null,
  tags: [],
  expiresOn: '2026-10-01',
  phoneOnly: null,
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('everyday papers stay on this phone', () => {
  it('stores a kind as an "Other" document', () => {
    expect(resolveTypeChoice('electricity_bill')).toEqual({
      documentType: 'generic',
      everydayKind: 'electricity_bill',
    });
    expect(resolveTypeChoice('pan')).toEqual({ documentType: 'pan', everydayKind: null });
    expect(typeChoiceOf('generic', 'land_record')).toBe('land_record');
    expect(typeChoiceOf('pan', null)).toBe('pan');
  });

  it('keeps every kind on the phone by default when saved', () => {
    for (const kind of EVERYDAY_KINDS) {
      const result = validateSaveDocument({ ...FORM, everydayKind: kind }, NOW);
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.details.everydayKind).toBe(kind);
      expect(result.details.phoneOnly, kind).toBe(true);
      expect(phoneOnlyForNewDocument(result.details), kind).toBe(true);
    }
  });

  it('lets the citizen share one on purpose, as with any "Other" document', () => {
    const result = validateSaveDocument(
      { ...FORM, everydayKind: 'land_record', phoneOnly: false },
      NOW,
    );
    expect(result.ok && result.details.phoneOnly).toBe(false);
  });

  it('drops a kind that does not go with the type', () => {
    const result = validateSaveDocument({ ...FORM, documentType: 'pan' }, NOW);
    expect(result.ok && result.details.everydayKind).toBeUndefined();
  });

  it('never sends the kind to the cloud, even for a document shared on purpose', () => {
    const document: VaultDocument = {
      id: PUC_ID,
      createdAt: '2026-09-20T10:00:00.000Z',
      source: 'scanner',
      pages: [{ mimeType: 'image/jpeg' }],
      title: 'Land record',
      documentType: 'generic',
      everydayKind: 'land_record',
      phoneOnly: false,
    };
    const index = withDocument(EMPTY_VAULT_INDEX, document);
    const options = { cloudEnabled: true, untitled: () => 'Scan' };
    const actions = planSync(index, options);
    expect(actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(actions)).not.toContain('land_record');
    // And one left on the phone is not planned at all.
    expect(
      planSync(withDocument(EMPTY_VAULT_INDEX, { ...document, phoneOnly: true }), options),
    ).toEqual([]);
  });

  it('round-trips the kind through the sealed index and refuses an unknown one', () => {
    const document: VaultDocument = {
      id: PUC_ID,
      createdAt: '2026-09-20T10:00:00.000Z',
      source: 'scanner',
      pages: [{ mimeType: 'image/jpeg' }],
      documentType: 'generic',
      everydayKind: 'vehicle_puc',
    };
    const index = withDocument(EMPTY_VAULT_INDEX, document);
    expect(parseVaultIndex(serialiseVaultIndex(index))).toEqual(index);
    const tampered = JSON.parse(serialiseVaultIndex(index)) as { documents: object[] };
    tampered.documents[0] = { ...tampered.documents[0], everydayKind: 'passport' };
    expect(parseVaultIndex(JSON.stringify(tampered))).toBeNull();
  });

  it('keeps the kind through a rename', () => {
    const index = withDocument(EMPTY_VAULT_INDEX, {
      id: PUC_ID,
      createdAt: '2026-09-20T10:00:00.000Z',
      source: 'scanner',
      pages: [{ mimeType: 'image/jpeg' }],
      documentType: 'generic',
      everydayKind: 'vehicle_puc',
      phoneOnly: true,
    });
    const renamed = withDetails(index, PUC_ID, { title: 'Scooty PUC' });
    expect(renamed.documents[0]?.everydayKind).toBe('vehicle_puc');
    expect(renamed.documents[0]?.phoneOnly).toBe(true);
  });
});

describe('type picker', () => {
  it('lists form documents, then everyday papers, then Other last', () => {
    expect(SAVE_TYPE_CHOICES[0]).toBe('aadhaar_like');
    expect(SAVE_TYPE_CHOICES.at(-1)).toBe('generic');
    expect(SAVE_TYPE_CHOICES.filter((choice) => choice === 'generic')).toHaveLength(1);
    for (const kind of EVERYDAY_KINDS) expect(SAVE_TYPE_CHOICES).toContain(kind);
    expect(SAVE_TYPE_CHOICES.indexOf('signature')).toBeLessThan(
      SAVE_TYPE_CHOICES.indexOf('electricity_bill'),
    );
  });

  it('never gives a kind the name of a core type', () => {
    for (const kind of EVERYDAY_KINDS) {
      expect((DOCUMENT_TYPES as readonly string[]).includes(kind), kind).toBe(false);
    }
  });

  it('labels each row from its own catalogue', () => {
    expect(typeChoiceLabelKey('vehicle_puc')).toBe('everydayKinds.vehicle_puc');
    expect(typeChoiceLabelKey('pan')).toBe('documentTypes.pan');
  });
});

describe('reminder rules', () => {
  it('reminds a week before a PUC expires', () => {
    // Expires 8 Oct: 7 days before is 1 Oct at 9:00.
    expect(reminderPlanFor({ everydayKind: 'vehicle_puc', expiresOn: '2026-10-08' }, NOW)).toEqual({
      at: new Date(2026, 9, 1, 9, 0, 0),
      expiresOn: '2026-10-08',
      dateMeaning: 'expires',
    });
  });

  it('reminds a month before an income certificate expires, and offers renewal', () => {
    const plan = reminderPlanFor(
      { documentType: 'income_certificate', expiresOn: '2026-12-31' },
      NOW,
    );
    expect(plan?.at).toEqual(new Date(2026, 11, 1, 9, 0, 0));
    expect(reminderRuleFor({ documentType: 'income_certificate' }).action).toBe('renew');
  });

  it('treats a bill date as due, three days ahead, with Pay', () => {
    const rule = reminderRuleFor({ everydayKind: 'electricity_bill' });
    expect(rule.dateMeaning).toBe('due');
    expect(rule.action).toBe('pay');
    expect(
      reminderPlanFor({ everydayKind: 'electricity_bill', expiresOn: '2026-10-10' }, NOW)?.at,
    ).toEqual(new Date(2026, 9, 7, 9, 0, 0));
  });

  it('falls back to a later lead when the first has passed', () => {
    // A PUC expiring in 3 days: the 7-day reminder is gone, the 1-day one is not.
    expect(
      reminderPlanFor({ everydayKind: 'vehicle_puc', expiresOn: '2026-09-27' }, NOW)?.at,
    ).toEqual(new Date(2026, 8, 26, 9, 0, 0));
  });

  it('keeps the old timing for a document with no rule', () => {
    expect(reminderPlanFor({ documentType: 'pan', expiresOn: '2030-08-12' }, NOW)?.at).toEqual(
      new Date(2030, 6, 13, 9, 0, 0),
    );
    expect(reminderRuleFor({ documentType: 'pan' }).action).toBeNull();
  });

  it('has none without a date, or for a date already past', () => {
    expect(reminderPlanFor({ documentType: 'pan' }, NOW)).toBeNull();
    expect(
      reminderPlanFor({ everydayKind: 'vehicle_puc', expiresOn: '2026-09-01' }, NOW),
    ).toBeNull();
  });

  it('gives every lead list in order, ending on the day itself', () => {
    for (const kind of EVERYDAY_KINDS) {
      const { leadDays } = reminderRuleFor({ everydayKind: kind });
      expect(leadDays.at(-1), kind).toBe(0);
      expect(
        [...leadDays].sort((a, b) => b - a),
        kind,
      ).toEqual([...leadDays]);
    }
  });
});

describe('suggested date', () => {
  it('starts insurance a year out and a PUC six months out', () => {
    expect(suggestedDate(reminderRuleFor({ everydayKind: 'vehicle_insurance' }), NOW)).toBe(
      '2027-09-24',
    );
    expect(suggestedDate(reminderRuleFor({ everydayKind: 'vehicle_puc' }), NOW)).toBe('2027-03-24');
  });

  it('clamps to the end of a shorter month', () => {
    const rule = { ...reminderRuleFor({ everydayKind: 'vehicle_puc' }), suggestedMonths: 1 };
    expect(suggestedDate(rule, new Date(2027, 0, 31, 10))).toBe('2027-02-28');
    expect(suggestedDate(rule, new Date(2028, 0, 31, 10))).toBe('2028-02-29');
  });

  it('suggests nothing where the paper must be read: a bill, an RC, a certificate', () => {
    expect(suggestedDate(reminderRuleFor({ everydayKind: 'electricity_bill' }), NOW)).toBeNull();
    expect(suggestedDate(reminderRuleFor({ everydayKind: 'vehicle_rc' }), NOW)).toBeNull();
    expect(suggestedDate(reminderRuleFor({ documentType: 'income_certificate' }), NOW)).toBeNull();
  });

  it('is always a date the expiry check accepts', () => {
    for (const kind of EVERYDAY_KINDS) {
      const date = suggestedDate(reminderRuleFor({ everydayKind: kind }), NOW);
      if (date === null) continue;
      expect(validateSaveDocument({ ...FORM, everydayKind: kind, expiresOn: date }, NOW).ok).toBe(
        true,
      );
    }
  });
});

describe('days until', () => {
  it('counts calendar days, whatever the hour', () => {
    expect(daysUntil('2026-09-24', NOW)).toBe(0);
    expect(daysUntil('2026-09-25', new Date(2026, 8, 24, 23, 59))).toBe(1);
    expect(daysUntil('2026-10-01', NOW)).toBe(7);
    expect(daysUntil('2026-09-21', NOW)).toBe(-3);
    expect(daysUntil('2027-09-24', NOW)).toBe(365);
    expect(daysUntil('not a date', NOW)).toBeNull();
  });
});

describe('coming up', () => {
  const doc = (id: string, fields: Omit<UpcomingSource, 'id'>): UpcomingSource => ({
    id,
    ...fields,
  });

  it('lists a PUC from a week out, but not eight days out', () => {
    const inside = upcomingReminders(
      [doc('puc', { everydayKind: 'vehicle_puc', expiresOn: '2026-10-01' })],
      NOW,
    );
    expect(inside).toEqual([
      {
        id: 'puc',
        expiresOn: '2026-10-01',
        days: 7,
        state: 'soon',
        dateMeaning: 'expires',
        action: null,
      },
    ]);
    expect(
      upcomingReminders(
        [doc('puc', { everydayKind: 'vehicle_puc', expiresOn: '2026-10-02' })],
        NOW,
      ),
    ).toEqual([]);
  });

  it('lists a certificate from a month out, with Renew', () => {
    const [item] = upcomingReminders(
      [doc('income', { documentType: 'income_certificate', expiresOn: '2026-10-24' })],
      NOW,
    );
    expect(item?.days).toBe(30);
    expect(item?.action).toBe('renew');
  });

  it('keeps an expired paper for a month and a passed bill for three days', () => {
    const list = upcomingReminders(
      [
        doc('expired', { documentType: 'income_certificate', expiresOn: '2026-08-25' }),
        doc('too-old', { documentType: 'income_certificate', expiresOn: '2026-08-24' }),
        doc('bill', { everydayKind: 'electricity_bill', expiresOn: '2026-09-21' }),
        doc('old-bill', { everydayKind: 'electricity_bill', expiresOn: '2026-09-20' }),
      ],
      NOW,
    );
    expect(list.map((item) => item.id)).toEqual(['expired', 'bill']);
    expect(list.every((item) => item.state === 'overdue')).toBe(true);
  });

  it('puts the most pressing first and stops at the limit', () => {
    const list = upcomingReminders(
      [
        doc('later', { documentType: 'income_certificate', expiresOn: '2026-10-20' }),
        doc('today', { everydayKind: 'gas_bill', expiresOn: '2026-09-24' }),
        doc('overdue', { everydayKind: 'gas_bill', expiresOn: '2026-09-23' }),
        doc('soon', { everydayKind: 'vehicle_puc', expiresOn: '2026-09-27' }),
        doc('none', { documentType: 'pan' }),
      ],
      NOW,
    );
    expect(list.map((item) => item.id)).toEqual(['overdue', 'today', 'soon']);
    expect(list[1]?.state).toBe('today');
  });

  it('words the date by what it means', () => {
    expect(upcomingMessage({ days: 7, dateMeaning: 'expires' })).toEqual({
      key: 'reminders.expires.inDays',
      values: { days: 7 },
    });
    expect(upcomingMessage({ days: 1, dateMeaning: 'due' }).key).toBe('reminders.due.tomorrow');
    expect(upcomingMessage({ days: 0, dateMeaning: 'due' }).key).toBe('reminders.due.today');
    expect(upcomingMessage({ days: -1, dateMeaning: 'expires' }).key).toBe(
      'reminders.expires.yesterday',
    );
    expect(upcomingMessage({ days: -3, dateMeaning: 'expires' })).toEqual({
      key: 'reminders.expires.pastDays',
      values: { days: 3 },
    });
  });
});

describe('vault Everyday filter', () => {
  const item = (id: string, everyday: boolean): VaultItem => ({
    id,
    title: id,
    category: null,
    tag: null,
    everyday,
    createdAt: NOW,
    pageCount: 1,
    mimeType: 'image/jpeg',
    sizeBytes: null,
    starred: false,
    thumbnail: { kind: 'none' },
  });
  const query = {
    filter: 'everyday',
    category: null,
    search: '',
    sort: 'newest',
    now: NOW,
  } as const;

  it('shows only everyday papers', () => {
    const shown = visibleItems([item('bill', true), item('aadhaar', false)], query);
    expect(shown.map((entry) => entry.id)).toEqual(['bill']);
  });

  it('explains an empty Everyday list', () => {
    expect(emptyListMessage(2, query).key).toBe('vault.empty.everyday');
  });
});

describe('everyday copy', () => {
  const RENDERED = [
    'reminders.title',
    'reminders.subtitle',
    'reminders.openHint',
    'reminders.actions.renew',
    'reminders.actions.pay',
    'reminders.actionHints.renew',
    'reminders.actionHints.pay',
    ...['expires', 'due'].flatMap((meaning) =>
      ['inDays', 'tomorrow', 'today', 'yesterday', 'pastDays'].map(
        (key) => `reminders.${meaning}.${key}`,
      ),
    ),
    ...EVERYDAY_KINDS.map((kind) => `everydayKinds.${kind}`),
    'vault.filters.everyday',
    'vault.empty.everyday',
    'saveDocument.reminder.bodyDue',
    'saveDocument.reminder.dueOn',
    'saveDocument.reminder.sheetTitleDue',
    'saveDocument.reminder.checkPaper',
  ];

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every key in %s', (_locale, dictionary) => {
    for (const key of RENDERED) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the day counts in %s', (_locale, dictionary) => {
    for (const key of RENDERED.filter((k) => k.endsWith('inDays') || k.endsWith('pastDays'))) {
      expect(lookup(dictionary, key), key).toContain('{days}');
    }
  });

  it('promises the Everyday list stays on the phone', () => {
    expect(en.vault.empty.everyday.toLowerCase()).toContain('only on this phone');
  });
});
