import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES, type DocumentType } from '../documents/types';
import { keepsOnPhoneByDefault } from './index';

/**
 * Every type, decided once (docs/VAULT_BRIDGE_DESIGN.md §15). A new document type fails this
 * test until someone decides whether a citizen's scan of it reaches the cloud by default.
 */
const STAYS_ON_PHONE: Record<DocumentType, boolean> = {
  aadhaar_like: false,
  pan: false,
  voter_id: false,
  marksheet_10: false,
  marksheet_12: false,
  marksheet_graduation: false,
  caste_certificate: false,
  income_certificate: false,
  residence_certificate: false,
  photo: false,
  signature: false,
  receipt: true,
  application_pdf: true,
  generic: true,
  unknown: true,
};

describe('keepsOnPhoneByDefault', () => {
  it.each(DOCUMENT_TYPES)('decides %s', (type) => {
    expect(keepsOnPhoneByDefault(type)).toBe(STAYS_ON_PHONE[type]);
  });

  it('keeps a document with no type on the phone', () => {
    expect(keepsOnPhoneByDefault(undefined)).toBe(true);
    expect(keepsOnPhoneByDefault(null, null)).toBe(true);
  });

  it('shares an everyday scan the citizen filed in a vault section', () => {
    expect(keepsOnPhoneByDefault('generic', 'identity')).toBe(false);
    expect(keepsOnPhoneByDefault(undefined, 'academic')).toBe(false);
  });

  it('shares a form document whatever folder it is in', () => {
    expect(keepsOnPhoneByDefault('aadhaar_like', null)).toBe(false);
  });
});
