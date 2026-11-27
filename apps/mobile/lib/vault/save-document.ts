/**
 * Pure rules for the Save Document screen, shown after scan review: which document types it
 * offers, how the folder follows the type, tag clean-up, the expiry date and when its reminder
 * fires, the "Document scanned" status card, whether the document is shared with centres or
 * stays on this phone, and turning the form into the details the vault stores.
 *
 * The name, tags and expiry date are the citizen's own data. Nothing here logs or persists
 * them; `vault-storage.ts` seals them into the encrypted index.
 */

import { type DocumentType, keepsOnPhoneByDefault } from '@assistigo/core';

import type { PageStatus } from '../scan/capture-session';
import { localDateParts, parseIsoDate, toIsoDate } from '../profile/date-of-birth';
import { categoryOf, documentTypesIn, VAULT_CATEGORIES, type VaultCategoryKey } from './categories';
import {
  type DateMeaning,
  DEFAULT_LEAD_DAYS,
  EVERYDAY_DOCUMENT_TYPE,
  EVERYDAY_KINDS,
  type EverydayKind,
  everydayKindLabelKey,
  isEverydayKind,
  reminderRuleFor,
} from './everyday';
import { type DocumentDetails, MAX_TAG_LENGTH, MAX_TAGS, MAX_TITLE_LENGTH } from './vault-index';

/**
 * The types the picker offers, in vault order: everything that has a vault folder, then
 * "Other". Receipts and application PDFs are operator-side, and `unknown` is not a choice.
 */
export const SAVE_DOCUMENT_TYPES: readonly DocumentType[] = [
  ...VAULT_CATEGORIES.flatMap((category) => documentTypesIn(category)),
  'generic',
];

/** Translation key for a document type's name: `documentTypes.<type>`. */
export function documentTypeLabelKey(type: DocumentType): string {
  return `documentTypes.${type}`;
}

/**
 * One row of the type picker: a core type, or an everyday paper (a bill, a bike's PUC). The two
 * vocabularies never share a name, so one string tells them apart.
 */
export type TypeChoice = DocumentType | EverydayKind;

/** The picker's rows: form documents first, then everyday papers, then "Other". */
export const SAVE_TYPE_CHOICES: readonly TypeChoice[] = [
  ...SAVE_DOCUMENT_TYPES.filter((type) => type !== 'generic'),
  ...EVERYDAY_KINDS,
  'generic',
];

/** What the vault stores for a picked row: an everyday paper is an "Other" document. */
export function resolveTypeChoice(choice: TypeChoice): {
  readonly documentType: DocumentType;
  readonly everydayKind: EverydayKind | null;
} {
  return isEverydayKind(choice)
    ? { documentType: EVERYDAY_DOCUMENT_TYPE, everydayKind: choice }
    : { documentType: choice, everydayKind: null };
}

/** The row a saved document's type and kind show as. */
export function typeChoiceOf(
  documentType: DocumentType | null,
  everydayKind: EverydayKind | null | undefined,
): TypeChoice | null {
  return everydayKind ?? documentType;
}

/** Translation key for a picker row's name. */
export function typeChoiceLabelKey(choice: TypeChoice): string {
  return isEverydayKind(choice) ? everydayKindLabelKey(choice) : documentTypeLabelKey(choice);
}

/** How far ahead an expiry date may be, in whole years after this one. */
export const MAX_EXPIRY_YEARS = 30;

/**
 * Days before expiry the reminder tries, earliest first, for a document with no rule of its own.
 * Everyday papers and certificates have their own (`reminderRuleFor` in `everyday.ts`).
 */
export const REMINDER_LEAD_DAYS = DEFAULT_LEAD_DAYS;

/** Local hour the reminder fires at, so it never arrives in the night. */
export const REMINDER_HOUR = 9;

// ---- Name and tags --------------------------------------------------------------------------

/** Trimmed, with runs of spaces collapsed, cut to the stored limit. */
export function normaliseTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH).trim();
}

