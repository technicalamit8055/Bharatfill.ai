/**
 * Upload limits a page states in its own words.
 * Master spec §7.4.5 ("Required file type/size if known"), §13.2; docs/EXTENSION.md §6d.
 *
 * Most portals have no adapter and so no preset, but nearly every one prints what an upload box
 * wants right beside it: "Between 50 KB and 200 KB", "Format: JPEG/PDF", "(max. 2MB)",
 * "Size (in KB): 10-200", "अधिकतम 100 KB". This module reads those phrases into numbers and
 * format tokens.
 *
 * Pure and DOM-free. The detector runs it inside the page and sends only what it returns —
 * never the text it read, because the cell beside an upload box is also where a portal shows
 * the customer's uploaded filename.
 *
 * It is deliberately conservative. A size with no word saying which end of the window it is
 * ("File size: 180 KB" is as likely to describe the file already uploaded) is ignored, a format
 * named only inside a filename is ignored, and two different maximums in one piece of text mean
 * the text is describing several boxes at once, so neither is trusted.
 */

import type { DetectedField } from './types';

export const UPLOAD_FORMATS = ['jpeg', 'png', 'pdf', 'gif', 'webp', 'bmp', 'tiff'] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];

/** A picture size as the page states it. `mm` covers cm too; `dpi` only when the page says. */
export type UploadDimensions = {
  width: number;
  height: number;
  unit: 'px' | 'mm';
  dpi: number | null;
};

export type UploadConstraints = {
  minBytes: number | null;
  maxBytes: number | null;
  /** In the order the page named them. Empty when the page named none. */
  formats: UploadFormat[];
  /** Absent or `null` when the page states no size. Optional for older payloads. */
  dimensions?: UploadDimensions | null;
};

const KB = 1024;
const MB = 1024 * KB;
/** Past this a number is not an upload limit — it is a misread. */
const MAX_PLAUSIBLE_BYTES = 100 * MB;

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`(kib|kbs?|k\.b\.?|kilo ?bytes?|mib|mbs?|m\.b\.?|mega ?bytes?|केबी|के\.बी\.?|एमबी|एम\.बी\.?)`;
/**
 * Not glued to a word on either side, and not followed by a file extension: `photo_200kb.jpg`
 * is a filename, not a limit.
 */
const NUM_START = String.raw`(?<![\w])`;
const UNIT_END = String.raw`(?![a-z])(?!\.[a-z])`;

/** "Max Size (KB): 200" and "Size (in KB) 10-200" — the unit in a header, the number after it. */
const UNIT_FIRST = new RegExp(
  String.raw`\(\s*(?:in\s+)?${UNIT}\s*\)\s*[:=-]?\s*${NUM}(?:\s*(?:-|to)\s*${NUM})?`,
  'g',
);
/** "50 KB to 200 KB", "10-200 KB", "between 50 and 200 kb", "50 KB से 200 KB". */
const RANGE = new RegExp(
  String.raw`${NUM_START}${NUM}\s*${UNIT}?\s*(?:-|~|to|and|से)\s*${NUM}\s*${UNIT}${UNIT_END}`,
  'g',
);
const SIZE = new RegExp(String.raw`${NUM_START}${NUM}\s*${UNIT}${UNIT_END}`, 'g');

/**
 * Which end of the window a cue word puts a size at.
 *
 * `gt`/`lt` are comparatives whose meaning depends on what follows: "more than 10 KB" is a
 * minimum, "more than 200 KB will be rejected" is a maximum.
 */
type CueKind = 'min' | 'max' | 'gt' | 'lt';

/** Negations are rewritten to a plain cue first, so "not less than" never reads as "less than". */
const NEGATED_MIN = /\b(?:not|no)\s+(?:be\s+)?(?:less|lower|smaller|below|under)(?:\s+than)?/g;
const NEGATED_MAX =
  /\b(?:not|no)\s+(?:be\s+)?(?:more|greater|larger|bigger|above|over|exceed(?:ing)?)(?:\s+than)?|\bcan\s?not\s+exceed/g;

