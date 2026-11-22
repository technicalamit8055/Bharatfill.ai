import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAppError } from '@assistigo/core';
import type { CustomerPortalCredentialRow } from '../supabase/database.types';
import {
  buildCredentialInsert,
  buildCredentialPatch,
  credentialAad,
  openSecret,
  readSecret,
  sealSecret,
  toPortalCredentialView,
  type CredentialRef,
} from './rows';

const KEY = randomBytes(32).toString('base64');
const NOW = '2026-11-07T10:00:00.000Z';
const USER = '00000000-0000-4000-8000-0000000000aa';

const ref: CredentialRef = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  customerId: '00000000-0000-4000-8000-000000000002',
  credentialId: '00000000-0000-4000-8000-000000000003',
};

function asRow(insert: Record<string, unknown>): CustomerPortalCredentialRow {
  return {
    last_used_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...insert,
  } as CustomerPortalCredentialRow;
}

// Fake test data only — never a real registration number or password.
const input = {
  portalKey: 'ssc' as const,
  loginId: 'TEST0000123789',
  password: 'Bakemiv@4827',
  securityQuestion: 'First school?',
  securityAnswer: 'Test School',
  linkedApplications: [{ label: 'CGL 2026', number: 'TEST-ROLL-1' }],
};

describe('portal credential rows', () => {
  it('never writes a secret in plaintext', () => {
    const insert = buildCredentialInsert(ref, input, USER, NOW, KEY);
    const serialised = JSON.stringify(insert);
    expect(serialised).not.toContain(input.loginId);
    expect(serialised).not.toContain(input.password);
    expect(serialised).not.toContain(input.securityAnswer);
    expect(insert.login_id_encrypted).toMatch(/^v1\./);
    expect(insert.password_encrypted).toMatch(/^v1\./);
    expect(insert.login_id_hint).toBe('•••••789');
    expect(insert.password_updated_at).toBe(NOW);
  });

  it('round-trips each part', () => {
    const row = asRow(buildCredentialInsert(ref, input, USER, NOW, KEY));
    expect(readSecret(row, 'login_id', KEY)).toBe(input.loginId);
    expect(readSecret(row, 'password', KEY)).toBe(input.password);
    expect(readSecret(row, 'security_answer', KEY)).toBe(input.securityAnswer);
  });

  it('binds a ciphertext to its column: a login ID cannot be read as the password', () => {
    const sealed = sealSecret(ref, 'login_id', 'TEST-ID', KEY);
    expect(() => openSecret(ref, 'password', sealed, KEY)).toThrow();
  });

  it('binds a ciphertext to its row and customer', () => {
    const sealed = sealSecret(ref, 'password', 'secret', KEY);
    const otherRow = { ...ref, credentialId: '00000000-0000-4000-8000-000000000009' };
    const otherCustomer = { ...ref, customerId: '00000000-0000-4000-8000-000000000008' };
    for (const moved of [otherRow, otherCustomer]) {
      try {
        openSecret(moved, 'password', sealed, KEY);
        expect.unreachable('a moved ciphertext must not decrypt');
      } catch (error) {
        expect(isAppError(error) && error.messageKey).toBe('errors.portal_credential_unreadable');
      }
    }
  });

  it('names the context in the AAD', () => {
    expect(credentialAad(ref, 'password')).toBe(
      `${ref.organizationId}:${ref.customerId}:${ref.credentialId}:portal_credential:password`,
    );
  });

  it('reports a missing key as a configuration problem, not a crash', () => {
    try {
      sealSecret(ref, 'password', 'x', 'too-short');
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.messageKey).toBe('errors.encryption_unavailable');
    }
  });

  it('builds a view with no secret in it', () => {
    const view = toPortalCredentialView(asRow(buildCredentialInsert(ref, input, USER, NOW, KEY)));
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(input.loginId);
    expect(serialised).not.toContain(input.password);
    expect(serialised).not.toContain(input.securityAnswer);
    expect(serialised).not.toContain('v1.');
    expect(view).toMatchObject({ portalKey: 'ssc', hasPassword: true, hasSecurityAnswer: true });
    expect(view.linkedApplications).toEqual(input.linkedApplications);
  });

  it('ignores a portal label on a catalogued portal', () => {
    const insert = buildCredentialInsert(ref, { ...input, portalLabel: 'x' }, USER, NOW, KEY);
    expect(insert.portal_label).toBeNull();
  });
});

describe('buildCredentialPatch', () => {
  it('changes nothing when nothing is sent', () => {
    expect(buildCredentialPatch(ref, 'ssc', {}, USER, NOW, KEY)).toEqual({ patch: {}, changed: [] });
  });

  it('replaces a password and stamps when', () => {
    const { patch, changed } = buildCredentialPatch(
      ref,
      'ssc',
      { password: 'Newpass@2345' },
      USER,
      NOW,
      KEY,
    );
    expect(changed).toEqual(['password']);
    expect(patch.password_encrypted).toMatch(/^v1\./);
    expect(patch.password_updated_at).toBe(NOW);
    expect(JSON.stringify(patch)).not.toContain('Newpass@2345');
  });

  it('clears a password with null', () => {
    const { patch } = buildCredentialPatch(ref, 'ssc', { password: null }, USER, NOW, KEY);
    expect(patch.password_encrypted).toBeNull();
    expect(patch.password_updated_at).toBeNull();
  });

  it('only renames an `other` portal', () => {
    expect(buildCredentialPatch(ref, 'ssc', { portalLabel: 'x' }, USER, NOW, KEY).changed).toEqual(
      [],
    );
    expect(
      buildCredentialPatch(ref, 'other', { portalLabel: 'x' }, USER, NOW, KEY).changed,
    ).toEqual(['portal_label']);
  });
});
