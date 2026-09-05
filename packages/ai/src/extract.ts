/**
 * Field extraction from OCR text.
 * Master spec §12.4, §12.5, §12.6; docs/AI_PIPELINE.md §4–§6.
 *
 * Rules-based, line-oriented, and deliberately conservative: a field is only produced when a
 * printed label matched, and every value is normalised through the same helpers the manual
 * entry path uses, so an extracted DOB and a typed DOB are the same shape by the time either
 * reaches the profile.
 *
 * Nothing here writes to a customer. Extraction proposes; a human accepts (§12.6).
 */

import {
  aadhaarFull,
  aadhaarLastFour,
  getCustomerField,
  isCustomerFieldKey,
  isForbiddenFieldKey,
  looksLikeAadhaar,
  normalizeMobile,
  normalizeName,
  normalizePan,
  normalizePincode,
  parseIndianDate,
  requiresReview,
  type CustomerFieldDataType,
  type DocumentType,
} from '@assistigo/core';
import { FIELDS_BY_DOCUMENT_TYPE, LABEL_RULES, type FieldDataKind, type LabelRule } from './rules';
import { sanitizeExtractedFields } from './safety';
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  type BoundingBox,
  type ExtractedField,
  type ExtractionWarning,
  type OcrBlock,
  type OcrResult,
  type ReviewReason,
  type StructuredExtractedField,
} from './types';

// ---------------------------------------------------------------------------
// Line splitting
// ---------------------------------------------------------------------------

type SourceLine = {
  raw: string;
  label: string;
  value: string;
  page: number;
  bbox: BoundingBox | null;
  /** Provider confidence for the block this line came from. */
  ocrConfidence: number;
};

/**
 * `Label: Value`, `Label : Value`, `Label   Value` (column-aligned), `Label - Value`,
 * `Label = Value`.
 *
 * The `=` form does not appear on printed documents, but it is ordinary in text an operator
 * pastes out of a portal, a spreadsheet or a message (see ./text.ts).
 */
const LABEL_VALUE = /^(.{2,60}?)\s*(?::|=|\s{2,}|\s[-–—]\s)\s*(.+)$/;