/** ज्यादा, with or without the nukta. Input is NFC, which always splits ज़ into ज + ़. */
const ZYADA = '\\u091C\\u093C?\\u094D\\u092F\\u093E\\u0926\\u093E';

const BEFORE_CUES: readonly (readonly [RegExp, CueKind])[] = [
  [/MINCUE|\bmin(?:imum|\.)?(?![a-z])|at\s*least|न्यूनतम|कम\s*से\s*कम/g, 'min'],
  [
    new RegExp(
      String.raw`MAXCUE|\bmax(?:imum|\.)?(?![a-z])|up\s*to|\bwithin\b|\bexceed|\blimit|अधिकतम|${ZYADA}\s*से\s*${ZYADA}`,
      'g',
    ),
    'max',
  ],
  [/(?:more|greater|larger|bigger)\s+than|\babove\b|\bover\b|>=?/g, 'gt'],
  [/(?:less|smaller|lower)\s+than|\bbelow\b|\bunder\b|<=?/g, 'lt'],
];

const AFTER_CUES: readonly (readonly [RegExp, CueKind])[] = [
  [new RegExp(String.raw`^[\s).,:]*(?:से\s*(?:अधिक|${ZYADA})\s*नहीं|तक)`), 'max'],
  [/^[\s).,:]*से\s*कम\s*नहीं/, 'min'],
  [/^[\s).,:]*max(?:imum|\.)?(?=\s*(?:[),;.|\]]|$))/, 'max'],
  [/^[\s).,:]*min(?:imum|\.)?(?=\s*(?:[),;.|\]]|$))/, 'min'],
  [
    new RegExp(String.raw`^[\s).,:]*(?:or\s+(?:more|above|greater|higher)|से\s*(?:अधिक|${ZYADA}))`),
    'gt',
  ],
  [/^[\s).,:]*(?:or\s+(?:less|below|smaller|lower)|से\s*कम)/, 'lt'],
];

/** "…will be rejected": flips a comparative. Read only up to the end of the clause. */
const REJECTED =
  /reject|not\s+(?:be\s+)?(?:allowed|accepted|permitted|valid)|will\s+not\s+be|अस्वीकार|मान्य\s+नहीं|स्वीकार\s+नहीं/;

const BEFORE_WINDOW = 60;
const AFTER_WINDOW = 40;

function unitBytes(unit: string): number {
  return unit.startsWith('k') || unit.startsWith('के') ? KB : MB;
}

function toBytes(amount: string, unit: string): number | null {
  const bytes = Math.round(Number.parseFloat(amount) * unitBytes(unit));
  return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_PLAUSIBLE_BYTES ? bytes : null;
}

