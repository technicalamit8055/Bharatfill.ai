/**
 * Family profiles: the pure model (labels, whose documents, expiry alerts, switcher and Family
 * screen rows), the vault index rules that keep a family member's documents on the phone, the
 * sync planner never uploading them, Save Document filing a scan under a member, the active
 * member store, and the copy in both languages. Sample people only — no real citizen data.
 */

import { describe, expect, it, vi } from 'vitest';

import { planSync } from '../lib/cloud/sync-plan';
import { createActiveMemberStore } from '../lib/family/active-member';
import {
  documentsOf,
  expiryAlerts,
  expiryState,
  FAMILY_RELATIONS,
  type FamilyMember,
  familyRows,
  MAX_FAMILY_MEMBERS,
  memberIdFromValue,
  memberInitials,
  memberLabels,
  memberValue,
  normaliseMemberName,
  resolveMember,
  SELF,
  switcherChips,
} from '../lib/family/family';
import { validateSaveDocument } from '../lib/vault/save-document';
import {
  EMPTY_VAULT_INDEX,
  findDocument,
  parseVaultIndex,
  phoneOnlyForNewDocument,
  serialiseVaultIndex,
  UnknownMemberError,
  type VaultDocument,
  type VaultIndex,
  withDetails,
  withDocument,
  withDocumentMember,
  withMemberAdded,
  withMemberChanged,
  withoutMember,
  withPhoneOnly,
  withReminder,
} from '../lib/vault/vault-index';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

const PAPA: FamilyMember = {
  id: '11111111-1111-4111-8111-111111111111',
  relation: 'father',
  createdAt: '2026-11-01T10:00:00.000Z',
};
const SISTER: FamilyMember = {
  id: '22222222-2222-4222-8222-222222222222',
  relation: 'sister',
  name: 'Sample Name',
  createdAt: '2026-11-02T10:00:00.000Z',
};
const CLOUD_ID = '99999999-9999-4999-8999-999999999999';

function doc(id: string, extra: Partial<VaultDocument> = {}): VaultDocument {
  return {
    id,
    createdAt: '2026-11-20T10:00:00.000Z',
    source: 'scanner',
    pages: [{ mimeType: 'image/jpeg' }],
    ...extra,
  };
}

const AADHAAR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function familyIndex(): VaultIndex {
  return withMemberAdded(withMemberAdded(EMPTY_VAULT_INDEX, PAPA), SISTER);
}

const relationLabel = (relation: string) => `rel:${relation}`;
const untitled = (source: 'scanner' | 'gallery') => `Untitled ${source}`;

// ---- Pure model -----------------------------------------------------------------------------