function toLines(blocks: readonly OcrBlock[]): SourceLine[] {
  const lines: SourceLine[] = [];

  for (const block of blocks) {
    for (const raw of block.text.split(/\r?\n/)) {
      const trimmed = raw.trim();
      if (trimmed === '') continue;

      // A row of a printed grid carries several label/value pairs side by side. Each one is its
      // own candidate; the whole row stays as `raw`, so the operator reviews a field against
      // what was actually printed.
      for (const pair of splitMultiLabelLine(trimmed)) {
        lines.push({
          raw: trimmed,
          label: pair.label,
          value: pair.value,
          page: block.page,
          bbox: block.bbox,
          ocrConfidence: block.confidence,
        });
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Multi-label rows (§12.4)
// ---------------------------------------------------------------------------

/**
 * Every printed label the dictionary knows, longest first, as a matcher.
 *
 * Phrases under three characters are left out: `%` and `s/o` are real labels at the start of a
 * line, but as a *mid-line* split point they would fire inside ordinary values ("72.4%"), and a
 * split point is the only thing this table is used for.
 */
const SPLIT_LABEL_PATTERNS: readonly { phrase: string; pattern: RegExp; words: number }[] = [
  ...new Set(LABEL_RULES.flatMap((rule) => rule.labels)),
]
  .filter((phrase) => phrase.length >= 3)
  .sort((a, b) => b.length - a.length)
  .map((phrase) => ({
    phrase,
    // The same word-boundary definition `scoreLabel` uses, so a phrase cannot match inside a
    // word: "post" must not fire inside "postal".
    pattern: new RegExp(
      '(?<![a-z0-9\\u0900-\\u097F])' + escapeRegExp(phrase) + '(?![a-z0-9\\u0900-\\u097F])',
      'gi',
    ),
    words: phrase.split(/\s+/).length,
  }));

/**
 * Curly quotes and non-breaking spaces, replaced one character for one so that an index into
 * this string is still an index into the original line.
 */
function alignedForMatching(line: string): string {
  return line.replace(APOSTROPHES, "'").replace(/\u00A0/g, ' ');
}

const SEPARATOR_AFTER_LABEL = /^\s{0,4}[:=]/;

/**
 * Punctuation that says a matched label is part of a value rather than the start of a column:
 * a printed label is followed by its value, never by a comma. This is what tells "College" in
 * `College Name D.K. College, Dumraon` apart from "Result" in `SGPA 7.85 Result PASSED`.
 *
 * `:`, `=` and `-` are deliberately absent — those are separators, which is the opposite signal.
 */
const NOT_A_COLUMN_START = /^\s*(?:[,;)\]}/]|$)/;

/** Beyond this a "row" is a paragraph the splitter has misread. */
const MAX_PAIRS_PER_LINE = 6;

/** A grid cell is a value, not a sentence. Past this, an unpunctuated line is prose. */
const MAX_CELL_WORDS = 6;
const MAX_CELL_LENGTH = 80;

/**
 * Labels that may open a line but never start a column part-way through one.
 *
 * Every one of them is also an ordinary word inside the name of an institution — "Rampur Degree
 * College", "Demo State University", "Bihar School Examination Board" — so mid-line they are far
 * more likely to be inside a value than to be labelling the next one. At the start of a line they
 * are as good a label as any: `College Name Rampur Degree College` reads its own first label and
 * then keeps the rest of the row whole.
 *
 * "State" is here for the same reason, and it is the one that costs something: an unpunctuated
 * `District Sitapur State Bihar` now gives up its second cell. A line splitter cannot tell that
 * row from `University Name Demo State University` — they have the same shape — and truncating
 * an institution's name mid-value is the worse of the two outcomes. A printed address is also
 * rarely the only place a state appears; a university's name is.
 */
const NOT_A_MID_LINE_LABEL: ReadonlySet<string> = new Set([
  'degree',
  'college',
  'school',
  'university',
  'institution',
  'board',
  'state',
  'city',
  'विद्यालय',
  'महाविद्यालय',
  'विश्वविद्यालय',
  'कॉलेज',
  'संस्थान',
  'बोर्ड',
  'राज्य',
]);

/**
 * Words that make a cell a phrase rather than a value.
 *
 * A printed grid cell is a value — "SUNITA DEVI", "D.K. College", "7.85", "PASSED" — and values
 * do not carry English function words. A *heading* does: the line a class 10 marksheet opens
 * with, `BOARD OF HIGH SCHOOL AND INTERMEDIATE EDUCATION`, begins with a label word and reads as
 * short cells, and without this guard "Board" would be extracted as "OF HIGH". Only the
 * unpunctuated paths consult it; a colon is evidence enough on its own.
 */
const PROSE_WORD =
  /(?:^|\s)(?:of|and|the|for|to|in|on|at|by|with|from|or|is|are|was|will|be|&)(?:\s|$)/i;

/**
 * A row whose every cell is this short is a grid however its labels are worded.
 *
 * It is the second way an unpunctuated row can prove itself, and the only one that will trust a
 * one-word label such as "Gender" or "Result" mid-line. `Gender MALE Category GENERAL` reads as
 * two cells of one word; `Address House 12 near Government School Rampur` does not, which is
 * what stops "School" there from cutting an address in two.
 */
const MAX_TIGHT_CELL_WORDS = 3;

type LabelHit = {
  start: number;
  end: number;
  /** Words in the matched label phrase — a one-word noun is weak evidence of a new column. */
  words: number;
  /** Followed by its own `:` or `=`. */
  separated: boolean;
  /** Preceded by a column's worth of whitespace. */
  columned: boolean;
  /** Could begin a column at all — i.e. something follows it that is not value punctuation. */
  boundary: boolean;
};

/**
 * Splits one line into its label/value pairs, or returns it as a single unsplit candidate.
 *
 * Indian certificates are laid out as grids, and a grid row transcribes as several pairs on one
 * line: `Candidate's Name PRITAM KUMAR Father's Name KRISHNA SINGH`. Read as one pair, the
 * father's name ends up inside the candidate's — the single most damaging extraction error
 * there is (§14.4); read by `LABEL_VALUE` alone, a row punctuated by nothing but single spaces
 * yields no pair at all, which is how a university marksheet came back empty.
 *
 * Splitting a line wrongly is worse than not splitting it, because a value would then be filed
 * under a field it does not belong to. So a split makes the line prove it is a grid row twice:
 *
 *   1. it must *begin* with a known label — a value that merely contains a label word does not,
 *      which is what keeps "Address: Near the Government School" in one piece, and
 *   2. it must carry a second label that is more than a stray noun: followed by its own `:` when
 *      the line punctuates its pairs at all, or — when there is no punctuation to go on — a label
 *      of two or more words, one starting a new whitespace column, or a row whose every cell is
 *      short enough that it can only be a grid (`provesGridRow`).
 *
 * On an unpunctuated line every cell must also read as a *value* rather than a phrase, which is
 * what stops a heading from proposing a field (see `PROSE_WORD`).
 *
 * Only once both hold does every remaining known label in the row become a split point, so
 * `Village Rampur Post Office Rampur Kalan District Sitapur` yields all three pairs rather than
 * only the two that proved the row.
 *
 * A row that proves (1) but not (2) — `Course B.Sc. (Hons) Physics` — still gives up its first
 * cell, but *only* where `LABEL_VALUE` found nothing, and the cell is cut at the next label so
 * that a column this function could not justify splitting on is dropped rather than swallowed
 * into the value.
 *
 * A bilingual label is deliberately *not* a split point: in `पिता का नाम / Father's Name : Ram`
 * only the second label carries the colon, so rule 2 fails and the line stays whole — which is
 * what `scoreLabel` already reads correctly as one label.
 */
export function splitMultiLabelLine(line: string): { label: string; value: string }[] {
  const fallback = unsplit(line);
  const target = alignedForMatching(line);
  const hits = findLabelHits(target);
  if (hits[0]?.start !== 0) return [fallback];

  const punctuated = /[:=]/.test(target);
  const boundaries = punctuated
    ? // On a punctuated line only a label with a separator of its own opens a column: a label
      // without one is part of a value, and the bilingual "पिता का नाम / Father's Name :" is one
      // label, not two.
      hits.filter((hit) => hit.separated && hit.boundary)
    : hits.filter((hit) => hit.boundary);

  if (
    boundaries.length >= 2 &&
    boundaries[0]?.start === 0 &&
    boundaries.length <= MAX_PAIRS_PER_LINE &&
    (punctuated || provesGridRow(line, boundaries))
  ) {
    const pairs = toPairs(line, boundaries);
    if (pairs !== null) return pairs;
  }

  // One label, no separator: nothing else can read this line, so read the first cell only.
  if (fallback.label === '') {
    const cut = hits.find((hit) => hit.start > 0 && hit.boundary)?.start ?? line.length;
    const value = trimCell(line.slice(hits[0].end, cut));
    if (isGridCell(value)) return [{ label: line.slice(0, hits[0].end).trim(), value }];
  }

  return [fallback];
}

/** The pairs a set of boundaries implies, or null when any of them lands on an empty cell. */
function toPairs(
  line: string,
  boundaries: readonly LabelHit[],
): { label: string; value: string }[] | null {
  const pairs: { label: string; value: string }[] = [];

  for (const [index, hit] of boundaries.entries()) {
    const label = line.slice(hit.start, hit.end).trim();
    const value = trimCell(line.slice(hit.end, boundaries[index + 1]?.start ?? line.length));

    // An empty cell means the boundaries were wrong, not that the row is empty. Back out.
    if (label === '' || value === '') return null;
    pairs.push({ label, value });
  }

  return pairs;
}

function unsplit(line: string): { label: string; value: string } {
  const match = LABEL_VALUE.exec(line);
  return { label: (match?.[1] ?? '').trim(), value: (match?.[2] ?? '').trim() };
}

/** Strips the separator a cell opens with and the column punctuation it may end with. */
function trimCell(cell: string): string {
  return cell
    .replace(/^\s*[:=]\s*/, '')
    .replace(/^\s*[-–—]\s+/, '')
    .replace(/[,;|]\s*$/, '')
    .trim();
}

/**
 * Whether an unpunctuated line has earned a split at these boundaries.
 *
 * Every cell has to read as a value first — that is what rules out a heading. Then the row needs
 * either a label that looks like a field name (two or more words, or a new whitespace column) or
 * cells short enough that the row can only be a grid.
 */
function provesGridRow(line: string, boundaries: readonly LabelHit[]): boolean {
  const cells = boundaries.map((hit, index) =>
    trimCell(line.slice(hit.end, boundaries[index + 1]?.start ?? line.length)),
  );

  if (!cells.every(isGridCell)) return false;

  const columnar = boundaries.filter(
    (hit, index) => index === 0 || hit.words >= 2 || hit.columned,
  );
  return (
    columnar.length >= 2 || cells.every((cell) => wordCount(cell) <= MAX_TIGHT_CELL_WORDS)
  );
}

function wordCount(value: string): number {
  return value.split(/\s+/).length;
}

/** A cell that could be a printed value: present, short, and not a fragment of a sentence. */
function isGridCell(value: string): boolean {
  if (value === '' || value.length > MAX_CELL_LENGTH) return false;
  return wordCount(value) <= MAX_CELL_WORDS && !PROSE_WORD.test(value);
}

/** Non-overlapping label matches, the longest phrase winning at any position. */
function findLabelHits(target: string): LabelHit[] {
  const hits: (LabelHit & { phrase: string })[] = [];

  for (const { phrase, pattern, words } of SPLIT_LABEL_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(target); match !== null; match = pattern.exec(target)) {
      const start = match.index;
      const end = start + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;

      const after = target.slice(end);
      hits.push({
        phrase,
        start,
        end,
        words,
        separated: SEPARATOR_AFTER_LABEL.test(after),
        columned: /(?:\s\s|\t)$/.test(target.slice(0, start)),
        boundary: !NOT_A_COLUMN_START.test(after),
      });
    }
  }

  return hits
    .sort((a, b) => a.start - b.start)
    .map((hit, index) => ({
      ...hit,
      boundary: hit.boundary && (index === 0 || !NOT_A_MID_LINE_LABEL.has(hit.phrase)),
    }));
}

