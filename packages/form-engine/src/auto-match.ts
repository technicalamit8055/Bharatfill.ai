/**
 * Pre-selecting a customer file for an upload box, when the choice is not a judgement call.
 * Master spec §7.4.5 ("Suggested customer document"); docs/EXTENSION.md §6e.
 *
 * `POST /api/forms/map` already ranks up to five of the customer's files per upload box. This
 * module decides when the top of that list is unambiguous enough to tick on the operator's
 * behalf, so a page whose boxes all have one obvious file needs one press of Fill, not one tick
 * per box first. It never attaches anything itself: the pick lands in the side panel's review
 * list, visibly marked, and the operator can untick or swap it before Fill as with any other.
 *
 * Only two signals count, and only when exactly one accepted file carries the strongest one:
 *
 *   preset          a derivative Document Tools Studio prepared against this box's own preset —
 *                   built for exactly this portal's photo/signature/PDF rule.
 *   document_type   an original upload already classified as the exact document the box's label
 *                   names ("Caste certificate" box, one caste certificate on file).
 *
 * Everything weaker — same category only, an unclassified upload, a newest-first tiebreak — stays
 * a suggestion the operator ticks. So does any file the box's `accept` or its stated size window
 * would reject, and any file that would be the pick for two boxes at once.
 *
 * Pure and DOM-free like the rest of this package.
 */

import { resolveUploadTarget, type UploadTarget } from './constraints';
import { fileMatchesAccept } from './documents';
import type { DerivativeSuggestion, DetectedField, DocumentSuggestion } from './types';

export const AUTO_MATCH_REASONS = ['preset', 'document_type'] as const;
export type AutoMatchReason = (typeof AUTO_MATCH_REASONS)[number];

export const AUTO_MATCH_REASON_LABELS: Record<AutoMatchReason, { en: string; hi: string }> = {
  preset: {
    en: 'Prepared for this portal',
    hi: 'इसी पोर्टल के लिए तैयार',
  },
  document_type: {
    en: 'Same document type on file',
    hi: 'प्रोफ़ाइल पर यही दस्तावेज़',
  },
};

/** Where a file sits against an upload box's size window. */
export type UploadSizeStatus = 'fits' | 'too_small' | 'too_large' | 'unstated';

export const UPLOAD_SIZE_STATUS_LABELS: Record<UploadSizeStatus, { en: string; hi: string }> = {
  fits: { en: 'Size fits', hi: 'साइज़ सही है' },
  too_small: { en: 'Below the minimum size', hi: 'न्यूनतम साइज़ से कम' },
  too_large: { en: 'Over the size limit', hi: 'साइज़ सीमा से ज़्यादा' },
  unstated: { en: 'No size limit stated', hi: 'साइज़ सीमा नहीं बताई गई' },
};

export function checkUploadSize(
  sizeBytes: number,
  target: Pick<UploadTarget, 'minBytes' | 'maxBytes'>,
): UploadSizeStatus {
  if (target.minBytes === null && target.maxBytes === null) return 'unstated';
  if (target.maxBytes !== null && sizeBytes > target.maxBytes) return 'too_large';
  if (target.minBytes !== null && sizeBytes < target.minBytes) return 'too_small';
  return 'fits';
}

export type AutoMatch = {
  signature: string;
  file: DerivativeSuggestion;
  reason: AutoMatchReason;
  size: UploadSizeStatus;
};

type AutoMatchField = Pick<
  DetectedField,
  'signature' | 'inputType' | 'accept' | 'uploadConstraints' | 'visible'
>;

/** Exactly one element, or nothing — two equally strong candidates are a choice, not a match. */
function only<T>(items: readonly T[]): T | null {
  return items.length === 1 ? (items[0] ?? null) : null;
}

/**
 * The one file to pre-select for a single upload box, or `null` to leave it for the operator.
 *
 * A tier with two candidates stops the search rather than falling through to the next tier: two
 * files prepared for this exact preset is a sign the operator has been redoing one, and quietly
 * picking a weaker match instead would hide that choice behind a confident-looking default.
 */
export function pickAutoMatch(
  suggestion: DocumentSuggestion,
  field: AutoMatchField,
): AutoMatch | null {
  if (field.inputType.toLowerCase() !== 'file' || field.visible === false) return null;

  const target = resolveUploadTarget(field, suggestion.preset);
  const usable = suggestion.suggestions.filter((file) => {
    if (!fileMatchesAccept(target.accept, file)) return false;
    const size = checkUploadSize(file.sizeBytes, target);
    return size === 'fits' || size === 'unstated';
  });

  const presetMatches = usable.filter((file) => file.kind === 'derivative' && file.matchesPreset);
  if (presetMatches.length > 1) return null;
  let file = only(presetMatches);
  let reason: AutoMatchReason = 'preset';

  if (!file && suggestion.documentType) {
    file = only(
      usable.filter(
        (candidate) =>
          candidate.kind === 'source_document' &&
          candidate.documentType === suggestion.documentType,
      ),
    );
    reason = 'document_type';
  }

  if (!file) return null;
  return {
    signature: suggestion.signature,
    file,
    reason,
    size: checkUploadSize(file.sizeBytes, target),
  };
}

/**
 * Pre-selections for every upload box on the page, from the latest detection.
 *
 * A box the detection no longer reports gets nothing — the signature could not be attached to.
 * And when one file would be the pick for two boxes (two "Photograph" boxes, one prepared photo),
 * neither is pre-selected: which box the portal really wants it in is the operator's call.
 */
export function pickAutoMatches(
  suggestions: readonly DocumentSuggestion[],
  fields: readonly AutoMatchField[],
): AutoMatch[] {
  const fieldBySignature = new Map(fields.map((field) => [field.signature, field]));
  const picks: AutoMatch[] = [];
  for (const suggestion of suggestions) {
    const field = fieldBySignature.get(suggestion.signature);
    if (!field) continue;
    const pick = pickAutoMatch(suggestion, field);
    if (pick) picks.push(pick);
  }

  const uses = new Map<string, number>();
  for (const pick of picks) uses.set(pick.file.id, (uses.get(pick.file.id) ?? 0) + 1);
  return picks.filter((pick) => uses.get(pick.file.id) === 1);
}