describe('family model', () => {
  it('maps the citizen to SELF and back', () => {
    expect(memberValue(null)).toBe(SELF);
    expect(memberIdFromValue(SELF)).toBeNull();
    expect(memberIdFromValue(PAPA.id)).toBe(PAPA.id);
  });

  it('cleans up a typed name and treats blanks as no name', () => {
    expect(normaliseMemberName('  Sample   Name ')).toBe('Sample Name');
    expect(normaliseMemberName('   ')).toBeNull();
    expect(normaliseMemberName('x'.repeat(60))).toHaveLength(40);
  });

  it('labels members by name, else relation, numbering repeats', () => {
    const second: FamilyMember = { ...PAPA, id: '33333333-3333-4333-8333-333333333333' };
    const labels = memberLabels([PAPA, SISTER, second], relationLabel);
    expect(labels.get(PAPA.id)).toBe('rel:father');
    expect(labels.get(SISTER.id)).toBe('Sample Name');
    expect(labels.get(second.id)).toBe('rel:father 2');
  });

  it('makes initials from one or two words, in any script', () => {
    expect(memberInitials('Papa')).toBe('P');
    expect(memberInitials('Sample Name')).toBe('SN');
    expect(memberInitials('पापा')).toBe('प');
    expect(memberInitials('')).toBe('?');
  });

  it('falls back to the citizen when the chosen member is gone', () => {
    expect(resolveMember([PAPA], PAPA.id)).toBe(PAPA.id);
    expect(resolveMember([SISTER], PAPA.id)).toBeNull();
    expect(resolveMember([PAPA], null)).toBeNull();
  });

  it('splits documents by owner', () => {
    const documents = [doc(AADHAAR_ID), doc(OTHER_ID, { memberId: PAPA.id })];
    expect(documentsOf(documents, null).map((d) => d.id)).toEqual([AADHAAR_ID]);
    expect(documentsOf(documents, PAPA.id).map((d) => d.id)).toEqual([OTHER_ID]);
    expect(documentsOf(documents, SISTER.id)).toEqual([]);
  });

  it('judges expiry by the phone calendar, with a 30 day window', () => {
    const now = new Date(2026, 10, 26, 15, 0);
    expect(expiryState('2026-11-25', now)).toBe('expired');
    expect(expiryState('2026-11-26', now)).toBe('soon');
    expect(expiryState('2026-12-26', now)).toBe('soon');
    expect(expiryState('2026-12-27', now)).toBe('later');
  });

  it('counts expired and soon-to-expire documents per person', () => {
    const now = new Date(2026, 10, 26, 9, 0);
    const alerts = expiryAlerts(
      [
        { expiresOn: '2026-11-01' },
        { expiresOn: '2026-12-01', memberId: PAPA.id },
        { expiresOn: '2026-11-20', memberId: PAPA.id },
        { expiresOn: '2030-01-01', memberId: SISTER.id },
        {},
      ],
      now,
    );
    expect(alerts.get(SELF)).toEqual({ expired: 1, soon: 0 });
    expect(alerts.get(PAPA.id)).toEqual({ expired: 1, soon: 1 });
    expect(alerts.has(SISTER.id)).toBe(false);
  });

  it('lists the citizen first on the switcher, dotting anyone with an alert', () => {
    const labels = memberLabels([PAPA, SISTER], relationLabel);
    const chips = switcherChips(
      [PAPA, SISTER],
      labels,
      new Map([[PAPA.id, { expired: 0, soon: 2 }]]),
      'You',
    );
    expect(chips).toEqual([
      { value: SELF, label: 'You', alert: false },
      { value: PAPA.id, label: 'rel:father', alert: true },
      { value: SISTER.id, label: 'Sample Name', alert: false },
    ]);
  });

  it('builds the Family screen rows with counts, alerts and who is showing', () => {
    const rows = familyRows({
      members: [PAPA, SISTER],
      labels: memberLabels([PAPA, SISTER], relationLabel),
      documents: [{}, { memberId: SISTER.id, expiresOn: '2026-12-01' }],
      now: new Date(2026, 10, 26),
      active: SISTER.id,
      youLabel: 'You',
      relationLabel,
    });
    expect(rows.map((row) => [row.value, row.documentCount, row.selected, row.editable])).toEqual([
      [SELF, 1, false, false],
      [PAPA.id, 0, false, true],
      [SISTER.id, 1, true, true],
    ]);
    expect(rows[2]?.relation).toBe('rel:sister');
    expect(rows[1]?.relation).toBeNull();
    expect(rows[2]?.alert).toEqual({ expired: 0, soon: 1 });
  });
});

// ---- Vault index ------------------------------------------------------------------------------