// ---------------------------------------------------------------------------
// Label matching
// ---------------------------------------------------------------------------

/** Typographic apostrophes. The dictionary is written with typewriter quotes only. */
const APOSTROPHES = /[‘’´]/g;

function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/[*_|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 when the rule does not apply to this label, otherwise a match quality in (0, 1]. */
function scoreLabel(label: string, rule: LabelRule): number {
  const haystack = normaliseLabel(label);
  if (haystack === '') return 0;

  // A negative keyword disqualifies the rule outright. "Father's Name" must never satisfy the
  // applicant-name rule, however well the word "name" matches (§14.4).
  if (rule.negatives?.some((negative) => haystack.includes(negative))) return 0;

  let best = 0;
  for (const candidate of rule.labels) {
    if (haystack === candidate) {
      best = Math.max(best, 0.95);
    } else if (haystack.startsWith(candidate) || haystack.endsWith(candidate)) {
      // Bilingual labels print as "पिता का नाम / Father's Name" — an edge match, not a weak one.
      best = Math.max(best, 0.88);
    } else if (haystack.includes(candidate)) {
      // Guard against "name" matching inside an unrelated word such as "surname of nominee".
      const boundary = new RegExp(`(^|[^a-z\\u0900-\\u097F])${escapeRegExp(candidate)}($|[^a-z\\u0900-\\u097F])`);
      if (boundary.test(haystack)) best = Math.max(best, 0.8);
    }
  }

  return best;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Value normalisation (§12.5)
// ---------------------------------------------------------------------------

const GENDER_SYNONYMS: Record<string, string> = {
  m: 'male',
  male: 'male',
  पुरुष: 'male',
  f: 'female',
  female: 'female',
  महिला: 'female',
  स्त्री: 'female',
  t: 'transgender',
  transgender: 'transgender',
  ट्रांसजेंडर: 'transgender',
  other: 'other',
  अन्य: 'other',
};

const CATEGORY_SYNONYMS: Record<string, string> = {
  general: 'general',
  gen: 'general',
  ur: 'general',
  सामान्य: 'general',
  obc: 'obc',
  'other backward class': 'obc',
  'अन्य पिछड़ा वर्ग': 'obc',
  ओबीसी: 'obc',
  sc: 'sc',
  'scheduled caste': 'sc',
  'अनुसूचित जाति': 'sc',
  st: 'st',
  'scheduled tribe': 'st',
  'अनुसूचित जनजाति': 'st',
  ews: 'ews',
  ईडब्ल्यूएस: 'ews',
};

/**
 * Latin letters and Devanagari only — used to reduce a printed value like "Female / महिला" to a
 * lookup key. Escaped `RegExp` rather than a literal because the Devanagari range spans
 * combining marks, which `no-misleading-character-class` flags (as in core's normalize.ts).
 */
// eslint-disable-next-line no-misleading-character-class
const NON_LETTER_CHARS = new RegExp('[^a-z\\u0900-\\u097F]', 'g');

type NormalisedField = { value: string | null; valid: boolean };

function normaliseValue(raw: string, kind: FieldDataKind): NormalisedField {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, valid: false };

  switch (kind) {
    case 'name': {
      const { value, valid } = normalizeName(trimmed);
      // A "name" made of digits is an OCR misread of an adjacent column, not a name.
      if (value && /\d{3,}/.test(value)) return { value: null, valid: false };
      return { value, valid };
    }
    case 'date': {
      const { value, valid } = parseIndianDate(trimmed);
      return { value, valid };
    }
    case 'mobile': {
      const { value, valid } = normalizeMobile(trimmed);
      return { value, valid };
    }
    case 'pincode': {
      const { value, valid } = normalizePincode(trimmed);
      return { value, valid };
    }
    case 'pan': {
      const { value, valid } = normalizePan(trimmed);
      return { value, valid };
    }
    case 'aadhaar': {
      // For the fields and portal inputs that explicitly want only four digits.
      const last4 = aadhaarLastFour(trimmed);
      return { value: last4, valid: last4 !== null };
    }
    case 'aadhaar_full': {
      const full = aadhaarFull(trimmed);
      return { value: full, valid: full !== null };
    }
    case 'number': {
      const digits = trimmed.replace(/[,\s₹]/g, '').replace(/\/-$/, '');
      return /^\d+(\.\d+)?$/.test(digits)
        ? { value: digits, valid: true }
        : { value: null, valid: false };
    }
    case 'year': {
      const match = /\b(19|20)\d{2}\b/.exec(trimmed);
      return match ? { value: match[0], valid: true } : { value: null, valid: false };
    }
    case 'gender': {
      const key = trimmed.toLowerCase().replace(NON_LETTER_CHARS, '');
      const mapped = GENDER_SYNONYMS[key];
      return mapped ? { value: mapped, valid: true } : { value: null, valid: false };
    }
    case 'category': {
      const key = trimmed.toLowerCase().replace(/\s+/g, ' ').trim();
      const mapped = CATEGORY_SYNONYMS[key] ?? CATEGORY_SYNONYMS[key.replace(/\s+/g, '')];
      return mapped ? { value: mapped, valid: true } : { value: null, valid: false };
    }
    case 'longtext':
      return { value: trimmed.slice(0, 500), valid: true };
    case 'text':
    default:
      return { value: trimmed.slice(0, 200), valid: true };
  }
}

// ---------------------------------------------------------------------------
// Review rules (§12.6, §14.6)
// ---------------------------------------------------------------------------

function reviewReasonFor(key: string, confidence: number, formatValid: boolean): ReviewReason | null {
  if (!formatValid) return 'format_invalid';
  // High-risk fields are reviewed however confident the extractor is (§12.6).
  if (requiresReview(key)) return 'high_risk_field';
  if (confidence < CONFIDENCE_MEDIUM) return 'low_confidence';
  if (confidence < CONFIDENCE_HIGH) return 'medium_confidence';
  return null;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export type ExtractFieldsInput = {
  ocr: OcrResult;
  documentType: DocumentType;
  /**
   * Overrides the per-class allow-list. Used by the pasted-text path (./text.ts), where there is
   * no document to classify and restricting to one class would silently drop fields the operator
   * deliberately typed. Safety is unaffected: `sanitizeExtractedFields` still runs, so a
   * forbidden key cannot be re-admitted through this door.
   */
  allowedKeys?: readonly string[];
};

/**
 * Runs the label rules over the OCR output and returns proposed fields.
 *
 * Only fields the document class can legitimately contain are considered
 * (`FIELDS_BY_DOCUMENT_TYPE`), so a PAN card never yields a district and an income certificate
 * never yields a Class 10 board.
 */
export function extractFields(input: ExtractFieldsInput): {
  fields: ExtractedField[];
  warnings: ExtractionWarning[];
} {
  const allowedKeys = new Set(input.allowedKeys ?? FIELDS_BY_DOCUMENT_TYPE[input.documentType] ?? []);
  const rules = LABEL_RULES.filter((rule) => allowedKeys.has(rule.key));
  const warnings: ExtractionWarning[] = [];

  if (rules.length === 0) {
    return { fields: [], warnings };
  }

  const lines = toLines(input.ocr.blocks);
  // Best candidate per field key — a document that prints "Name" twice should yield one name.
  const best = new Map<string, ExtractedField>();

  for (const line of lines) {
    if (line.label === '' || line.value === '') continue;

    const matches = rules
      .map((rule) => ({ rule, score: scoreLabel(line.label, rule) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const top = matches[0];
    if (!top) continue;

    // Two different fields claiming the same line with equal strength is not a decision.
    // Keep the value but push it into review rather than guessing (§12.6).
    const runnerUp = matches[1];
    const ambiguous = runnerUp !== undefined && top.score - runnerUp.score < 0.01;

    const normalised = normaliseValue(line.value, top.rule.kind);
    if (normalised.value === null) {
      warnings.push({
        code: 'VALUE_NOT_UNDERSTOOD',
        messageKey: 'documents.warnings.valueNotUnderstood',
        fieldKey: top.rule.key,
      });
      continue;
    }

    // Label quality and OCR quality both bound the result: a perfect label read off a blurry
    // scan is not a confident field.
    let confidence = top.score * clamp01(line.ocrConfidence);
    if (ambiguous) confidence *= 0.75;
    if (!normalised.valid) confidence *= 0.6;
    confidence = Number(clamp01(confidence).toFixed(3));

    const reviewReason = ambiguous
      ? 'ambiguous_match'
      : reviewReasonFor(top.rule.key, confidence, normalised.valid);

    const candidate: ExtractedField = {
      key: top.rule.key,
      label: line.label.slice(0, 200),
      value: normalised.value,
      confidence,
      sourceText: line.raw.slice(0, 500),
      page: line.page,
      bbox: line.bbox,
      status: reviewReason === null ? 'ok' : 'needs_review',
      reviewReason,
    };

    const existing = best.get(candidate.key);
    if (!existing || candidate.confidence > existing.confidence) {
      best.set(candidate.key, candidate);
    }
  }

  // Unlabelled identifiers. A PAN card prints the number on its own line with no label at all,
  // and an Aadhaar prints the digits under the photo.
  for (const field of scanUnlabelledIdentifiers(input.ocr, allowedKeys)) {
    if (!best.has(field.key)) best.set(field.key, field);
  }

  const fields = sanitizeExtractedFields([...best.values()]);

  if (fields.length === 0) {
    warnings.push({ code: 'NO_FIELDS_FOUND', messageKey: 'documents.warnings.noFieldsFound' });
  }
  if (!fields.some((field) => field.key === 'customer.full_name') && allowedKeys.has('customer.full_name')) {
    warnings.push({ code: 'NO_NAME_FOUND', messageKey: 'documents.warnings.noNameFound' });
  }

  return { fields, warnings };
}

/**
 * True when a whole line reads as a printed field label rather than a value.
 *
 * Pasted text copied out of a two-column table arrives as "Father's Name" on one line and the
 * value on the next, with no separator to key off. ./text.ts uses this to decide whether it may
 * pair two lines; the threshold is the same edge-match score `scoreLabel` gives a bilingual
 * label, so a line has to be a near-exact label to qualify.
 */
export function isKnownFieldLabel(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.length > 60) return false;
  return LABEL_RULES.some((rule) => scoreLabel(trimmed, rule) >= 0.88);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const TWELVE_DIGITS = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/;

/**
 * Values that carry their own format and often appear without a printed label.
 *
 * Confidence is capped below the high band on purpose: a pattern match proves the shape of a
 * value, never that it belongs to this customer, so it always reaches the operator for review.
 */
function scanUnlabelledIdentifiers(ocr: OcrResult, allowedKeys: ReadonlySet<string>): ExtractedField[] {
  const found: ExtractedField[] = [];

  for (const block of ocr.blocks) {
    for (const raw of block.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '') continue;

      if (allowedKeys.has('customer.pan')) {
        const pan = PAN_PATTERN.exec(line.toUpperCase());
        if (pan) {
          found.push({
            key: 'customer.pan',
            label: 'PAN',
            value: pan[0],
            confidence: 0.85,
            sourceText: line.slice(0, 500),
            page: block.page,
            bbox: block.bbox,
            status: 'needs_review',
            reviewReason: 'high_risk_field',
          });
        }
      }

      if (allowedKeys.has('customer.aadhaar') || allowedKeys.has('customer.aadhaar_last4')) {
        const digits = TWELVE_DIGITS.exec(line);
        // The Verhoeff check decides whether this is plausibly an Aadhaar at all.
        if (digits && looksLikeAadhaar(digits[0])) {
          // Prefer the full number when the caller allows it; last-4 is a narrower fallback
          // for a caller that only ever wants four digits.
          const key = allowedKeys.has('customer.aadhaar') ? 'customer.aadhaar' : 'customer.aadhaar_last4';
          const value =
            key === 'customer.aadhaar' ? aadhaarFull(digits[0]) : aadhaarLastFour(digits[0]);
          if (value) {
            found.push({
              key,
              label: 'Aadhaar',
              value,
              confidence: 0.85,
              sourceText: line.slice(0, 500),
              page: block.page,
              bbox: block.bbox,
              status: 'needs_review',
              reviewReason: 'high_risk_field',
            });
          }
        }
      }
    }
  }

  return found;
}

/** Mean field confidence — the document-level number shown on the review screen. */
export function meanConfidence(fields: readonly ExtractedField[]): number | null {
  if (fields.length === 0) return null;
  const total = fields.reduce((sum, field) => sum + field.confidence, 0);
  return Number((total / fields.length).toFixed(3));
}

/** Human-readable label for a field key, for the review UI. */
export function fieldLabel(key: string, locale: 'en' | 'hi'): string {
  return getCustomerField(key)?.label[locale] ?? key;
}

// ---------------------------------------------------------------------------
// Structured-mode extraction (an organization's custom prompt)
// ---------------------------------------------------------------------------

/** Maps a registry field to the normalisation `extract.ts` already knows how to do. */
function kindForField(key: string, dataType: CustomerFieldDataType): FieldDataKind {
  if (key === 'customer.pan') return 'pan';
  if (key === 'customer.aadhaar_last4') return 'aadhaar';
  if (key === 'customer.aadhaar') return 'aadhaar_full';
  if (key === 'customer.gender') return 'gender';
  if (key === 'customer.category') return 'category';

  switch (dataType) {
    case 'name':
    case 'date':
    case 'mobile':
    case 'pincode':
    case 'number':
    case 'year':
    case 'longtext':
      return dataType;
    default:
      return 'text';
  }
}

/**
 * Builds review-ready fields from a vendor's structured-mode response — a custom prompt asked
 * the model to map the document to `customer.*` fields directly, so there is no OCR text to
 * line-split or label-match here (§4, cf. `extractFields`).
 *
 * What does not change: every value still goes through the same per-kind normaliser the manual
 * entry path and the rules engine use, high-risk keys still always require review
 * (`reviewReasonFor`), and every field still passes through `sanitizeExtractedFields` before it
 * is returned — a custom prompt changes how a field is proposed, never whether it is checked.
 *
 * A key the model invented that is not in the registry, or that has no legitimate storage
 * location, is dropped with a warning rather than shown: the review screen only ever displays
 * fields it can look up a label and a storage location for.
 */
export function buildFieldsFromStructuredOutput(input: {
  fields: readonly StructuredExtractedField[];
}): { fields: ExtractedField[]; warnings: ExtractionWarning[] } {
  const warnings: ExtractionWarning[] = [];
  const best = new Map<string, ExtractedField>();

  for (const raw of input.fields) {
    const value = raw.value.trim();
    if (value === '') continue;

    if (isForbiddenFieldKey(raw.key)) {
      warnings.push({
        code: 'STRUCTURED_FIELD_NOT_ALLOWED',
        messageKey: 'documents.warnings.structuredFieldNotAllowed',
        fieldKey: raw.key,
      });
      continue;
    }

    if (!isCustomerFieldKey(raw.key)) {
      warnings.push({
        code: 'STRUCTURED_UNKNOWN_FIELD',
        messageKey: 'documents.warnings.structuredUnknownField',
        fieldKey: raw.key,
      });
      continue;
    }

    const definition = getCustomerField(raw.key);
    if (!definition || definition.storage.kind === 'derived') continue;

    const normalised = normaliseValue(value, kindForField(raw.key, definition.dataType));
    if (normalised.value === null) {
      warnings.push({
        code: 'VALUE_NOT_UNDERSTOOD',
        messageKey: 'documents.warnings.valueNotUnderstood',
        fieldKey: raw.key,
      });
      continue;
    }

    let confidence = clamp01(raw.confidence);
    if (!normalised.valid) confidence *= 0.6;
    confidence = Number(confidence.toFixed(3));

    const reviewReason = reviewReasonFor(raw.key, confidence, normalised.valid);

    const candidate: ExtractedField = {
      key: raw.key,
      label: (raw.label.trim() !== '' ? raw.label : definition.label.en).slice(0, 200),
      value: normalised.value,
      confidence,
      // What the model claimed to have read, before normalisation — there is no OCR line to
      // point back to in structured mode, so the pre-normalised answer is the closest thing to
      // "read from" an operator can check the model against.
      sourceText: value.slice(0, 500),
      page: 1,
      bbox: null,
      status: reviewReason === null ? 'ok' : 'needs_review',
      reviewReason,
    };

    const existing = best.get(candidate.key);
    if (!existing || candidate.confidence > existing.confidence) {
      best.set(candidate.key, candidate);
    }
  }

  const fields = sanitizeExtractedFields([...best.values()]);

  if (fields.length === 0) {
    warnings.push({ code: 'NO_FIELDS_FOUND', messageKey: 'documents.warnings.noFieldsFound' });
  }

  return { fields, warnings };
}
