/**
 * Document attachment helper.
 * Master spec §7.4.5, §13.3; docs/EXTENSION.md.
 *
 * A detected `<input type="file">` cannot be filled — a page never lets script set `.files`
 * outside a user gesture — so `proposeMappings` in mapper.ts always skips it with
 * `unsupported_type`. What this module does instead: work out *what kind* of file the field
 * wants and, when the resolved portal adapter says so, *which* of its `documentRequirements`
 * this is, so the caller can offer a matching prepared file and a shortcut into Document Tools
 * Studio.
 *
 * Pure and DOM-free like the rest of this package: it only reads the metadata `detectFields`
 * already collected, never page content.
 */

import type { DocumentRequirement, PortalAdapter } from './adapters';
import type { DetectedField, DocumentCategory } from './types';

const CATEGORY_WORDS: Record<DocumentCategory, RegExp> = {
  // Checked before "photo": a signature upload box is often labelled "Photo & Signature" as a
  // section heading, and the word "signature" is the more specific signal in that text.
  signature: /sign(?:ature)?s?\b|hastak+shar|हस्ताक्षर|dastkhat/i,
  photo: /photo(?:graph)?s?\b|passport[\s-]?size|picture|फोटो|तस्वीर/i,
  pdf: /\bpdf\b|marksheet|certificate|scan(?:ned)?\s*copy|document\s*upload/i,
};

function fieldText(
  field: Pick<DetectedField, 'labelText' | 'ariaLabel' | 'placeholder' | 'name' | 'id' | 'nearbyText' | 'sectionHeading'>,
): string {
  return [
    field.labelText,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.id,
    field.nearbyText,
    field.sectionHeading,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

/** Signature checked before photo: "Photo & Signature Upload" should not read as a photo field. */
const CATEGORY_PRIORITY: readonly DocumentCategory[] = ['signature', 'photo', 'pdf'];

function categoryFromText(text: string): DocumentCategory | null {
  for (const category of CATEGORY_PRIORITY) {
    if (CATEGORY_WORDS[category].test(text)) return category;
  }
  return null;
}

/**
 * What kind of upload slot this file field is, or `null` when neither the surrounding text nor
 * the `accept` attribute says anything the product has a tool for.
 *
 * Text wins over `accept`: "Photo (JPG only)" with `accept="image/*"` is a photo, but a bare
 * `accept="image/*"` with no label at all is too weak a signal to promise a specific preset —
 * it is only used as a last resort to tell a photo from a signature scan.
 */
export function inferFileFieldCategory(
  field: Pick<
    DetectedField,
    'inputType' | 'labelText' | 'ariaLabel' | 'placeholder' | 'name' | 'id' | 'nearbyText' | 'sectionHeading' | 'accept'
  >,
): DocumentCategory | null {
  if (field.inputType.toLowerCase() !== 'file') return null;

  const fromText = categoryFromText(fieldText(field));
  if (fromText) return fromText;

  const accept = field.accept?.toLowerCase() ?? '';
  if (accept.includes('pdf')) return 'pdf';
  if (accept.includes('image')) return 'photo';
  return null;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\p{Script=Devanagari}]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-overlap similarity, 0–1. Good enough to rank a handful of short portal-written labels. */
function overlapScore(a: string, b: string): number {
  const aWords = new Set(normalizeWords(a));
  const bWords = new Set(normalizeWords(b));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let hits = 0;
  for (const word of aWords) if (bWords.has(word)) hits += 1;
  return hits / Math.max(aWords.size, bWords.size);
}

/** A detected file field, resolved as far as adapter data alone can take it. */
export type DocumentFieldMatch = {
  signature: string;
  category: DocumentCategory;
  /** The adapter's own requirement entry, when one could be picked out. */
  requirement: DocumentRequirement | null;
};

/**
 * For every detected file field, infer its category and — when the resolved portal adapter
 * lists `documentRequirements` — pick the one requirement that best matches it.
 *
 * There is no selector on a `documentRequirement` (unlike `AdapterField`): a portal notice lists
 * "Photograph" and "Signature" as upload slots, not CSS. So the match is: prefer requirements
 * whose own label falls in the same category, then break ties (or fall back, if none did) by
 * text overlap against the field's own label/nearby text. A category match with only one
 * candidate is trusted outright — two upload boxes are rarely both "photo".
 */
export function matchDocumentRequirements(
  fields: readonly DetectedField[],
  adapter: PortalAdapter | null | undefined,
): DocumentFieldMatch[] {
  const requirements = adapter?.documentRequirements ?? [];
  const matches: DocumentFieldMatch[] = [];

  for (const field of fields) {
    const category = inferFileFieldCategory(field);
    if (!category) continue;

    const sameCategory = requirements.filter(
      (requirement) => categoryFromText(requirement.label) === category,
    );
    const pool = sameCategory.length > 0 ? sameCategory : requirements;

    const text = fieldText(field);
    let best: DocumentRequirement | null = null;
    let bestScore = 0;
    for (const requirement of pool) {
      const score = overlapScore(text, requirement.label);
      if (score > bestScore) {
        bestScore = score;
        best = requirement;
      }
    }
    // No textual overlap, but exactly one requirement already narrowed by category — still a
    // confident pick.
    if (!best && sameCategory.length === 1) best = sameCategory[0] ?? null;

    matches.push({ signature: field.signature, category, requirement: best });
  }

  return matches;
}

/**
 * Whether a file would be accepted by an input's `accept` attribute.
 *
 * Implements the HTML spec's rules as far as they matter here: a bare `*` or an empty/absent
 * attribute accepts anything, `image/*` matches on the MIME type's top-level group, a full MIME
 * type matches exactly, and a `.ext` token matches the filename's extension case-insensitively.
 * An unparseable token is ignored rather than treated as a rejection — a portal that writes
 * `accept="jpg"` (no dot, not a MIME type) means to accept JPEGs, and refusing to attach because
 * of its typo would be the wrong call.
 *
 * This is advisory: the page's own validation still runs on what actually gets attached. It
 * exists so the panel can grey out a file the box would reject instead of attaching it and
 * letting the portal complain.
 */
export function fileMatchesAccept(
  accept: string | null | undefined,
  file: { filename: string; mimeType: string },
): boolean {
  const tokens = (accept ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.includes('*') || tokens.includes('*/*')) return true;

  const mime = file.mimeType.trim().toLowerCase();
  const group = mime.split('/')[0] ?? '';
  const extension = file.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';

  let sawUsableToken = false;
  for (const token of tokens) {
    if (token.startsWith('.')) {
      sawUsableToken = true;
      if (token === extension) return true;
      continue;
    }
    if (token.endsWith('/*')) {
      sawUsableToken = true;
      if (mime !== '' && group === token.slice(0, -2)) return true;
      continue;
    }
    if (token.includes('/')) {
      sawUsableToken = true;
      if (mime !== '' && token === mime) return true;
      continue;
    }
    // Not a MIME type and not a `.ext` token — a malformed entry, ignored.
  }

  // Every token was malformed: treat the attribute as saying nothing rather than as a wall.
  return !sawUsableToken;
}