describe('family in the vault index', () => {
  it('round-trips members and a member document through serialisation', () => {
    const index = withDocument(familyIndex(), doc(AADHAAR_ID, { memberId: PAPA.id }));
    expect(parseVaultIndex(serialiseVaultIndex(index))).toEqual(index);
  });

  it('still parses an index written before family profiles', () => {
    const old = serialiseVaultIndex(withDocument(EMPTY_VAULT_INDEX, doc(AADHAAR_ID)));
    expect(parseVaultIndex(old)?.members).toBeUndefined();
  });

  it('refuses a ninth member', () => {
    let index = EMPTY_VAULT_INDEX;
    for (let n = 0; n < MAX_FAMILY_MEMBERS; n += 1) {
      index = withMemberAdded(index, {
        ...PAPA,
        id: `0000000${n}-0000-4000-8000-000000000000`,
      });
    }
    expect(() => withMemberAdded(index, SISTER)).toThrow(RangeError);
  });

  it('changes a relation and removes a name', () => {
    const index = withMemberChanged(familyIndex(), SISTER.id, { relation: 'daughter', name: null });
    expect(index.members?.find((member) => member.id === SISTER.id)).toEqual({
      id: SISTER.id,
      relation: 'daughter',
      createdAt: SISTER.createdAt,
    });
  });

  it('always keeps a new member document on the phone', () => {
    expect(phoneOnlyForNewDocument({ documentType: 'aadhaar_like', memberId: PAPA.id })).toBe(true);
    expect(phoneOnlyForNewDocument({ documentType: 'aadhaar_like', phoneOnly: false })).toBe(false);
    const index = withDocument(
      familyIndex(),
      doc(AADHAAR_ID, { memberId: PAPA.id, documentType: 'aadhaar_like', phoneOnly: false }),
    );
    expect(findDocument(index, AADHAAR_ID)?.phoneOnly).toBe(true);
  });

  it('refuses to file a document under someone who is not in the vault', () => {
    expect(() => withDocument(EMPTY_VAULT_INDEX, doc(AADHAAR_ID, { memberId: PAPA.id }))).toThrow(
      UnknownMemberError,
    );
    expect(() =>
      withDocumentMember(withDocument(EMPTY_VAULT_INDEX, doc(AADHAAR_ID)), AADHAAR_ID, PAPA.id),
    ).toThrow(UnknownMemberError);
  });

  it('never lets a member document be shared', () => {
    let index = withDocument(familyIndex(), doc(AADHAAR_ID, { memberId: PAPA.id }));
    index = withPhoneOnly(index, AADHAAR_ID, false);
    expect(findDocument(index, AADHAAR_ID)?.phoneOnly).toBe(true);
    index = withDetails(index, AADHAAR_ID, { category: 'identity' });
    expect(findDocument(index, AADHAAR_ID)?.phoneOnly).toBe(true);
  });

  it('moving a synced document to a member deletes its cloud copy', () => {
    const synced = withDocument(
      familyIndex(),
      doc(AADHAAR_ID, {
        documentType: 'aadhaar_like',
        category: 'identity',
        phoneOnly: false,
        phoneOnlyChosen: true,
        cloud: {
          id: CLOUD_ID,
          title: 'Aadhaar',
          documentType: 'aadhaar_like',
          category: 'identity',
        },
      }),
    );
    const moved = withDocumentMember(synced, AADHAAR_ID, PAPA.id);
    const document = findDocument(moved, AADHAAR_ID);
    expect(document?.memberId).toBe(PAPA.id);
    expect(document?.phoneOnly).toBe(true);
    expect(document?.cloud).toBeUndefined();
    expect(document?.phoneOnlyChosen).toBeUndefined();
    expect(moved.cloudDeletes).toEqual([CLOUD_ID]);
  });

  it('moving back to the citizen follows the type again, unless they chose phone-only', () => {
    const base = withDocument(
      familyIndex(),
      doc(AADHAAR_ID, { documentType: 'aadhaar_like', category: 'identity', memberId: PAPA.id }),
    );
    const back = findDocument(withDocumentMember(base, AADHAAR_ID, null), AADHAAR_ID);
    expect(back?.memberId).toBeUndefined();
    expect(back?.phoneOnly).toBe(false);

    const chosen = withDocument(
      familyIndex(),
      doc(OTHER_ID, {
        documentType: 'aadhaar_like',
        category: 'identity',
        phoneOnly: true,
        phoneOnlyChosen: true,
      }),
    );
    const roundTrip = withDocumentMember(
      withDocumentMember(chosen, OTHER_ID, SISTER.id),
      OTHER_ID,
      null,
    );
    expect(findDocument(roundTrip, OTHER_ID)?.phoneOnly).toBe(true);
  });

  it('removing a member takes their documents with them, and only theirs', () => {
    let index = withDocument(familyIndex(), doc(AADHAAR_ID, { memberId: PAPA.id }));
    index = withDocument(index, doc(OTHER_ID));
    const { index: next, removed } = withoutMember(index, PAPA.id);
    expect(removed.map((document) => document.id)).toEqual([AADHAAR_ID]);
    expect(next.documents.map((document) => document.id)).toEqual([OTHER_ID]);
    expect(next.members?.map((member) => member.id)).toEqual([SISTER.id]);
  });

  it('replaces or clears a reminder id', () => {
    const index = withDocument(EMPTY_VAULT_INDEX, doc(AADHAAR_ID, { reminderId: 'old' }));
    expect(findDocument(withReminder(index, AADHAAR_ID, 'new'), AADHAAR_ID)?.reminderId).toBe(
      'new',
    );
    expect(
      findDocument(withReminder(index, AADHAAR_ID, null), AADHAAR_ID)?.reminderId,
    ).toBeUndefined();
  });
});

// ---- Sync ------------------------------------------------------------------------------------

