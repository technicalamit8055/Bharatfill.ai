/**
 * Vault categories — the four sections of the citizen document vault
 * (`docs/CITIZEN_MOBILE_APP_SPEC.md` §3 Feature 2, and the `category` column in §5.2).
 *
 * Deliberately built on top of `DocumentType` from `@assistigo/core` rather than introducing a
 * second document vocabulary: the operator dashboard, the extension and this app must agree on
 * what a "class 10 marksheet" is, or the autofill handoff silently mismatches.
 *
 * `VAULT_DOCUMENT_TYPES` is exhaustive over `DocumentType`, so adding a class in core is a
 * typecheck error here until it is placed in a category.
 */

import { DOCUMENT_TYPES, type DocumentType } from '@assistigo/core';

export const VAULT_CATEGORIES = ['identity', 'academic', 'certificate', 'form_asset'] as const;
export type VaultCategoryKey = (typeof VAULT_CATEGORIES)[number];

/**
 * Which category each core document type belongs to.
 *
 * `null` means the type is not surfaced as its own vault section — receipts and generated
 * application PDFs are operator-side artefacts, and `unknown` is a pre-classification state.
 */
export const VAULT_DOCUMENT_TYPES: Record<DocumentType, VaultCategoryKey | null> = {
  aadhaar_like: 'identity',
  pan: 'identity',
  voter_id: 'identity',
  marksheet_10: 'academic',
  marksheet_12: 'academic',
  marksheet_graduation: 'academic',
  caste_certificate: 'certificate',
  income_certificate: 'certificate',
  residence_certificate: 'certificate',
  photo: 'form_asset',
  signature: 'form_asset',
  receipt: null,
  application_pdf: null,
  generic: null,
  unknown: null,
};

export function categoryOf(documentType: DocumentType): VaultCategoryKey | null {
  return VAULT_DOCUMENT_TYPES[documentType];
}

export function documentTypesIn(category: VaultCategoryKey): readonly DocumentType[] {
  return DOCUMENT_TYPES.filter((type) => VAULT_DOCUMENT_TYPES[type] === category);
}

export function isVaultCategory(value: unknown): value is VaultCategoryKey {
  return typeof value === 'string' && (VAULT_CATEGORIES as readonly string[]).includes(value);
}

/** Translation key for a category heading. Screens never hard-code the label. */
export function vaultCategoryLabelKey(category: VaultCategoryKey): string {
  return `vault.categories.${category}`;
}
