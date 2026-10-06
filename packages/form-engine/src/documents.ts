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
import type { DetectedField, DocumentCategory, SlotDocumentType } from './types';

/** The coarse bucket — and so the Document Tools tool — a specific slot type belongs to. */
export function documentCategoryForType(type: SlotDocumentType): DocumentCategory {
  if (type === 'photo' || type === 'signature') return type;
  return 'pdf';
}

/**
 * Words that name one specific document, tried in order against one piece of text.
 *
 * Signature before photo: "Photo & Signature Upload" names the signature box, and "signature" is
 * the more specific word in it. Photo before everything else, except where "photo" is an
 * adjective ("Photo ID proof", "photo copy of marksheet"). Class 12 before class 10, because
 * "senior secondary" contains "secondary". Certificates before identity cards, because a
 * certificate label sometimes says what it was issued against ("Residence certificate (Aadhaar
 * based)").
 */
const SLOT_TYPE_WORDS: readonly (readonly [SlotDocumentType, RegExp])[] = [
  ['signature', /sign(?:ature)?s?\b|hastak+shar|हस्ताक्षर|dastkhat/i],
  [
    'photo',
    /photo(?:graph)?s?\b(?!\s*(?:id\b|identity|copy|stat))|passport[\s-]?size|picture|फोटो|तस्वीर/i,
  ],
  ['marksheet_graduation', /graduat|\bdegree\b|स्नातक/i],
  [
    'marksheet_12',
    /(?:class|std|standard)\s*(?:12|xii)\b|\b(?:12|xii)(?:th)?\s*(?:class|std|standard|mark|pass|cert)|intermediate|(?:higher|senior)\s*secondary|इंटर|बारहवीं|12वीं/i,
  ],
  [
    'marksheet_10',
    /(?:class|std|standard)\s*(?:10|x)\b|\b(?:10|x)(?:th)?\s*(?:class|std|standard|mark|pass|cert)|matric|secondary\s*school|मैट्रिक|दसवीं|10वीं/i,
  ],
  ['caste_certificate', /\bcaste\b|\bjati\b|जाति/i],
  ['income_certificate', /\bincome\b|आय\s*प्रमाण/i],
  ['residence_certificate', /residen(?:ce|tial)\s*cert|domicile|\bniwas\b|निवास/i],
  ['pan', /\bpan\b|permanent\s*account|पैन/i],
  ['voter_id', /\bvoter|\bepic\b|electoral|मतदाता/i],
  ['aadhaar_like', /aadhaa?r|\buidai?\b|आधार/i],
  ['receipt', /receipt|रसीद/i],
];

/**
 * Words that say "a document goes here" without saying which one. A box labelled "Marksheet" or
 * "Address proof" is a pdf slot, but naming one type for it would be a guess — an address proof
 * can be an Aadhaar, a voter ID or a residence certificate.
 */
const GENERIC_DOCUMENT_WORDS =
  /\bpdf\b|marksheet|certificate|scan(?:ned)?\s*copy|document\s*upload|identity|id\s*proof|address\s*proof|residence|ration/i;

/**
 * Splits the identifiers portals write (`casteCertFile`, `upload_photo`, `doc-income`) into
 * words, so `\b` boundaries in the patterns above see them the way they see a label.
 */
function normalizeSlotText(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ');
}

type SlotClass = { category: DocumentCategory; documentType: SlotDocumentType | null };

function classifyText(text: string): SlotClass | null {
  const normalized = normalizeSlotText(text);
  for (const [type, words] of SLOT_TYPE_WORDS) {
    if (words.test(normalized)) return { category: documentCategoryForType(type), documentType: type };
  }
  if (GENERIC_DOCUMENT_WORDS.test(normalized)) return { category: 'pdf', documentType: null };
  return null;
}

type SlotTextField = Pick<
  DetectedField,
  'labelText' | 'ariaLabel' | 'placeholder' | 'name' | 'id' | 'nearbyText' | 'sectionHeading'
>;

/** The field's own text, strongest signal first. */
function slotSources(field: SlotTextField): { text: string; ownText: boolean }[] {
  const own = [field.labelText, field.ariaLabel, field.placeholder, field.name, field.id, field.nearbyText];
  return [
    ...own.map((text) => ({ text, ownText: true })),
    { text: field.sectionHeading, ownText: false },
  ].filter((source): source is { text: string; ownText: boolean } => Boolean(source.text));
}

function fieldText(field: SlotTextField): string {
  return slotSources(field)
    .map((source) => source.text)
    .join(' ');
}