describe('sync never sends a family member document', () => {
  it('does not upload it, even from an index that says it is shared', () => {
    // Built by hand, past the index rules, to prove the planner holds on its own.
    const index: VaultIndex = {
      ...familyIndex(),
      documents: [doc(AADHAAR_ID, { memberId: PAPA.id, phoneOnly: false, title: 'A' })],
    };
    expect(planSync(index, { cloudEnabled: true, untitled })).toEqual([]);
  });

  it('does not update a cloud copy that somehow survived', () => {
    const index: VaultIndex = {
      ...familyIndex(),
      documents: [
        doc(AADHAAR_ID, {
          memberId: PAPA.id,
          phoneOnly: false,
          title: 'Renamed',
          cloud: { id: CLOUD_ID, title: 'Old', documentType: 'generic', category: 'other' },
        }),
      ],
    };
    expect(planSync(index, { cloudEnabled: true, untitled })).toEqual([]);
  });

  it('still uploads the citizen’s own shared documents beside them', () => {
    const index: VaultIndex = {
      ...familyIndex(),
      documents: [
        doc(AADHAAR_ID, { memberId: PAPA.id, phoneOnly: true }),
        doc(OTHER_ID, { phoneOnly: false, title: 'Mine' }),
      ],
    };
    const actions = planSync(index, { cloudEnabled: true, untitled });
    expect(actions.map((action) => action.kind === 'upload' && action.documentId)).toEqual([
      OTHER_ID,
    ]);
  });
});

// ---- Save Document ----------------------------------------------------------------------------

describe('saving for a family member', () => {
  const form = {
    title: 'Aadhaar Card',
    documentType: 'aadhaar_like' as const,
    category: 'identity' as const,
    tags: [],
    expiresOn: null,
    phoneOnly: false,
  };

  it('files it under the member and keeps it on the phone, whatever the switch said', () => {
    const result = validateSaveDocument({ ...form, memberId: PAPA.id }, new Date());
    expect(result.ok && result.details.memberId).toBe(PAPA.id);
    expect(result.ok && result.details.phoneOnly).toBe(true);
    expect(result.ok && result.details.phoneOnlyChosen).toBeUndefined();
  });

  it('saves the citizen’s own document as before', () => {
    const result = validateSaveDocument({ ...form, memberId: null }, new Date());
    expect(result.ok && result.details.memberId).toBeUndefined();
    expect(result.ok && result.details.phoneOnly).toBe(false);
  });
});

// ---- Active member ----------------------------------------------------------------------------

describe('active member store', () => {
  it('starts on the citizen and tells listeners only about real changes', () => {
    const store = createActiveMemberStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toBeNull();
    store.set(PAPA.id);
    store.set(PAPA.id);
    expect(store.get()).toBe(PAPA.id);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---- Copy ------------------------------------------------------------------------------------

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

function leafKeys(value: unknown, prefix: string): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, `${prefix}.${key}`));
}

const PLACEHOLDERS: Record<string, readonly string[]> = {
  'family.count.other': ['{count}'],
  'family.alert.expired': ['{count}'],
  'family.alert.soon': ['{count}'],
  'family.actions.label': ['{name}'],
  'family.remove.title': ['{name}'],
  'family.remove.body': ['{name}', '{count}'],
  'family.remove.bodyEmpty': ['{name}'],
  'family.addSheet.nameTitle': ['{relation}'],
  'family.switcher.withAlert': ['{name}'],
  'family.saveFor.phoneTitle': ['{name}'],
  'family.details.owner': ['{name}'],
  'family.details.unshareTitle': ['{name}'],
  'family.notification.expires': ['{relation}', '{when}', '{date}'],
  'family.notification.due': ['{relation}', '{when}', '{date}'],
};

describe('family copy', () => {
  const keys = [
    ...leafKeys(en.family, 'family'),
    ...FAMILY_RELATIONS.map((relation) => `family.relations.${relation}`),
    'profile.menu.family.title',
    'profile.menu.family.subtitle',
  ];

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every key in %s', (_locale, dictionary) => {
    for (const key of keys) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the placeholders in %s', (_locale, dictionary) => {
    for (const [key, placeholders] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of placeholders) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });

  it('defines the same family keys in Hindi as in English', () => {
    expect(leafKeys(hi.family, 'family').sort()).toEqual(leafKeys(en.family, 'family').sort());
  });

  it('never names the member in a reminder, only the relation', () => {
    for (const dictionary of [en, hi]) {
      for (const body of Object.values(dictionary.family.notification)) {
        // Lock-screen text: the relation, the countdown and the date, nothing else.
        expect(body.match(/\{\w+\}/g)?.sort()).toEqual(['{date}', '{relation}', '{when}']);
      }
    }
  });
});
