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

import {
  CITIZEN_VAULT_CATEGORIES,
  CITIZEN_VAULT_DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES,
  type CitizenVaultCategory,
  type DocumentType,
} from '@assistigo/core';

/**
 * The sections and the type → section map now live in `@assistigo/core` (citizen-vault), so the
 * server that stores a synced document files it under the same section this app shows.
 */
export const VAULT_CATEGORIES = CITIZEN_VAULT_CATEGORIES;
export type VaultCategoryKey = CitizenVaultCategory;

/**
 * Which category each core document type belongs to.
 *
 * `null` means the type is not surfaced as its own vault section — receipts and generated
 * application PDFs are operator-side artefacts, and `unknown` is a pre-classification state.
 */
export const VAULT_DOCUMENT_TYPES: Record<DocumentType, VaultCategoryKey | null> =
  CITIZEN_VAULT_DOCUMENT_CATEGORIES;

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
