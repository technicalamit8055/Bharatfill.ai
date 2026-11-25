/**
 * The citizen's document checklist: which of the documents that forms ask for are in the vault.
 * Two lists share it: the everyday documents on Home and `/checklist`, and what one form asks
 * for (`/form-checklist`), from the scheme catalogue in `@assistigo/core`.
 *
 * Whether a requirement is met is decided by the same code the operator's checklist uses
 * (`@assistigo/form-engine/requirement-checklist`), over document types only. On top of that, a
 * document past its expiry date does not count.
 *
 * Worked out on the phone from the vault's index each time. Nothing is stored or sent.
 */

import {
  BUILT_IN_SCHEMES,
  type DocumentType,
  getBuiltInScheme,
  SCHEME_CATEGORIES,
  type SchemeCategory,
  type SchemeDefinition,
} from '@assistigo/core';
import {
  buildDocumentChecklist,
  type ChecklistDocument,
  type ChecklistRequirement,
  requirementsFromScheme,
} from '@assistigo/form-engine/requirement-checklist';

import { localDateParts, toIsoDate } from '../profile/date-of-birth';
import type { ScanPreset } from '../scan/presets';
import type { VaultDocument } from '../vault/vault-index';

export const CHECKLIST_GROUPS = ['core', 'education', 'certificates', 'other'] as const;
export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number];

/**
 * The documents forms ask for most. Only `core` counts towards "3 of 5 ready": the others depend
 * on the person and the form. A bank passbook belongs here too, once it is a document type.
 */
export const CHECKLIST_TYPES: Readonly<Record<ChecklistGroup, readonly DocumentType[]>> = {
  core: ['aadhaar_like', 'photo', 'signature', 'marksheet_10', 'pan'],
  education: ['marksheet_12', 'marksheet_graduation'],
  certificates: ['residence_certificate', 'income_certificate', 'caste_certificate'],
  other: ['voter_id'],
};

export type DocumentChecklistState =
  | 'ready'
  | 'missing'
  /** In the vault, but past the expiry date the citizen set. */
  | 'expired'
  /** No document type says "this is it" (a bank passbook, a ration card). */
  | 'check_manually';

export type DocumentChecklistItem = {
  readonly key: string;
  readonly state: DocumentChecklistState;
  /** What it is filed as when added; null when the vault has no type for it. */
  readonly type: DocumentType | null;
  /** The document that meets it, or the expired one. */
  readonly documentId: string | null;
  /** The form's own name for it. Absent for a plain document type, named by its type. */
  readonly label?: { readonly en: string; readonly hi?: string };
};

type VaultEntry = Pick<VaultDocument, 'id' | 'createdAt' | 'documentType' | 'expiresOn'>;

/** Valid through its expiry date, in the phone's time zone. */
function isExpired(document: VaultEntry, today: string): boolean {
  return document.expiresOn !== undefined && document.expiresOn < today;
}

/**
 * The vault in the shared checklist's terms. A photo or signature there was filed as one, so
 * every document counts as `stored`.
 */
function toChecklistDocuments(documents: readonly VaultEntry[]): ChecklistDocument[] {
  return documents.flatMap((document) =>
    document.documentType
      ? [
          {
            id: document.id,
            documentType: document.documentType,
            status: 'stored',
            createdAt: document.createdAt,
          },
        ]
      : [],
  );
}

function buildItems(
  requirements: readonly ChecklistRequirement[],
  documents: readonly VaultEntry[],
  now: Date,
): DocumentChecklistItem[] {
  const today = toIsoDate(localDateParts(now));
  const check = (entries: readonly VaultEntry[]) =>
    buildDocumentChecklist({
      requirements,
      documents: toChecklistDocuments(entries),
      derivatives: [],
    });
  const valid = check(documents.filter((document) => !isExpired(document, today)));
  const any = check(documents);

  return valid.map((item, index): DocumentChecklistItem => {
    const { key, acceptedTypes } = item.requirement;
    const base = { key, type: acceptedTypes[0] ?? null };
    if (item.state === 'ready') return { ...base, state: 'ready', documentId: item.documentId };
    if (item.state === 'check_manually') {
      return { ...base, state: 'check_manually', documentId: null };
    }
    const expired = any[index];
    return expired?.state === 'ready'
      ? { ...base, state: 'expired', documentId: expired.documentId }
      : { ...base, state: 'missing', documentId: null };
  });
}

function typeRequirement(type: DocumentType): ChecklistRequirement {
  return {
    key: type,
    label: { en: type },
    required: true,
    presetCode: null,
    acceptedTypes: [type],
  };
}

export function groupChecklist(
  group: ChecklistGroup,
  documents: readonly VaultEntry[],
  now: Date,
): DocumentChecklistItem[] {
  return buildItems(CHECKLIST_TYPES[group].map(typeRequirement), documents, now);
}

export function coreChecklist(
  documents: readonly VaultEntry[],
  now: Date,
): DocumentChecklistItem[] {
  return groupChecklist('core', documents, now);
}

/** What `scheme` asks for, in the order its form lists it. */
export function formChecklist(
  scheme: SchemeDefinition,
  documents: readonly VaultEntry[],
  now: Date,
): DocumentChecklistItem[] {
  const requirements = requirementsFromScheme(scheme.eligibility.requiredDocuments ?? []);
  return buildItems(requirements, documents, now).map((item, index) => {
    const label = requirements[index]?.label;
    return label ? { ...item, label } : item;
  });
}

export type ChecklistProgress = { readonly ready: number; readonly total: number };

export function checklistProgress(items: readonly DocumentChecklistItem[]): ChecklistProgress {
  return { ready: items.filter((item) => item.state === 'ready').length, total: items.length };
}

// ---- Forms -----------------------------------------------------------------------------------

export type FormGroup = {
  readonly category: SchemeCategory;
  readonly schemes: readonly SchemeDefinition[];
};

/** The forms a checklist can be made for, by category; one that lists no documents is left out. */
export function formGroups(schemes: readonly SchemeDefinition[] = BUILT_IN_SCHEMES): FormGroup[] {
  return SCHEME_CATEGORIES.map((category) => ({
    category,
    schemes: schemes.filter(
      (scheme) =>
        scheme.category === category && (scheme.eligibility.requiredDocuments ?? []).length > 0,
    ),
  })).filter((group) => group.schemes.length > 0);
}

/** The form a route param names, if there is one. */
export function formBySlug(slug: unknown): SchemeDefinition | null {
  return typeof slug === 'string' ? (getBuiltInScheme(slug) ?? null) : null;
}

// ---- Adding a document -----------------------------------------------------------------------

const ID_CARD_TYPES: readonly DocumentType[] = ['aadhaar_like', 'pan', 'voter_id'];

export type AddMethod = 'scan_card' | 'scan' | 'photo' | 'upload';

/**
 * How a document can be added. A card is also offered as a plain scan, for the paper Aadhaar
 * letter: the card layout would shrink an A4 page to the size of a card.
 */
export function addMethods(type: DocumentType | null): readonly AddMethod[] {
  if (type === 'photo') return ['photo', 'upload'];
  if (type !== null && ID_CARD_TYPES.includes(type)) return ['scan_card', 'scan', 'upload'];
  return ['scan', 'upload'];
}

/** The scanner preset a method uses. An uploaded ID is often a full-page PDF: a plain document. */
export function presetFor(type: DocumentType | null, method: AddMethod): ScanPreset {
  if (type === 'photo' || type === 'signature') return type;
  return method === 'scan_card' ? 'id_card' : 'document';
}
