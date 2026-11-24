/**
 * "Preparing for" document checklist.
 * Master spec §9.7 step 3 (required documents checklist), §13.3 (prepared files).
 *
 * The operator picks the form or scheme a customer is applying for; this works out, for each
 * document it asks for, whether the customer already has it on file. Pure and DOM-free: it reads
 * document *metadata* (type, status, preset) only, never a file or an extracted value.
 *
 * Requirements come from two places, both already in the product:
 *
 *   - a portal adapter's `documentRequirements` (free-text label, optional size preset),
 *   - a scheme's `requiredDocuments` (a fixed `SchemeDocumentKey` vocabulary).
 *
 * Both are turned into one `ChecklistRequirement` shape, so the screen does not care which.
 */

import { SCHEME_DOCUMENTS, type DocumentType, type SchemeDocumentKey } from '@assistigo/core';
import type { DocumentRequirement } from './adapters';
import { documentTypesNamedIn } from './documents';

export type ChecklistRequirement = {
  key: string;
  /** Adapter labels are English only, so `hi` is optional. */
  label: { en: string; hi?: string };
  required: boolean;
  /** A `REQUIREMENT_PRESETS` code: the portal wants this file at an exact size. */
  presetCode: string | null;
  /** Any one of these document types meets the requirement. Empty: the type cannot tell. */
  acceptedTypes: readonly DocumentType[];
};

export type ChecklistDocument = {
  id: string;
  documentType: string;
  status: string;
  createdAt: string;
};

export type ChecklistDerivative = {
  id: string;
  sourceDocumentId: string | null;
  toolType: 'photo' | 'signature' | 'pdf';
  presetCode: string | null;
  createdAt: string;
};

export const CHECKLIST_ITEM_STATES = [
  /** On file, in the form the portal wants. */
  'ready',
  /** The source is on file, but it has not been resized to this portal's preset yet. */
  'needs_preparing',
  'missing',
  /** No document type says "this is it" (a self declaration, a bank passbook). */
  'check_manually',
] as const;
export type ChecklistItemState = (typeof CHECKLIST_ITEM_STATES)[number];

export type ChecklistItem = {
  requirement: ChecklistRequirement;
  state: ChecklistItemState;
  /** The document that meets it — or, for `needs_preparing`, the one to prepare from. */
  documentId: string | null;
  /** The prepared file that meets a preset requirement. */
  derivativeId: string | null;
  /** What to upload it as, when it is missing. Null: let the reader detect it. */
  uploadType: DocumentType | null;
};

/**
 * A photo or signature counts only when a person said so. The classifier calls every image
 * without text `photo` — including a phone photo of a marksheet — but a photo or signature
 * someone *chose* is saved unread, as `stored` (AI_PIPELINE §2), whether at a centre or in the
 * app. Every other type counts in any state: the checklist is about having the file, and whether
 * its details were read is a separate question.
 */
function countsAs(document: ChecklistDocument, accepted: readonly DocumentType[]): boolean {
  if (!(accepted as readonly string[]).includes(document.documentType)) return false;
  if (document.documentType === 'photo' || document.documentType === 'signature') {
    return document.status === 'stored';
  }
  return document.status !== 'deleted';
}

function newestFirst<T extends { createdAt: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function uploadTypeFor(requirement: ChecklistRequirement): DocumentType | null {
  return requirement.acceptedTypes[0] ?? null;
}

function checkOne(
  requirement: ChecklistRequirement,
  documents: readonly ChecklistDocument[],
  derivatives: readonly ChecklistDerivative[],
): ChecklistItem {
  const base = { requirement, documentId: null, derivativeId: null, uploadType: null };
  const source = documents.find((document) => countsAs(document, requirement.acceptedTypes));

  if (requirement.presetCode) {
    const prepared = derivatives.find(
      (derivative) => derivative.presetCode === requirement.presetCode,
    );
    if (prepared) {
      return {
        ...base,
        state: 'ready',
        derivativeId: prepared.id,
        documentId: prepared.sourceDocumentId,
      };
    }
    if (source) return { ...base, state: 'needs_preparing', documentId: source.id };
    return { ...base, state: 'missing', uploadType: uploadTypeFor(requirement) };
  }

  if (requirement.acceptedTypes.length === 0) return { ...base, state: 'check_manually' };
  if (source) return { ...base, state: 'ready', documentId: source.id };

  // A photo or signature prepared in Document Tools is one too, even without a preset asked for.
  const prepared = derivatives.find((derivative) =>
    (requirement.acceptedTypes as readonly string[]).includes(derivative.toolType),
  );
  if (prepared) {
    return {
      ...base,
      state: 'ready',
      derivativeId: prepared.id,
      documentId: prepared.sourceDocumentId,
    };
  }
  return { ...base, state: 'missing', uploadType: uploadTypeFor(requirement) };
}

/** One item per requirement, in the order the form lists them — that order is meaningful. */
export function buildDocumentChecklist(input: {
  requirements: readonly ChecklistRequirement[];
  documents: readonly ChecklistDocument[];
  derivatives: readonly ChecklistDerivative[];
}): ChecklistItem[] {
  const documents = newestFirst(input.documents);
  const derivatives = newestFirst(input.derivatives);
  return input.requirements.map((requirement) => checkOne(requirement, documents, derivatives));
}

export type ChecklistSummary = {
  total: number;
  ready: number;
  /** Required items still not `ready` — what stands between the customer and applying. */
  outstanding: number;
};

export function summariseChecklist(items: readonly ChecklistItem[]): ChecklistSummary {
  return {
    total: items.length,
    ready: items.filter((item) => item.state === 'ready').length,
    outstanding: items.filter((item) => item.requirement.required && item.state !== 'ready').length,
  };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** A portal adapter's requirements. The types are read off the label, the key as a fallback. */
export function requirementsFromAdapter(
  requirements: readonly DocumentRequirement[],
): ChecklistRequirement[] {
  return requirements.map((requirement) => {
    const named = documentTypesNamedIn(requirement.label);
    return {
      key: requirement.key,
      label: { en: requirement.label.trim() || requirement.key },
      required: requirement.required,
      presetCode: requirement.presetCode ?? null,
      acceptedTypes: named.length > 0 ? named : documentTypesNamedIn(requirement.key),
    };
  });
}

/**
 * Which uploaded document type is each scheme document. Empty where no type exists for it yet:
 * an EWS or disability certificate, a birth certificate, a bank passbook and a ration card are
 * all saved as "Other document", which cannot say which of them it is.
 */
export const SCHEME_DOCUMENT_UPLOAD_TYPES: Record<SchemeDocumentKey, readonly DocumentType[]> = {
  aadhaar: ['aadhaar_like'],
  pan: ['pan'],
  caste_certificate: ['caste_certificate'],
  income_certificate: ['income_certificate'],
  domicile_certificate: ['residence_certificate'],
  ews_certificate: [],
  disability_certificate: [],
  birth_certificate: [],
  marksheet_10th: ['marksheet_10'],
  marksheet_12th: ['marksheet_12'],
  marksheet_graduation: ['marksheet_graduation'],
  bank_account: [],
  ration_card: [],
  photo: ['photo'],
  signature: ['signature'],
};

export function requirementsFromScheme(keys: readonly SchemeDocumentKey[]): ChecklistRequirement[] {
  return keys.map((key) => ({
    key,
    label: SCHEME_DOCUMENTS[key].label,
    required: true,
    presetCode: null,
    acceptedTypes: SCHEME_DOCUMENT_UPLOAD_TYPES[key],
  }));
}