/** A tag as stored: no leading `#`, spaces collapsed, cut to the limit. Null when empty. */
export function normaliseTag(raw: string): string | null {
  const tag = raw
    .replace(/^[\s#]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
  return tag.length > 0 ? tag : null;
}

export type AddTagResult =
  | { readonly kind: 'added'; readonly tags: readonly string[] }
  | { readonly kind: 'empty' | 'duplicate' | 'full' };

/** Adds a tag unless it is empty, already there (ignoring case), or the list is full. */
export function addTag(tags: readonly string[], raw: string): AddTagResult {
  const tag = normaliseTag(raw);
  if (tag === null) return { kind: 'empty' };
  const needle = tag.toLocaleLowerCase();
  if (tags.some((existing) => existing.toLocaleLowerCase() === needle)) {
    return { kind: 'duplicate' };
  }
  if (tags.length >= MAX_TAGS) return { kind: 'full' };
  return { kind: 'added', tags: [...tags, tag] };
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((existing) => existing !== tag);
}

// ---- Type and folder ------------------------------------------------------------------------

/**
 * The name after the type changes. A name the citizen typed stays. An empty name, or one that
 * is still the previous type's label, becomes the new type's label.
 */
export function titleAfterTypeChange(
  title: string,
  previousTypeLabel: string | null,
  nextTypeLabel: string,
): string {
  const current = normaliseTitle(title);
  return current.length === 0 || current === previousTypeLabel ? nextTypeLabel : title;
}

/**
 * The folder after the type changes. A folder the citizen picked stays; otherwise it follows
 * the type (Aadhaar goes to Identity), and "Other" leaves it unset.
 */
export function categoryAfterTypeChange(
  category: VaultCategoryKey | null,
  chosenByCitizen: boolean,
  type: DocumentType,
): VaultCategoryKey | null {
  return chosenByCitizen ? category : categoryOf(type);
}

// ---- Sharing --------------------------------------------------------------------------------

/**
 * Whether the document stays on this phone (design §15). `choice` is the citizen's own, from the
 * switch; null until they touch it, so the answer follows the type and folder: Aadhaar is ready
 * for centres, "Other" stays here. Most people never touch it.
 */
export function phoneOnlyFor(
  choice: boolean | null,
  type: DocumentType | null,
  category: VaultCategoryKey | null,
): boolean {
  return choice ?? keepsOnPhoneByDefault(type, category);
}

// ---- Expiry and reminder --------------------------------------------------------------------

export type ExpiryStatus = 'valid' | 'invalid' | 'not_future' | 'too_far';

/** An expiry date must be a real date after today and within `MAX_EXPIRY_YEARS`. */
export function expiryStatus(value: string, now: Date): ExpiryStatus {
  const parts = parseIsoDate(value);
  if (!parts) return 'invalid';
  const today = localDateParts(now);
  // Zero-padded ISO dates order correctly as plain strings.
  if (toIsoDate(parts) <= toIsoDate(today)) return 'not_future';
  if (parts.year > today.year + MAX_EXPIRY_YEARS) return 'too_far';
  return 'valid';
}

/** Expiry years the picker offers, this year first. */
export function expiryYearOptions(now: Date): number[] {
  const current = now.getFullYear();
  return Array.from({ length: MAX_EXPIRY_YEARS + 1 }, (_, index) => current + index);
}

/**
 * When the reminder fires, in local time: `leadDays[0]` days before the date at 9:00 (30 by
 * default), or the next of the later lead days that is still ahead (7 days, 1 day, the day
 * itself). Null when the date is not a valid expiry.
 */
export function reminderTime(
  expiresOn: string,
  now: Date,
  leadDays: readonly number[] = REMINDER_LEAD_DAYS,
): Date | null {
  if (expiryStatus(expiresOn, now) !== 'valid') return null;
  const parts = parseIsoDate(expiresOn);
  if (!parts) return null;

  for (const lead of leadDays) {
    // `Date` rolls a negative day back into the previous month.
    const at = new Date(parts.year, parts.month - 1, parts.day - lead, REMINDER_HOUR, 0, 0, 0);
    if (at.getTime() > now.getTime()) return at;
  }
  return null;
}

/** When one document's reminder fires and how its notification reads its date. */
export type ReminderPlan = {
  readonly at: Date;
  readonly expiresOn: string;
  readonly dateMeaning: DateMeaning;
};

/** The reminder a saved document should have now, by its kind's rule; null when none. */
export function reminderPlanFor(
  document: {
    readonly expiresOn?: string | undefined;
    readonly everydayKind?: EverydayKind | undefined;
    readonly documentType?: DocumentType | undefined;
  },
  now: Date,
): ReminderPlan | null {
  if (!document.expiresOn) return null;
  const rule = reminderRuleFor(document);
  const at = reminderTime(document.expiresOn, now, rule.leadDays);
  return at ? { at, expiresOn: document.expiresOn, dateMeaning: rule.dateMeaning } : null;
}

// ---- Scan status ----------------------------------------------------------------------------

/**
 * What the status card says about the scan. `clear`: every page processed and its edges found.
 * `uncropped`: processed, but some page kept the whole photo. It makes no claim about
 * legibility, which nothing on the phone measures yet.
 */
export type ScanStatus = 'processing' | 'clear' | 'uncropped' | 'failed';

export type ScanStatusPage = {
  readonly status: PageStatus;
  readonly analysis: { readonly detected: boolean } | null;
};

export function scanStatus(pages: readonly ScanStatusPage[]): ScanStatus {
  if (pages.some((page) => page.status === 'failed')) return 'failed';
  if (pages.length === 0 || pages.some((page) => page.status !== 'ready')) return 'processing';
  return pages.every((page) => page.analysis?.detected === true) ? 'clear' : 'uncropped';
}

// ---- Form -----------------------------------------------------------------------------------

export type SaveDocumentForm = {
  readonly title: string;
  readonly documentType: DocumentType | null;
  /** An everyday paper's kind; only kept with the "Other" type it is stored as. */
  readonly everydayKind?: EverydayKind | null;
  readonly category: VaultCategoryKey | null;
  readonly tags: readonly string[];
  /** Null while the reminder is off. */
  readonly expiresOn: string | null;
  /** The citizen's "only on this phone" choice; null follows the type (`phoneOnlyFor`). */
  readonly phoneOnly: boolean | null;
  /** The family member it is saved for; absent or null for the citizen's own. */
  readonly memberId?: string | null;
};

export type SaveDocumentErrors = {
  title?: 'required';
  documentType?: 'required';
  expiresOn?: Exclude<ExpiryStatus, 'valid'>;
};

export type SaveDocumentValidation =
  | { readonly ok: true; readonly details: DocumentDetails }
  | { readonly ok: false; readonly errors: Readonly<SaveDocumentErrors> };

/** Checks the form and returns the details to seal, without a reminder id yet. */
export function validateSaveDocument(form: SaveDocumentForm, now: Date): SaveDocumentValidation {
  const title = normaliseTitle(form.title);
  const expiry = form.expiresOn === null ? null : expiryStatus(form.expiresOn, now);

  const errors: SaveDocumentErrors = {};
  if (title.length === 0) errors.title = 'required';
  if (form.documentType === null) errors.documentType = 'required';
  if (expiry !== null && expiry !== 'valid') errors.expiresOn = expiry;

  if (Object.keys(errors).length > 0 || form.documentType === null) return { ok: false, errors };

  const tags = form.tags.flatMap((tag) => normaliseTag(tag) ?? []).slice(0, MAX_TAGS);
  const kind =
    form.everydayKind && form.documentType === EVERYDAY_DOCUMENT_TYPE
      ? { everydayKind: form.everydayKind }
      : {};
  // A family member's document always stays on this phone (lib/family/family.ts).
  if (form.memberId) {
    return {
      ok: true,
      details: {
        title,
        documentType: form.documentType,
        ...kind,
        ...(form.category === null ? {} : { category: form.category }),
        ...(tags.length === 0 ? {} : { tags }),
        ...(form.expiresOn === null ? {} : { expiresOn: form.expiresOn }),
        phoneOnly: true,
        memberId: form.memberId,
      },
    };
  }
  return {
    ok: true,
    details: {
      title,
      documentType: form.documentType,
      ...kind,
      ...(form.category === null ? {} : { category: form.category }),
      ...(tags.length === 0 ? {} : { tags }),
      ...(form.expiresOn === null ? {} : { expiresOn: form.expiresOn }),
      phoneOnly: phoneOnlyFor(form.phoneOnly, form.documentType, form.category),
      ...(form.phoneOnly === null ? {} : { phoneOnlyChosen: true }),
    },
  };
}