function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
    .replace(/[‐-―−]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function lastCue(before: string): CueKind | null {
  const text = before.replace(NEGATED_MIN, ' MINCUE ').replace(NEGATED_MAX, ' MAXCUE ');
  let best: { kind: CueKind; at: number } | null = null;
  for (const [pattern, kind] of BEFORE_CUES) {
    for (const match of text.matchAll(pattern)) {
      if (!best || match.index >= best.at) best = { kind, at: match.index };
    }
  }
  return best?.kind ?? null;
}

function afterCue(after: string): CueKind | null {
  for (const [pattern, kind] of AFTER_CUES) if (pattern.test(after)) return kind;
  return null;
}

function resolveCue(kind: CueKind, after: string): 'min' | 'max' {
  if (kind === 'min' || kind === 'max') return kind;
  const clause = after.split(/[;,|.।]/)[0] ?? '';
  const rejected = REJECTED.test(clause);
  if (kind === 'gt') return rejected ? 'max' : 'min';
  return rejected ? 'min' : 'max';
}

/** Two readings of one limit, e.g. "200 KB (0.2 MB)", differ by a rounding error, not a box. */
function sameLimit(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(a, b) * 0.05;
}

/** The single value a list agrees on, or `null` when it names several. */
function agreed(values: readonly number[]): number | null {
  const [first] = values;
  if (first === undefined) return null;
  return values.every((value) => sameLimit(value, first)) ? first : null;
}

function parseSizes(raw: string): { minBytes: number | null; maxBytes: number | null } {
  const text = normalize(raw).replace(
    UNIT_FIRST,
    (_match, unit: string, a: string, b: string | undefined) =>
      b ? ` ${a} ${unit} - ${b} ${unit} ` : ` ${a} ${unit} `,
  );

  const mins: number[] = [];
  const maxes: number[] = [];

  // Ranges first, then blanked out so their numbers are not read a second time as singles.
  let rest = text;
  for (const match of text.matchAll(RANGE)) {
    const [whole, a = '', unitA, b = '', unitB = ''] = match;
    const low = toBytes(a, unitA ?? unitB);
    const high = toBytes(b, unitB);
    if (low === null || high === null || low >= high) continue;
    mins.push(low);
    maxes.push(high);
    rest = rest.slice(0, match.index) + ' '.repeat(whole.length) + rest.slice(match.index + whole.length);
  }

  const singles = Array.from(rest.matchAll(SIZE));
  singles.forEach((match, i) => {
    const [whole, amount = '', unit = ''] = match;
    const bytes = toBytes(amount, unit);
    if (bytes === null) return;

    const start = match.index;
    const end = start + whole.length;
    const previous = singles[i - 1];
    const next = singles[i + 1];
    // Each size's context stops where its neighbour's begins: "min 10 KB, max 200 KB".
    const beforeFrom = Math.max(
      previous ? previous.index + previous[0].length : 0,
      start - BEFORE_WINDOW,
    );
    const before = rest.slice(beforeFrom, start);
    const after = rest.slice(end, Math.min(next ? next.index : rest.length, end + AFTER_WINDOW));

    const kind = lastCue(before) ?? afterCue(after);
    if (!kind) return;
    (resolveCue(kind, after) === 'min' ? mins : maxes).push(bytes);
  });

  return { minBytes: agreed(mins), maxBytes: agreed(maxes) };
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/**
 * A format word on its own, or as a `.ext`. Never part of a filename: `photo.jpg` and
 * `aadhaar.pdf.` name a file the customer uploaded, not a rule.
 */
const FORMAT_TOKEN = /(?<![\w-])(?<![\w-]\.)\.?(jpe?g|png|pdf|gif|webp|bmp|tiff?)(?![\w-])(?!\.[a-z0-9])/g;
/** Words that make any format named in the same text a rule rather than a passing mention. */
const FORMAT_CUE =
  /format|file\s*type|type\s*of\s*file|extension|\bonly\b|allowed|accepted|acceptable|permitted|supported|प्रारूप|फ़?[ाॉ]र्मेट|केवल|मान्य/;
/** A format with a rule right beside it: "(PDF)", "in PDF", "JPG file", "PDF only". */
const FORMAT_LOCAL_BEFORE = /(?:\(|\bin)\s*$/;
const FORMAT_LOCAL_AFTER = /^\s*(?:file|format|only|\)|में)/;

function canonicalFormat(token: string): UploadFormat {
  if (token === 'jpg' || token === 'jpeg') return 'jpeg';
  if (token === 'tif' || token === 'tiff') return 'tiff';
  return token as UploadFormat;
}

function parseFormats(raw: string): UploadFormat[] {
  const text = normalize(raw);
  const hits = Array.from(text.matchAll(FORMAT_TOKEN)).map((match) => ({
    format: canonicalFormat(match[1] ?? ''),
    before: text.slice(Math.max(0, match.index - 4), match.index),
    after: text.slice(match.index + match[0].length, match.index + match[0].length + 8),
  }));
  if (hits.length === 0) return [];

  const distinct = Array.from(new Set(hits.map((hit) => hit.format)));
  // A list of two or more formats ("JPG/JPEG/PDF", ".jpg, .png") is a rule on its own.
  if (FORMAT_CUE.test(text) || distinct.length > 1) return distinct;

  return Array.from(
    new Set(
      hits
        .filter((hit) => FORMAT_LOCAL_BEFORE.test(hit.before) || FORMAT_LOCAL_AFTER.test(hit.after))
        .map((hit) => hit.format),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const LENGTH_UNIT = String.raw`(cm|mm|inch(?:es)?|centimet(?:er|re)s?|millimet(?:er|re)s?|सेमी|से\.\s?मी\.?)`;
/** "(width)" / "(height)" after a number — the one hint that the page put height first. */
const AXIS = String.raw`(?:\s*\(\s*(width|height|w|h)\s*\))?`;
const BY = String.raw`\s*(?:x|×|\*|by)\s*`;
/** "6.0 cm (width) X 2.0 cm (height)", "3.5 x 4.5 cm", "35mm x 45mm". */
const PHYSICAL = new RegExp(
  String.raw`${NUM_START}${NUM}\s*${LENGTH_UNIT}?${AXIS}${BY}${NUM}\s*${LENGTH_UNIT}${AXIS}`,
  'g',
);
/** "200 x 230 pixels", "140 X 60 px". The unit is required: "10 x 20" alone is not a size. */
const PIXELS = new RegExp(
  String.raw`${NUM_START}(\d{2,5})\s*(?:px|pixels?)?${AXIS}${BY}(\d{2,5})\s*(?:px|pixels?)(?![a-z])${AXIS}`,
  'g',
);
const DPI = /(?<![\w.])(\d{2,4})\s*(?:dpi|ppi|dots\s+per\s+inch)(?![a-z])/g;

function lengthToMm(value: number, unit: string): number {
  if (unit.startsWith('mm') || unit.startsWith('milli')) return value;
  if (unit.startsWith('inch')) return value * 25.4;
  return value * 10;
}

function sameDimensions(a: UploadDimensions, b: UploadDimensions): boolean {
  return a.unit === b.unit && sameLimit(a.width, b.width) && sameLimit(a.height, b.height);
}

/**
 * The single picture size a piece of text states, or `null` when it states none or several.
 *
 * Width comes first unless the page labels the first number "(height)". Pixel sizes beat
 * physical ones when a page gives both, because pixels are what a validator counts. A DPI is
 * attached only when the text names one, and only when it names one DPI.
 */
function parseDimensions(raw: string): UploadDimensions | null {
  const text = normalize(raw);
  const found: UploadDimensions[] = [];

  for (const match of text.matchAll(PIXELS)) {
    const [, a = '', axisA, b = ''] = match;
    const [width, height] = axisA?.startsWith('h') ? [+b, +a] : [+a, +b];
    if (width >= 16 && height >= 16 && width <= 8000 && height <= 8000) {
      found.push({ width, height, unit: 'px', dpi: null });
    }
  }

  if (found.length === 0) {
    for (const match of text.matchAll(PHYSICAL)) {
      const [, a = '', unitA, axisA, b = '', unitB = ''] = match;
      const first = lengthToMm(Number.parseFloat(a), unitA ?? unitB);
      const second = lengthToMm(Number.parseFloat(b), unitB);
      const [width, height] = axisA?.startsWith('h') ? [second, first] : [first, second];
      if (width >= 5 && height >= 5 && width <= 500 && height <= 500) {
        found.push({ width, height, unit: 'mm', dpi: null });
      }
    }
  }

  const [first] = found;
  if (!first || !found.every((size) => sameDimensions(size, first))) return null;

  const dpis = Array.from(text.matchAll(DPI), (match) => Number(match[1])).filter(
    (dpi) => dpi >= 72 && dpi <= 2400,
  );
  const dpi = dpis.length > 0 && dpis.every((value) => value === dpis[0]) ? (dpis[0] ?? null) : null;
  return { ...first, dpi };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** What one piece of page text says about an upload box, or `null` if it says nothing. */
export function parseUploadConstraints(text: string | null | undefined): UploadConstraints | null {
  if (!text || !text.trim()) return null;
  const sizes = parseSizes(text);
  const formats = parseFormats(text);
  const dimensions = parseDimensions(text);
  // A minimum at or over the maximum is a misread; the maximum is the one a portal enforces.
  const minBytes =
    sizes.minBytes !== null && sizes.maxBytes !== null && sizes.minBytes >= sizes.maxBytes
      ? null
      : sizes.minBytes;
  if (minBytes === null && sizes.maxBytes === null && formats.length === 0 && !dimensions) {
    return null;
  }
  return { minBytes, maxBytes: sizes.maxBytes, formats, ...(dimensions ? { dimensions } : {}) };
}

/**
 * Several sources about the same box, strongest first. Each end of the window and the format
 * list are taken from the first source that states them — a label's "(JPG, max 50 KB)" beats a
 * table cell further along the row.
 */
export function mergeUploadConstraints(
  sources: readonly (UploadConstraints | null | undefined)[],
): UploadConstraints | null {
  let minBytes: number | null = null;
  let maxBytes: number | null = null;
  let formats: UploadFormat[] = [];
  let dimensions: UploadDimensions | null = null;
  for (const source of sources) {
    if (!source) continue;
    minBytes ??= source.minBytes;
    maxBytes ??= source.maxBytes;
    if (formats.length === 0) formats = source.formats;
    dimensions ??= source.dimensions ?? null;
  }
  if (minBytes !== null && maxBytes !== null && minBytes >= maxBytes) minBytes = null;
  if (minBytes === null && maxBytes === null && formats.length === 0 && !dimensions) return null;
  return { minBytes, maxBytes, formats, ...(dimensions ? { dimensions } : {}) };
}

const FORMAT_ACCEPT: Record<UploadFormat, readonly string[]> = {
  jpeg: ['.jpg', '.jpeg', 'image/jpeg'],
  png: ['.png', 'image/png'],
  pdf: ['.pdf', 'application/pdf'],
  gif: ['.gif', 'image/gif'],
  webp: ['.webp', 'image/webp'],
  bmp: ['.bmp', 'image/bmp'],
  tiff: ['.tif', '.tiff', 'image/tiff'],
};

/** An `accept` attribute equivalent to a stated format list, for `fileMatchesAccept`. */
export function acceptFromFormats(formats: readonly UploadFormat[]): string | null {
  if (formats.length === 0) return null;
  return formats.flatMap((format) => FORMAT_ACCEPT[format]).join(',');
}

/** The exact picture an upload box wants, in pixels, with the DPI to stamp when one is known. */
export type UploadPixelSize = { widthPx: number; heightPx: number; dpi: number | null };

/** What an upload box asks for, from every source the extension has. */
export type UploadTarget = {
  accept: string | null;
  minBytes: number | null;
  maxBytes: number | null;
  /** Where the size window came from. `null` when nothing stated one. */
  sizeSource: 'preset' | 'page' | null;
  /** The picture size to redraw an image to, or `null` when nothing states one. */
  dimensions: UploadPixelSize | null;
  dimensionSource: 'preset' | 'page' | null;
};

/** The preset fields `resolveUploadTarget` reads — a `DocumentPresetSummary` fits. */
export type UploadTargetPreset = {
  minBytes: number | null;
  maxBytes: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  dpi?: number | null;
};

/** A size stated in centimetres with no DPI anywhere: what Indian portal notices assume. */
const DEFAULT_UPLOAD_DPI = 300;

/** Rounds up, exactly like document-tools' `mmToPx`, so Studio and auto-fit agree to the pixel. */
const mmToPx = (mm: number, dpi: number) => Math.max(1, Math.ceil((mm / 25.4) * dpi));

function pageDimensions(
  stated: UploadDimensions,
  preset: UploadTargetPreset | null | undefined,
): UploadPixelSize {
  if (stated.unit === 'px') {
    return {
      widthPx: Math.round(stated.width),
      heightPx: Math.round(stated.height),
      dpi: stated.dpi,
    };
  }
  const dpi = stated.dpi ?? preset?.dpi ?? DEFAULT_UPLOAD_DPI;
  return { widthPx: mmToPx(stated.width, dpi), heightPx: mmToPx(stated.height, dpi), dpi };
}

function presetDimensions(preset: UploadTargetPreset | null | undefined): UploadPixelSize | null {
  if (!preset) return null;
  if (preset.widthPx && preset.heightPx) {
    return { widthPx: preset.widthPx, heightPx: preset.heightPx, dpi: preset.dpi ?? null };
  }
  if (preset.widthMm && preset.heightMm) {
    const dpi = preset.dpi ?? DEFAULT_UPLOAD_DPI;
    return { widthPx: mmToPx(preset.widthMm, dpi), heightPx: mmToPx(preset.heightMm, dpi), dpi };
  }
  return null;
}

/**
 * The window and file types to hold a file to for one upload box.
 *
 * A resolved preset's window wins over the page's: an adapter's `presetCode` is a curated
 * mapping, and a portal-name guess is still a real portal's published rule. The page fills in
 * only when no preset states a size — the portals with no adapter at all. Likewise the box's own
 * `accept` attribute wins over formats read from text, because the browser enforces it.
 */
export function resolveUploadTarget(
  field: Pick<DetectedField, 'accept' | 'uploadConstraints'>,
  preset: UploadTargetPreset | null | undefined,
): UploadTarget {
  const page = field.uploadConstraints ?? null;
  const accept = field.accept?.trim() ? field.accept : acceptFromFormats(page?.formats ?? []);

  /*
   * Dimensions go the other way from the KB window: the page's own statement wins. A portal's
   * validator rejects on the size it prints beside the box, so when a preset and the box
   * disagree it is the preset that is out of date — SSC moved its signature from 4 × 2 cm at
   * 200 DPI to 6 × 2 cm at 300 DPI and said so only on the page.
   */
  const stated = page?.dimensions ?? null;
  const fromPreset = presetDimensions(preset);
  const dimensions = stated ? pageDimensions(stated, preset) : fromPreset;
  const dimensionSource = stated ? ('page' as const) : fromPreset ? ('preset' as const) : null;

  if (preset && (preset.minBytes || preset.maxBytes)) {
    return {
      accept,
      minBytes: preset.minBytes || null,
      maxBytes: preset.maxBytes || null,
      sizeSource: 'preset',
      dimensions,
      dimensionSource,
    };
  }
  if (page && (page.minBytes !== null || page.maxBytes !== null)) {
    return {
      accept,
      minBytes: page.minBytes,
      maxBytes: page.maxBytes,
      sizeSource: 'page',
      dimensions,
      dimensionSource,
    };
  }
  return { accept, minBytes: null, maxBytes: null, sizeSource: null, dimensions, dimensionSource };
}

function formatSize(bytes: number): string {
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(1))} MB`;
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}

const FORMAT_LABEL: Record<UploadFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  pdf: 'PDF',
  gif: 'GIF',
  webp: 'WebP',
  bmp: 'BMP',
  tiff: 'TIFF',
};

/** "50–200 KB · JPEG or PDF", for the side panel. `null` when there is nothing to say. */
export function describeUploadConstraints(
  constraints: UploadConstraints | null | undefined,
): string | null {
  if (!constraints) return null;
  const { minBytes, maxBytes, formats } = constraints;
  let size: string | null = null;
  if (minBytes !== null && maxBytes !== null) {
    const [low, high] = [formatSize(minBytes), formatSize(maxBytes)];
    size = low.endsWith(' KB') && high.endsWith(' KB') ? `${low.slice(0, -3)}–${high}` : `${low}–${high}`;
  } else if (maxBytes !== null) size = `up to ${formatSize(maxBytes)}`;
  else if (minBytes !== null) size = `at least ${formatSize(minBytes)}`;

  const labels = formats.map((format) => FORMAT_LABEL[format]);
  const kinds =
    labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels[0];

  const parts = [size, kinds, describeDimensions(constraints.dimensions)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "6 × 2 cm at 300 DPI", "200 × 230 px" — the way the page said it. */
export function describeDimensions(dimensions: UploadDimensions | null | undefined): string | null {
  if (!dimensions) return null;
  const { width, height, unit, dpi } = dimensions;
  const at = dpi ? ` at ${dpi} DPI` : '';
  if (unit === 'px') return `${width} × ${height} px${at}`;
  const cm = (mm: number) => Number((mm / 10).toFixed(2));
  return `${cm(width)} × ${cm(height)} cm${at}`;
}
