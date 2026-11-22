/**
 * Single-PDF bundles: several of a customer's stored documents, in a fixed order, as one PDF
 * under a size limit.
 * Master spec §13.2 — "Merge PDFs/images", "Compress PDF", "Generate portal-ready derivative".
 *
 * Some upload boxes take one file for several documents ("ID proof, residence and caste
 * certificate in a single PDF"). Without a tool the operator downloads each file, merges them in
 * one website and compresses the result in another. A bundle does all of that in the browser
 * from what is already in the customer's file.
 *
 * Templates are *document sets*, not portal rules. No portal notice we could check states a
 * combined-PDF order and size (the National Scholarship Portal explicitly rejects combined
 * files; see `nsp.document_pdf`), so naming a portal here would put a number in front of an
 * operator that nobody published. The set and the target KB are starting points. The operator
 * reads the portal's own upload box and changes either.
 *
 * Pure: no canvas, no PDF library. The browser half is `buildPdfBundle` in `browser/pdf.ts`.
 */

import type { DocumentType } from '@assistigo/core';

const KB = 1024;

export type BundleTemplate = {
  /** Stable slug, recorded in the recipe as a step detail (never as a preset code). */
  code: `bundle.${string}`;
  label: string;
  labelHi: string;
  /** Document types in the order they appear in the PDF. */
  documentTypes: readonly DocumentType[];
  /** Starting target. Always operator-editable. */
  maxBytes: number;
};

export const BUNDLE_TEMPLATES: readonly BundleTemplate[] = [
  {
    code: 'bundle.id_residence_caste_10th',
    label: 'ID + residence + caste + Class 10',
    labelHi: 'पहचान + निवास + जाति + कक्षा 10',
    documentTypes: ['aadhaar_like', 'residence_certificate', 'caste_certificate', 'marksheet_10'],
    maxBytes: 500 * KB,
  },
  {
    code: 'bundle.scholarship_set',
    label: 'ID + income + caste + last marksheet',
    labelHi: 'पहचान + आय + जाति + पिछला अंकपत्र',
    documentTypes: ['aadhaar_like', 'income_certificate', 'caste_certificate', 'marksheet_12'],
    maxBytes: 500 * KB,
  },
  {
    code: 'bundle.certificates',
    label: 'Caste + income + residence certificates',
    labelHi: 'जाति + आय + निवास प्रमाण पत्र',
    documentTypes: ['caste_certificate', 'income_certificate', 'residence_certificate'],
    maxBytes: 300 * KB,
  },
  {
    code: 'bundle.education',
    label: 'Class 10 + Class 12 + graduation marksheets',
    labelHi: 'कक्षा 10 + कक्षा 12 + स्नातक अंकपत्र',
    documentTypes: ['marksheet_10', 'marksheet_12', 'marksheet_graduation'],
    maxBytes: 500 * KB,
  },
];

/** Size limits upload boxes commonly state for a combined file. Quick picks, not presets. */
export const BUNDLE_SIZE_CHOICES_KB = [100, 200, 300, 500, 1024] as const;

/** Document types that can sit in a bundle. A photo or signature has its own upload box. */
export const BUNDLE_DOCUMENT_TYPES: readonly DocumentType[] = [
  'aadhaar_like',
  'pan',
  'voter_id',
  'residence_certificate',
  'caste_certificate',
  'income_certificate',
  'marksheet_10',
  'marksheet_12',
  'marksheet_graduation',
  'receipt',
  'application_pdf',
  'generic',
  'unknown',
];

export const BUNDLEABLE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function isBundleableMime(mimeType: string | null | undefined): boolean {
  return (BUNDLEABLE_MIME_TYPES as readonly string[]).includes(mimeType ?? '');
}

export function findBundleTemplate(code: string): BundleTemplate | null {
  return BUNDLE_TEMPLATES.find((template) => template.code === code) ?? null;
}

/** A stored document as the bundle editor sees it: metadata only, never bytes or values. */
export type BundleCandidate = {
  id: string;
  documentType: DocumentType;
  mimeType: string;
  status: string;
  /** ISO timestamp. */
  createdAt: string;
};

export type BundleSlotMatch = {
  documentType: DocumentType;
  /** The document chosen for this slot, or null when the customer has none on file. */
  documentId: string | null;
};

/** An operator-checked document beats an unchecked one; a failed read is still a usable file. */
const STATUS_RANK: Record<string, number> = { verified: 0, extracted: 1, stored: 1 };

function rank(candidate: BundleCandidate): number {
  return STATUS_RANK[candidate.status] ?? 2;
}

/**
 * Picks a document for each slot of a set.
 *
 * Per slot: a document of that type, verified before unverified, newest first. A document fills
 * at most one slot, so a set that lists the same type twice gets two different files, or a gap
 * rather than the same certificate twice.
 */
export function matchBundleSlots(
  documentTypes: readonly DocumentType[],
  candidates: readonly BundleCandidate[],
): BundleSlotMatch[] {
  const used = new Set<string>();
  const usable = candidates
    .filter((candidate) => isBundleableMime(candidate.mimeType) && candidate.status !== 'deleted')
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));

  return documentTypes.map((documentType) => {
    const pick = usable.find(
      (candidate) => candidate.documentType === documentType && !used.has(candidate.id),
    );
    if (pick) used.add(pick.id);
    return { documentType, documentId: pick?.id ?? null };
  });
}

/**
 * Which target an output is judged against. Zero, blank or negative means no limit; anything
 * else is clamped to what a derivative may hold.
 */
export function bundleTargetBytes(maxKb: number | '' | null | undefined, cap: number): number | null {
  if (typeof maxKb !== 'number' || !Number.isFinite(maxKb) || maxKb <= 0) return null;
  return Math.min(Math.round(maxKb * KB), cap);
}