/**
 * What one upload slot asks for: the coarse category, plus the specific document when the field
 * names one.
 *
 * Each source is classified on its own, strongest first, rather than all of them run together:
 * a box labelled "Photograph" under a "Photo & Signature" heading is the photo box, and a box
 * labelled "Caste certificate" under an "Upload documents" heading is the caste-certificate box.
 * The strongest source with any signal fixes the category. A weaker source can still name the
 * specific type within that category — a "Certificate" label in a table row that reads "Income"
 * — but never overrule it.
 *
 * The section heading can set the category, as it always could, but never the specific type: on
 * RTPS Bihar the heading over every upload box is the form's own title, "Income certificate
 * application", and the boxes under it want an Aadhaar and a photograph.
 */
function classifySlot(field: SlotTextField): SlotClass | null {
  let category: DocumentCategory | null = null;
  for (const source of slotSources(field)) {
    const hit = classifyText(source.text);
    if (!hit) continue;
    category ??= hit.category;
    if (
      source.ownText &&
      hit.documentType &&
      documentCategoryForType(hit.documentType) === category
    ) {
      return { category, documentType: hit.documentType };
    }
  }
  return category ? { category, documentType: null } : null;
}

/**
 * What this upload slot asks for. Returns `null` for a non-file field, and also for a file field
 * with no usable signal at all — an upload box with no label, no `accept` and no adapter
 * requirement match is exactly the shape of a portal's hidden/internal file input (RTPS Bihar's
 * representative-authorization and internal-uploader widgets), and guessing `pdf` for it
 * produced a phantom document-attachment card offering unrelated customer files.
 *
 * Text wins over `accept`: "Photo (JPG only)" with `accept="image/*"` is a photo, but a bare
 * `accept="image/*"` with no label at all is too weak a signal to promise a specific preset —
 * it is only used as a last resort to tell a photo from a pdf slot, and never names a type.
 */
export function inferFileFieldSlot(
  field: Pick<DetectedField, 'inputType' | 'accept'> & SlotTextField,
): SlotClass | null {
  if (field.inputType.toLowerCase() !== 'file') return null;

  const fromText = classifySlot(field);
  if (fromText) return fromText;

  const accept = field.accept?.toLowerCase() ?? '';
  if (accept.includes('pdf')) return { category: 'pdf', documentType: null };
  if (accept.includes('image')) return { category: 'photo', documentType: null };
  return null;
}

/** The coarse half of `inferFileFieldSlot`. */
export function inferFileFieldCategory(
  field: Pick<DetectedField, 'inputType' | 'accept'> & SlotTextField,
): DocumentCategory | null {
  return inferFileFieldSlot(field)?.category ?? null;
}

/** How an adapter's requirement entry reads: its label first, its key when the label is silent. */
function classifyRequirement(requirement: DocumentRequirement): SlotClass | null {
  return classifyText(requirement.label) ?? classifyText(requirement.key);
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
  /** The specific document the slot names, when it names one. */
  documentType: SlotDocumentType | null;
  /** The adapter's own requirement entry, when one could be picked out. */
  requirement: DocumentRequirement | null;
};

/**
 * For every detected file field, infer what it asks for and — when the resolved portal adapter
 * lists `documentRequirements` — pick the one requirement that best matches it.
 *
 * There is no selector on a `documentRequirement` (unlike `AdapterField`): a portal notice lists
 * "Photograph" and "Signature" as upload slots, not CSS. So the match is: prefer requirements
 * naming the same specific document, then those in the same category, then break ties (or fall
 * back, if none did) by text overlap against the field's own label/nearby text. A narrowed pool
 * of exactly one is trusted outright — two upload boxes are rarely both "caste certificate", and
 * two pdf requirements ("Caste certificate", "Income certificate") are now told apart by type
 * even when the box's own label shares no word with either.
 *
 * A field the operator cannot see is skipped outright, regardless of category: a portal's hidden
 * representative-authorization or internal-uploader file input is not something the operator can
 * attach anything to, so offering it a document suggestion is a phantom card, not a helpful one.
 */
export function matchDocumentRequirements(
  fields: readonly DetectedField[],
  adapter: PortalAdapter | null | undefined,
): DocumentFieldMatch[] {
  const requirements = adapter?.documentRequirements ?? [];
  const matches: DocumentFieldMatch[] = [];

  for (const field of fields) {
    if (field.visible === false) continue;

    const slot = inferFileFieldSlot(field);
    if (!slot) continue;
    const { category, documentType } = slot;

    const classified = requirements.map(
      (requirement) => [requirement, classifyRequirement(requirement)] as const,
    );
    const sameType = documentType
      ? classified.filter(([, cls]) => cls?.documentType === documentType).map(([r]) => r)
      : [];
    const sameCategory = classified.filter(([, cls]) => cls?.category === category).map(([r]) => r);
    const narrowed = sameType.length > 0 ? sameType : sameCategory;
    const pool = narrowed.length > 0 ? narrowed : requirements;

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
    // No textual overlap, but exactly one requirement already narrowed by type or category —
    // still a confident pick.
    if (!best && narrowed.length === 1) best = narrowed[0] ?? null;

    matches.push({ signature: field.signature, category, documentType, requirement: best });
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
