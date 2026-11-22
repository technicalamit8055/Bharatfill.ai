import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAppError } from '@assistigo/core';
import {
  assertVaultConfigured,
  generateShareCode,
  matchesShareCode,
  matchesVaultPin,
  mobileHmac,
  newCodeSalt,
  newDocumentKey,
  shareCodeHmac,
  unwrapDocumentKey,
  vaultPinHmac,
  wrapDocumentKey,
} from './secrets';
import { isCitizenUser } from './context';

const MASTER = randomBytes(32).toString('base64');
const OTHER_MASTER = randomBytes(32).toString('base64');
const CITIZEN = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN = '22222222-2222-4222-8222-222222222222';

describe('document key wrapping', () => {
  it('round-trips under the same citizen and master key', () => {
    const key = newDocumentKey();
    const wrapped = wrapDocumentKey(CITIZEN, key, MASTER);
    expect(wrapped.startsWith('v1.')).toBe(true);
    expect(wrapped).not.toContain(key.toString('base64'));
    expect(unwrapDocumentKey(CITIZEN, wrapped, MASTER).equals(key)).toBe(true);
  });

  it('refuses a wrapped key moved to another citizen', () => {
    const wrapped = wrapDocumentKey(CITIZEN, newDocumentKey(), MASTER);
    expect(() => unwrapDocumentKey(OTHER_CITIZEN, wrapped, MASTER)).toThrow();
  });

  it('refuses a different master key', () => {
    const wrapped = wrapDocumentKey(CITIZEN, newDocumentKey(), MASTER);
    expect(() => unwrapDocumentKey(CITIZEN, wrapped, OTHER_MASTER)).toThrow();
  });

  it('fails closed on a malformed master key', () => {
    let caught: unknown;
    try {
      assertVaultConfigured('too-short');
    } catch (error) {
      caught = error;
    }
    expect(isAppError(caught)).toBe(true);
    expect((caught as { messageKey?: string }).messageKey).toBe('errors.vault.unavailable');
  });
});

describe('Vault PIN HMAC', () => {
  it('matches the right PIN only', () => {
    const stored = vaultPinHmac(CITIZEN, '4826', MASTER);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(matchesVaultPin(CITIZEN, '4826', stored, MASTER)).toBe(true);
    expect(matchesVaultPin(CITIZEN, '4827', stored, MASTER)).toBe(false);
  });

  it('gives two citizens with the same PIN different values', () => {
    expect(vaultPinHmac(CITIZEN, '4826', MASTER)).not.toBe(
      vaultPinHmac(OTHER_CITIZEN, '4826', MASTER),
    );
  });

  it('depends on the master key, so a leaked table alone cannot be brute-forced', () => {
    expect(vaultPinHmac(CITIZEN, '4826', MASTER)).not.toBe(
      vaultPinHmac(CITIZEN, '4826', OTHER_MASTER),
    );
  });
});

describe('mobile HMAC', () => {
  it('is stable for a number and keyed', () => {
    expect(mobileHmac('9900012345', MASTER)).toBe(mobileHmac('9900012345', MASTER));
    expect(mobileHmac('9900012345', MASTER)).not.toBe(mobileHmac('9900012346', MASTER));
    expect(mobileHmac('9900012345', MASTER)).not.toBe(mobileHmac('9900012345', OTHER_MASTER));
  });

  it('is not the PIN derivation', () => {
    expect(mobileHmac('4826', MASTER)).not.toBe(vaultPinHmac(CITIZEN, '4826', MASTER));
  });
});

describe('share codes', () => {
  it('are six digits', () => {
    for (let i = 0; i < 50; i++) expect(generateShareCode()).toMatch(/^\d{6}$/);
  });

  it('verify against their salted HMAC only', () => {
    const salt = newCodeSalt();
    const stored = shareCodeHmac('849201', salt);
    expect(matchesShareCode('849201', salt, stored)).toBe(true);
    expect(matchesShareCode('849202', salt, stored)).toBe(false);
    expect(matchesShareCode('849201', newCodeSalt(), stored)).toBe(false);
  });
});

describe('isCitizenUser (mirror of public.is_citizen_principal)', () => {
  it('accepts a tagged or phone-only account', () => {
    expect(
      isCitizenUser({ id: 'a', app_metadata: { principal: 'citizen' }, email: 'x@example.test' }),
    ).toBe(true);
    expect(isCitizenUser({ id: 'a', phone: '919900012345', email: null })).toBe(true);
  });

  it('refuses operators and anonymous users', () => {
    expect(isCitizenUser({ id: 'a', email: 'op@example.test', phone: null })).toBe(false);
    expect(isCitizenUser({ id: 'a', email: 'op@example.test', phone: '919900012345' })).toBe(false);
    expect(isCitizenUser({ id: 'a', phone: '919900012345', is_anonymous: true })).toBe(false);
  });
});
