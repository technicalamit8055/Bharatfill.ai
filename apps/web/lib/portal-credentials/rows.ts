import 'server-only';

import { z } from 'zod';
import {
  AppError,
  linkedApplicationSchema,
  loginIdHint,
  providerUnavailable,
  type CreatePortalCredentialInput,
  type CredentialSecretPart,
  type LinkedApplication,
  type PortalCredentialView,
  type UpdatePortalCredentialInput,
} from '@assistigo/core';
import { EncryptionKeyError, decryptField, encryptField } from '@assistigo/core/privacy/crypto';
import type { CustomerPortalCredentialRow } from '../supabase/database.types';

/**
 * Row building for `customer_portal_credentials` (migration 0036, spec §19.7a).
 *
 * The one place a portal secret is encrypted or decrypted. Every ciphertext is bound by GCM
 * additional data to its organization, customer, row and column, so a login ID ciphertext cannot
 * be pasted into the password column — or onto another citizen's row — and still decrypt.
 *
 * Pure apart from the key lookup, so the AAD binding and the patch rules are unit tested.
 */

export type CredentialRef = {
  organizationId: string;
  customerId: string;
  credentialId: string;
};

/** Columns that are read back by the API. Ciphertext never leaves the server. */
export const PORTAL_CREDENTIAL_COLUMNS =
  'id, organization_id, customer_id, portal_key, portal_label, login_id_encrypted, login_id_hint, password_encrypted, security_question, security_answer_encrypted, linked_applications, password_updated_at, last_used_at, created_by, updated_by, created_at, updated_at';

const SECRET_COLUMN: Record<CredentialSecretPart, keyof CustomerPortalCredentialRow> = {
  login_id: 'login_id_encrypted',
  password: 'password_encrypted',
  security_answer: 'security_answer_encrypted',
};

export function credentialAad(ref: CredentialRef, part: CredentialSecretPart): string {
  return `${ref.organizationId}:${ref.customerId}:${ref.credentialId}:portal_credential:${part}`;
}

/** A missing or malformed key is a server misconfiguration; the key never reaches a response. */
export function sealSecret(
  ref: CredentialRef,
  part: CredentialSecretPart,
  plaintext: string,
  key?: string,
): string {
  try {
    return encryptField(plaintext, credentialAad(ref, part), key);
  } catch {
    throw providerUnavailable('errors.encryption_unavailable');
  }
}

export function openSecret(
  ref: CredentialRef,
  part: CredentialSecretPart,
  ciphertext: string,
  key?: string,
): string {
  try {
    return decryptField(ciphertext, credentialAad(ref, part), key);
  } catch (error) {
    if (error instanceof EncryptionKeyError) {
      throw providerUnavailable('errors.encryption_unavailable');
    }
    // Wrong key after a rotation, or a tampered/moved row. Never say which.
    throw new AppError('INTERNAL', 'errors.portal_credential_unreadable');
  }
}

export function refOf(row: Pick<CustomerPortalCredentialRow, 'id' | 'organization_id' | 'customer_id'>): CredentialRef {
  return { organizationId: row.organization_id, customerId: row.customer_id, credentialId: row.id };
}

/** Decrypts one part of a stored row, or null when that part was never saved. */
export function readSecret(
  row: CustomerPortalCredentialRow,
  part: CredentialSecretPart,
  key?: string,
): string | null {
  const ciphertext = row[SECRET_COLUMN[part]];
  if (typeof ciphertext !== 'string' || ciphertext === '') return null;
  return openSecret(refOf(row), part, ciphertext, key);
}

const linkedApplicationsSchema = z.array(linkedApplicationSchema);

function parseLinkedApplications(value: unknown): LinkedApplication[] {
  const parsed = linkedApplicationsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function toPortalCredentialView(row: CustomerPortalCredentialRow): PortalCredentialView {
  return {
    id: row.id,
    portalKey: row.portal_key,
    portalLabel: row.portal_label,
    loginIdHint: row.login_id_hint,
    hasPassword: row.password_encrypted !== null,
    securityQuestion: row.security_question,
    hasSecurityAnswer: row.security_answer_encrypted !== null,
    linkedApplications: parseLinkedApplications(row.linked_applications),
    passwordUpdatedAt: row.password_updated_at,
    lastUsedAt: row.last_used_at,
    updatedAt: row.updated_at,
  };
}

/** The insert row for a new credential. The id is chosen here because the AAD needs it. */
export function buildCredentialInsert(
  ref: CredentialRef,
  input: CreatePortalCredentialInput,
  userId: string,
  now: string,
  key?: string,
): Record<string, unknown> {
  return {
    id: ref.credentialId,
    organization_id: ref.organizationId,
    customer_id: ref.customerId,
    portal_key: input.portalKey,
    portal_label: input.portalKey === 'other' ? (input.portalLabel ?? null) : null,
    login_id_encrypted: sealSecret(ref, 'login_id', input.loginId, key),
    login_id_hint: loginIdHint(input.loginId),
    password_encrypted: input.password ? sealSecret(ref, 'password', input.password, key) : null,
    password_updated_at: input.password ? now : null,
    security_question: input.securityQuestion ?? null,
    security_answer_encrypted: input.securityAnswer
      ? sealSecret(ref, 'security_answer', input.securityAnswer, key)
      : null,
    linked_applications: input.linkedApplications,
    created_by: userId,
    updated_by: userId,
  };
}

/**
 * The update patch, plus the names of what changed for the audit line (names only — the values
 * never go near the audit trail).
 */
export function buildCredentialPatch(
  ref: CredentialRef,
  portalKey: CustomerPortalCredentialRow['portal_key'],
  input: UpdatePortalCredentialInput,
  userId: string,
  now: string,
  key?: string,
): { patch: Record<string, unknown>; changed: string[] } {
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  if (input.portalLabel !== undefined && portalKey === 'other') {
    patch.portal_label = input.portalLabel;
    changed.push('portal_label');
  }
  if (input.loginId !== undefined) {
    patch.login_id_encrypted = sealSecret(ref, 'login_id', input.loginId, key);
    patch.login_id_hint = loginIdHint(input.loginId);
    changed.push('login_id');
  }
  if (input.password !== undefined) {
    patch.password_encrypted =
      input.password === null ? null : sealSecret(ref, 'password', input.password, key);
    patch.password_updated_at = input.password === null ? null : now;
    changed.push('password');
  }
  if (input.securityQuestion !== undefined) {
    patch.security_question = input.securityQuestion;
    changed.push('security_question');
  }
  if (input.securityAnswer !== undefined) {
    patch.security_answer_encrypted =
      input.securityAnswer === null
        ? null
        : sealSecret(ref, 'security_answer', input.securityAnswer, key);
    changed.push('security_answer');
  }
  if (input.linkedApplications !== undefined) {
    patch.linked_applications = input.linkedApplications;
    changed.push('linked_applications');
  }

  if (changed.length > 0) patch.updated_by = userId;
  return { patch, changed };
}
