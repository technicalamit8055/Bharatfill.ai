/**
 * Embedded-text extraction from a PDF, with no dependency.
 * docs/AI_PIPELINE.md §2 — the local, non-AI reader.
 *
 * A PDF produced by a portal, a banking app or a word processor already carries its text; the
 * only things between us and it are Flate compression, the content-stream operator syntax, and
 * the font's `/ToUnicode` map. All three are cheap to handle with `node:zlib`, which is why this
 * exists instead of a dependency: it keeps the non-AI path genuinely offline and adds nothing to
 * the serverless bundle.
 *
 * The `/ToUnicode` map is not optional in practice. Browsers ("Save as PDF") and Word embed
 * subset Identity-H fonts, where a shown string is a run of two-byte glyph
 * ids that mean nothing without that map. Pages are walked from the page tree so each content
 * stream is decoded with the fonts its own resources name.
 *
 * What it deliberately does NOT do:
 *
 *   - it does not rasterise, so a *scanned* PDF (an image in a PDF wrapper) yields nothing,
 *   - it does not guess an encoding for a font that ships no `/ToUnicode` map, so a subset font
 *     with only a custom `/Encoding` still decodes to nonsense.
 *
 * The second case is the dangerous one: nonsense text would flow into the extractor and become
 * nonsense field proposals in front of an operator. So every result passes a plausibility guard
 * (`looksLikeProse`) and an implausible one is reported as "no text" rather than as text. A
 * caller that gets `null` should route the document to the AI vision reader instead.
 */

/** Exact byte-to-char identity mapping. Not `TextDecoder('latin1')`, which is windows-1252. */
function latin1(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let out = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plausibility guard
// ---------------------------------------------------------------------------

/**
 * Characters that appear in real document text.
 *
 * `\p{M}` is not decoration here. A Devanagari matra — the ि ी ा े in `सुनीता देवी` — is a
 * combining mark, not a letter, and a Hindi line is roughly a third marks by character count.
 * Leaving them out made the guard reject every Hindi document as nonsense.
 */
const PLAUSIBLE_CHAR = /[\p{L}\p{M}\p{N}\s.,:;/\\\-()[\]&'"#@+*%°₹|=?!]/u;
/** Marks count with letters for the same reason: they only ever attach to one. */
const LETTER = /[\p{L}\p{M}]/u;

const MIN_PLAUSIBLE_RATIO = 0.85;
const MIN_LETTER_RATIO = 0.35;
/** Below this there is nothing to judge, so nothing to trust either. */
const MIN_USEFUL_LENGTH = 12;

/**
 * True when the decoded string reads like document text rather than mis-decoded glyph ids.
 *
 * Two ratios, because the failure modes differ. A CID font decodes to control characters and
 * exotic symbols, which the plausible-character ratio catches. A wrongly-mapped simple font
 * decodes to printable-but-meaningless punctuation runs, which it does not — hence the second
 * check that a reasonable share of the text is actually letters.
 */
export function looksLikeProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_USEFUL_LENGTH) return false;

  const characters = [...trimmed];
  let plausible = 0;
  let letters = 0;
  for (const character of characters) {
    if (PLAUSIBLE_CHAR.test(character)) plausible += 1;
    if (LETTER.test(character)) letters += 1;
  }

  const total = characters.length;
  return plausible / total >= MIN_PLAUSIBLE_RATIO && letters / total >= MIN_LETTER_RATIO;
}

// ---------------------------------------------------------------------------
// Stream location and inflation
// ---------------------------------------------------------------------------

type RawStream = { dict: string; body: Uint8Array };

/**
 * Every `stream … endstream` region, paired with the dictionary that introduced it.
 *
 * `/Length` is not consulted: it is legally an indirect reference (`/Length 12 0 R`), so
 * trusting it would mean walking the xref table to read a stream. Scanning for the `endstream`
 * keyword needs neither, and a false positive is harmless — the inflate fails and the stream is
 * skipped.
 */
function findStreams(raw: string, bytes: Uint8Array): RawStream[] {
  const streams: RawStream[] = [];
  const keyword = /stream\r\n|stream\n|stream\r/g;

  for (let match = keyword.exec(raw); match !== null; match = keyword.exec(raw)) {
    // `endstream` also ends with the `stream` keyword; skip those matches.
    if (raw.startsWith('endstream', match.index - 3)) continue;

    const bodyStart = match.index + match[0].length;
    const bodyEnd = raw.indexOf('endstream', bodyStart);
    if (bodyEnd === -1) break;

    // The dictionary sits immediately before the keyword. 4 KB is far more than any real one.
    streams.push({
      dict: raw.slice(Math.max(0, match.index - 4096), match.index),
      body: bytes.subarray(bodyStart, bodyEnd),
    });

    keyword.lastIndex = bodyEnd;
  }

  return streams;
}

/** Streams that cannot hold page text, skipped before spending an inflate on them. */
function isTextBearing(dict: string): boolean {
  const tail = dict.slice(-2048);
  if (/\/Subtype\s*\/Image\b/.test(tail)) return false;
  // Embedded font programmes, colour profiles, attachments and metadata.
  return !/\/(FontFile\d?|Type1C|CIDFontType0C|ICCBased|EmbeddedFile|Metadata)\b/.test(tail);
}

async function inflate(body: Uint8Array): Promise<Uint8Array | null> {
  // Imported lazily so a bundler never pulls `node:zlib` into a client graph on a stray import.
  const zlib = await import('node:zlib');

  // Trailing whitespace before `endstream` is permitted by the spec and rejected by zlib.
  let end = body.length;
  while (end > 0) {
    const byte = body[end - 1];
    if (byte === 0x0a || byte === 0x0d || byte === 0x20) end -= 1;
    else break;
  }
  const trimmed = body.subarray(0, end);

  for (const decompress of [zlib.inflateSync, zlib.inflateRawSync] as const) {
    try {
      return new Uint8Array(decompress(trimmed));
    } catch {
      // Wrong wrapper, wrong filter, or a false-positive `endstream`. Try the next shape.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Content-stream operators
// ---------------------------------------------------------------------------

const LITERAL_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
};

/** Decodes a PDF literal string body — the part between the outer parentheses. */
function decodeLiteral(body: string): string {
  let out = '';

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] as string;

    if (character !== '\\') {
      out += character;
      continue;
    }

    const next = body[index + 1];
    if (next === undefined) break;

    // A backslash before a line break is a continuation: both characters vanish.
    if (next === '\n') {
      index += 1;
      continue;
    }
    if (next === '\r') {
      index += body[index + 2] === '\n' ? 2 : 1;
      continue;
    }

    const simple = LITERAL_ESCAPES[next];
    if (simple !== undefined) {
      out += simple;
      index += 1;
      continue;
    }

    const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1, index + 4))?.[0];
    if (octal !== undefined) {
      out += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }

    // An escape the spec does not define: the backslash is dropped, the character kept.
    out += next;
    index += 1;
  }

  return out;
}

function decodeHex(body: string): string {
  const digits = body.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let index = 0; index + 1 < digits.length; index += 2) {
    out += String.fromCharCode(Number.parseInt(digits.slice(index, index + 2), 16));
  }
  // An odd trailing digit is padded with zero (PDF 32000-1 §7.3.4.3).
  if (digits.length % 2 === 1) {
    out += String.fromCharCode(Number.parseInt(`${digits.slice(-1)}0`, 16));
  }
  return out;
}

const SHOWS_TEXT = /\b(?:Tj|TJ)\b|\bBT\b/;

/** Whitespace and the delimiters that end a bare token (PDF 32000-1 §7.2.2). */
const TOKEN_END = /[\s()<>[\]{}/%]/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
/**
 * How far, in text-space units, a baseline may drift and still be the same printed line. Runs on
 * one line share a baseline exactly; anything above this is a new line, or a sub/superscript.
 */
const SAME_LINE_TOLERANCE = 1;

/** Turns the raw bytes of a shown string into text, for one font. */
export type FontDecoder = { decode(raw: string): string };

/**
 * Text out of one decoded content stream.
 *
 * A hand-written scanner rather than a regex sweep, because a `)` inside a literal string is
 * ordinary — `(Shri (Jr.) Kumar)` is one string — and no regex tracks that nesting.
 *
 * Lines are decided by the baseline, not by which operator moved the cursor. Browsers split one
 * printed line into several runs with small sideways `Td` moves — sometimes mid-word, "EDUCA" then
 * "TION" — and Word gives each run its own `BT … Tm … ET` block on the same baseline. Treating
 * every move as a line break would scatter "Name: Sunita Devi" over three lines and lose the
 * label. So a run on the same baseline joins the current line: directly after a relative `Td`
 * (the run continues), or after a space following an absolute `Tm` (it is a new column).
 *
 * `fonts` maps a resource name (`/F1`) to its decoder. A run in a font with no decoder is read
 * byte-for-character, as a simple font's text usually is; the caller's plausibility guard is what
 * stops that from ever reaching an operator as nonsense.
 */
export function readContentStreamText(
  content: string,
  fonts?: ReadonlyMap<string, FontDecoder>,
): string {
  const lines: string[] = [];
  let line = '';
  /** Baseline of the text on `line`; null until something has been shown. */
  let lineY: number | null = null;

  // Text state. Only what decides a line break is tracked: the baseline, the vertical scale a
  // relative move is multiplied by, and the leading `T*` moves by.
  let y = 0;
  let scaleY = 1;
  let leading = 0;
  /** The next run was placed with `Tm`/`BT` rather than nudged along with `Td`. */
  let placedAbsolutely = true;
  /** `T*`, `'` and `"` always start a new line, whatever the baseline arithmetic says. */
  let forceBreak = false;
  let decoder: FontDecoder | undefined;

  /** Numbers and names seen since the last operator. */
  let operands: string[] = [];
  /** Strings seen since the last operator, so `[…] TJ` and `(…) Tj` behave the same. */
  let pendingStrings: string[] = [];

  function endLine() {
    const text = line.replace(/[ \t]+/g, ' ').trim();
    if (text !== '') lines.push(text);
    line = '';
  }

  function show() {
    const text = pendingStrings
      .map((raw) => (decoder === undefined ? raw : decoder.decode(raw)))
      .join('');
    if (text === '') return;

    if (lineY === null || forceBreak || Math.abs(y - lineY) > SAME_LINE_TOLERANCE) {
      endLine();
      line = text;
      lineY = y;
    } else {
      if (placedAbsolutely && !/\s$/.test(line) && !/^\s/.test(text)) line += ' ';
      line += text;
    }
    placedAbsolutely = false;
    forceBreak = false;
  }

  function numbers(): number[] {
    return operands.filter((operand) => NUMBER.test(operand)).map(Number);
  }

  function nextLine() {
    y -= leading * scaleY;
    forceBreak = true;
  }

  function flushOperator(operator: string) {
    switch (operator) {
      case 'Tf': {
        const name = operands.find((operand) => operand.startsWith('/'));
        decoder = name === undefined ? undefined : fonts?.get(name.slice(1));
        break;
      }
      case 'BT':
        y = 0;
        scaleY = 1;
        placedAbsolutely = true;
        break;
      case 'Tm': {
        const matrix = numbers();
        if (matrix.length === 6) {
          scaleY = matrix[3] as number;
          y = matrix[5] as number;
        }
        placedAbsolutely = true;
        break;
      }
      case 'Td':
      case 'TD': {
        const [, ty] = numbers();
        if (ty !== undefined) {
          y += ty * scaleY;
          if (operator === 'TD') leading = -ty;
        }
        break;
      }
      case 'TL':
        leading = numbers()[0] ?? leading;
        break;
      case 'T*':
        nextLine();
        break;
      case 'Tj':
      case 'TJ':
        show();
        break;
      // Both move to the next line before showing their string.
      case "'":
      case '"':
        nextLine();
        show();
        break;
      default:
        break;
    }
    operands = [];
    pendingStrings = [];
  }

  let token = '';
  function endToken() {
    if (token === '') return;
    if (NUMBER.test(token)) operands.push(token);
    else flushOperator(token);
    token = '';
  }

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] as string;

    if (!TOKEN_END.test(character)) {
      token += character;
      continue;
    }

    // An inline image's data is binary and may contain anything, including `Tj`. Skip to `EI`.
    if (token === 'ID') {
      token = '';
      operands = [];
      const end = content.slice(index).search(/\sEI(?=\s|$)/);
      if (end === -1) break;
      index += end + 3;
      continue;
    }
    endToken();

    if (character === '/') {
      let cursor = index + 1;
      while (cursor < content.length && !TOKEN_END.test(content[cursor] as string)) cursor += 1;
      operands.push(content.slice(index, cursor));
      index = cursor - 1;
      continue;
    }

    if (character === '%') {
      const newline = content.slice(index).search(/[\r\n]/);
      if (newline === -1) break;
      index += newline;
      continue;
    }

    if (character === '(') {
      // Scan to the matching close paren, honouring nesting and backslash escapes.
      let depth = 1;
      let cursor = index + 1;
      let body = '';
      while (cursor < content.length && depth > 0) {
        const inner = content[cursor] as string;
        if (inner === '\\') {
          body += inner + (content[cursor + 1] ?? '');
          cursor += 2;
          continue;
        }
        if (inner === '(') depth += 1;
        else if (inner === ')') depth -= 1;
        if (depth > 0) body += inner;
        cursor += 1;
      }
      pendingStrings.push(decodeLiteral(body));
      index = cursor - 1;
      continue;
    }

    // `<<` opens a dictionary (a marked-content property list, here); skip both brackets.
    if (character === '<' && content[index + 1] === '<') {
      index += 1;
      continue;
    }

    // A lone `<` opens a hex string.
    if (character === '<') {
      const close = content.indexOf('>', index + 1);
      if (close === -1) break;
      pendingStrings.push(decodeHex(content.slice(index + 1, close)));
      index = close;
      continue;
    }

  }

  endToken();
  endLine();

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Font encodings — /ToUnicode CMaps
// ---------------------------------------------------------------------------

/**
 * Past this many entries a "CMap" is not describing a font. A real subset font maps a few hundred
 * glyphs; a full CJK font maps tens of thousands. The cap keeps a hostile `<0000> <FFFFFFFF>`
 * range from becoming a memory problem.
 */
const MAX_CMAP_ENTRIES = 100_000;

function hexDigits(token: string): string {
  return token.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

/** A `/ToUnicode` destination: UTF-16BE, so one or more 4-digit code units. */
function utf16(hex: string): string {
  if (hex.length <= 2) return String.fromCharCode(Number.parseInt(hex || '0', 16));
  let out = '';
  for (let index = 0; index + 3 < hex.length; index += 4) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return out;
}

/**
 * Parses a `/ToUnicode` CMap (PDF 32000-1 §9.10.3) into a decoder.
 *
 * `defaultWidth` is the code width in bytes when the map declares no codespace: 2 for a Type0
 * (CID) font, 1 for a simple font. A code the map does not cover decodes to U+FFFD, which the
 * plausibility guard counts against the text — a font that maps half its glyphs is not a font
 * whose text should be trusted.
 */
export function parseToUnicodeCMap(cmap: string, defaultWidth: 1 | 2): FontDecoder | null {
  const map = new Map<string, string>();
  const widths = new Set<number>();

  for (const block of cmap.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const range of (block[1] ?? '').matchAll(/<([^>]*)>\s*<([^>]*)>/g)) {
      const width = hexDigits(range[1] ?? '').length / 2;
      if (width >= 1 && width <= 4) widths.add(width);
    }
  }

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? '').matchAll(/<([^>]*)>\s*<([^>]*)>/g)) {
      const source = hexDigits(pair[1] ?? '');
      map.set(source, utf16(hexDigits(pair[2] ?? '')));
      if (map.size > MAX_CMAP_ENTRIES) return null;
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const entries = (block[1] ?? '').matchAll(/<([^>]*)>\s*<([^>]*)>\s*(<[^>]*>|\[[^\]]*\])/g);
    for (const entry of entries) {
      const lowHex = hexDigits(entry[1] ?? '');
      const low = Number.parseInt(lowHex || '0', 16);
      const high = Number.parseInt(hexDigits(entry[2] ?? '') || '0', 16);
      const destination = entry[3] ?? '';
      if (high < low || map.size + (high - low) > MAX_CMAP_ENTRIES) return null;

      const list = destination.startsWith('[')
        ? [...destination.matchAll(/<([^>]*)>/g)].map((item) => utf16(hexDigits(item[1] ?? '')))
        : null;
      const base = list === null ? hexDigits(destination) : '';

      for (let code = low; code <= high; code += 1) {
        const source = code.toString(16).toUpperCase().padStart(lowHex.length, '0');
        if (list !== null) {
          const value = list[code - low];
          if (value !== undefined) map.set(source, value);
          continue;
        }
        // The destination's last code unit counts up with the source code.
        const units = utf16(base);
        const last = units.charCodeAt(units.length - 1) + (code - low);
        map.set(source, units.slice(0, -1) + String.fromCharCode(last));
      }
    }
  }

  if (map.size === 0) return null;
  const codeWidths = widths.size > 0 ? [...widths].sort((a, b) => a - b) : [defaultWidth];

  return {
    decode(raw: string): string {
      let out = '';
      let index = 0;
      while (index < raw.length) {
        let matched = false;
        for (const width of codeWidths) {
          if (index + width > raw.length) break;
          let key = '';
          for (let offset = 0; offset < width; offset += 1) {
            key += raw.charCodeAt(index + offset).toString(16).toUpperCase().padStart(2, '0');
          }
          const value = map.get(key);
          if (value !== undefined) {
            out += value;
            index += width;
            matched = true;
            break;
          }
        }
        if (!matched) {
          out += '�';
          index += codeWidths[codeWidths.length - 1] as number;
        }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Object graph — just enough to walk pages, their fonts and their form XObjects
// ---------------------------------------------------------------------------

type PdfObject = { dict: string; stream: Uint8Array | null };

/**
 * Every `n g obj … endobj`, including those packed inside compressed object streams (`/ObjStm`),
 * which Word and most PDF libraries use for fonts and page dictionaries.
 *
 * A later definition of the same number wins, which is what an incremental update means.
 */
async function indexObjects(raw: string, bytes: Uint8Array): Promise<Map<number, PdfObject>> {
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  const streamKeyword = /\bstream(?:\r\n|\n|\r)/g;

  for (let match = header.exec(raw); match !== null; match = header.exec(raw)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endobj', start);
    if (end === -1) break;

    streamKeyword.lastIndex = start;
    const stream = streamKeyword.exec(raw);
    if (stream !== null && stream.index < end) {
      const bodyStart = stream.index + stream[0].length;
      const bodyEnd = raw.indexOf('endstream', bodyStart);
      if (bodyEnd === -1) break;
      objects.set(Number(match[1]), {
        dict: raw.slice(start, stream.index),
        stream: bytes.subarray(bodyStart, bodyEnd),
      });
      header.lastIndex = bodyEnd;
      continue;
    }

    objects.set(Number(match[1]), { dict: raw.slice(start, end), stream: null });
    header.lastIndex = end;
  }

  for (const object of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm\b/.test(object.dict)) continue;
    const decoded = await decodeStream(object);
    if (decoded === null) continue;

    const text = latin1(decoded);
    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? Number.NaN);
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? Number.NaN);
    if (!Number.isFinite(first) || !Number.isFinite(count)) continue;

    const pairs = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let index = 0; index < count; index += 1) {
      const number = pairs[index * 2];
      const offset = pairs[index * 2 + 1];
      if (number === undefined || offset === undefined) break;
      const next = pairs[index * 2 + 3];
      // A direct definition is newer than a packed one only in a hybrid file; keep the direct one.
      if (objects.has(number)) continue;
      objects.set(number, {
        dict: text.slice(first + offset, next === undefined ? undefined : first + next),
        stream: null,
      });
    }
  }

  return objects;
}

/** The stream's decoded bytes, when its filter is one this reader knows (none, or Flate). */
async function decodeStream(object: PdfObject): Promise<Uint8Array | null> {
  if (object.stream === null) return null;
  const filter = /\/Filter\s*(\/\w+|\[[^\]]*\])/.exec(object.dict)?.[1];
  if (filter === undefined) return object.stream;
  const filters = filter.match(/\/\w+/g) ?? [];
  if (filters.length === 1 && filters[0] === '/FlateDecode') return inflate(object.stream);
  return null;
}

/** The raw value after `/key` in a dictionary: a dict, an array, a reference or a bare token. */
function dictValue(dict: string, key: string): string | null {
  const found = new RegExp(`/${key}(?![A-Za-z0-9#])`).exec(dict);
  if (found === null) return null;

  let index = found.index + found[0].length;
  while (index < dict.length && /\s/.test(dict[index] as string)) index += 1;

  const opener = dict.slice(index, index + 2) === '<<' ? '<<' : dict[index];
  if (opener === '<<' || opener === '[') {
    const [open, close] = opener === '<<' ? ['<<', '>>'] : ['[', ']'];
    let depth = 0;
    for (let cursor = index; cursor < dict.length; cursor += 1) {
      if (dict.startsWith(open, cursor)) {
        depth += 1;
        cursor += open.length - 1;
      } else if (dict.startsWith(close, cursor)) {
        depth -= 1;
        cursor += close.length - 1;
        if (depth === 0) return dict.slice(index, cursor + 1);
      }
    }
    return null;
  }

  const reference = /^(\d+)\s+(\d+)\s+R\b/.exec(dict.slice(index));
  if (reference !== null) return reference[0];
  return /^[^\s/<>[\]()]*(?:\/[^\s/<>[\]()]*)?/.exec(dict.slice(index))?.[0] ?? null;
}

const REFERENCE = /(\d+)\s+\d+\s+R\b/g;

function deref(objects: Map<number, PdfObject>, value: string | null): PdfObject | null {
  if (value === null) return null;
  const reference = /^(\d+)\s+\d+\s+R$/.exec(value.trim());
  if (reference === null) return { dict: value, stream: null };
  return objects.get(Number(reference[1])) ?? null;
}

/** `/Name 12 0 R` entries of a resource sub-dictionary (`/Font`, `/XObject`). */
function namedReferences(dict: string): [string, number][] {
  return [...dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R\b/g)].map(
    (match) => [match[1] as string, Number(match[2])] as [string, number],
  );
}

/** Page objects in reading order: the page tree from the catalog, else file order. */
function pagesInOrder(objects: Map<number, PdfObject>): PdfObject[] {
  const isPage = (object: PdfObject) => /\/Type\s*\/Page(?![sA-Za-z])/.test(object.dict);

  const catalog = [...objects.values()].find((object) => /\/Type\s*\/Catalog\b/.test(object.dict));
  const root = catalog === undefined ? null : deref(objects, dictValue(catalog.dict, 'Pages'));

  const ordered: PdfObject[] = [];
  const seen = new Set<PdfObject>();
  function walk(node: PdfObject | null, depth: number) {
    if (node === null || depth > 32 || seen.has(node)) return;
    seen.add(node);
    if (isPage(node)) {
      ordered.push(node);
      return;
    }
    const kids = dictValue(node.dict, 'Kids') ?? '';
    for (const kid of kids.matchAll(REFERENCE)) walk(objects.get(Number(kid[1])) ?? null, depth + 1);
  }
  walk(root, 0);

  return ordered.length > 0 ? ordered : [...objects.values()].filter(isPage);
}

/** A page's `/Resources`, inherited from its ancestors when the page has none of its own. */
function resourcesOf(objects: Map<number, PdfObject>, node: PdfObject): string {
  let current: PdfObject | null = node;
  for (let depth = 0; current !== null && depth < 32; depth += 1) {
    const own = deref(objects, dictValue(current.dict, 'Resources'));
    if (own !== null) return own.dict;
    current = deref(objects, dictValue(current.dict, 'Parent'));
  }
  return '';
}

/**
 * The text of one content stream plus the form XObjects its resources hold.
 *
 * Forms are read after the stream that paints them rather than at their `Do`, which can put a
 * stamped block out of order — a cost worth paying to keep the scanner single-pass. Text inside a
 * form would otherwise be lost entirely, and templated certificates put whole sections there.
 *
 * `readForms` is shared across the page: a form with no `/Resources` of its own inherits the
 * page's, which list that same form, and it must not be read a second time.
 */
async function readWithResources(
  objects: Map<number, PdfObject>,
  content: string,
  resources: string,
  decoders: Map<number, FontDecoder | null>,
  readForms: Set<number>,
  depth: number,
): Promise<string> {
  const fonts = new Map<string, FontDecoder>();
  const fontDict = deref(objects, dictValue(resources, 'Font'));
  for (const [name, number] of namedReferences(fontDict?.dict ?? '')) {
    if (!decoders.has(number)) decoders.set(number, await fontDecoder(objects, number));
    const decoder = decoders.get(number);
    if (decoder) fonts.set(name, decoder);
  }

  const parts = [readContentStreamText(content, fonts)];

  if (depth < 4) {
    const xobjects = deref(objects, dictValue(resources, 'XObject'));
    for (const [, number] of namedReferences(xobjects?.dict ?? '')) {
      const form = objects.get(number);
      if (form === undefined || readForms.has(number)) continue;
      if (!/\/Subtype\s*\/Form\b/.test(form.dict)) continue;
      readForms.add(number);
      const decoded = await decodeStream(form);
      if (decoded === null) continue;
      const formResources = deref(objects, dictValue(form.dict, 'Resources'))?.dict ?? resources;
      parts.push(
        await readWithResources(
          objects,
          latin1(decoded),
          formResources,
          decoders,
          readForms,
          depth + 1,
        ),
      );
    }
  }

  return parts.filter((part) => part !== '').join('\n');
}

async function fontDecoder(
  objects: Map<number, PdfObject>,
  number: number,
): Promise<FontDecoder | null> {
  const font = objects.get(number);
  if (font === undefined) return null;
  const toUnicode = deref(objects, dictValue(font.dict, 'ToUnicode'));
  if (toUnicode === null) return null;
  const decoded = await decodeStream(toUnicode);
  if (decoded === null) return null;
  const width = /\/Subtype\s*\/Type0\b/.test(font.dict) ? 2 : 1;
  return parseToUnicodeCMap(latin1(decoded), width);
}

/** Text read page by page, each content stream decoded with its own fonts. */
async function readPages(raw: string, bytes: Uint8Array): Promise<string> {
  const objects = await indexObjects(raw, bytes);
  const decoders = new Map<number, FontDecoder | null>();
  const pages: string[] = [];

  for (const page of pagesInOrder(objects)) {
    const targets: PdfObject[] = [];
    for (const reference of (dictValue(page.dict, 'Contents') ?? '').matchAll(REFERENCE)) {
      const object = objects.get(Number(reference[1]));
      if (object === undefined) continue;
      if (object.stream !== null) {
        targets.push(object);
        continue;
      }
      // `/Contents 9 0 R` may point at an array object rather than at a stream.
      for (const inner of object.dict.matchAll(REFERENCE)) {
        const stream = objects.get(Number(inner[1]));
        if (stream !== undefined) targets.push(stream);
      }
    }

    const streams: string[] = [];
    for (const target of targets) {
      const decoded = await decodeStream(target);
      if (decoded !== null) streams.push(latin1(decoded));
    }

    // A page's content streams are one stream split at arbitrary token boundaries.
    const resources = resourcesOf(objects, page);
    const text = await readWithResources(
      objects,
      streams.join('\n'),
      resources,
      decoders,
      new Set(),
      0,
    );
    if (text !== '') pages.push(text);
  }

  return pages.join('\n');
}

/** The old sweep: every text-bearing stream, no fonts. Kept for files the page walk cannot parse. */
async function readAllStreams(raw: string, bytes: Uint8Array): Promise<string> {
  const chunks: string[] = [];

  for (const stream of findStreams(raw, bytes)) {
    if (!isTextBearing(stream.dict)) continue;

    const decoded = /\/FlateDecode\b/.test(stream.dict) ? await inflate(stream.body) : stream.body;
    if (decoded === null) continue;

    const content = latin1(decoded);
    // A content stream is operators; one with no text-showing operator has nothing for us.
    if (!SHOWS_TEXT.test(content)) continue;

    const text = readContentStreamText(content);
    if (text !== '') chunks.push(text);
  }

  return chunks.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type PdfTextResult = {
  /** Extracted text, one printed line per line. Never returned unless it reads like prose. */
  text: string;
  /** `/Type /Page` count, or 1 when the structure could not be counted. */
  pageCount: number;
};

export function looksLikePdf(bytes: Uint8Array): boolean {
  return latin1(bytes.subarray(0, 8)).startsWith('%PDF-');
}

function countPages(raw: string): number {
  const matches = raw.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  return matches === null || matches.length === 0 ? 1 : matches.length;
}

/**
 * Reads the text a PDF already carries.
 *
 * Returns `null` — meaning "this PDF has no text I can trust" — for a scanned page, an
 * encrypted file, or text that decoded to nonsense. That is a routable answer, not an error:
 * the caller escalates to the AI vision reader or tells the operator to send an image.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult | null> {
  if (!looksLikePdf(bytes)) return null;

  const raw = latin1(bytes);

  // An encrypted PDF inflates to ciphertext, which the guard would reject anyway — but bailing
  // here keeps the reason honest rather than reporting "no text found".
  if (/\/Encrypt\b/.test(raw)) return null;

  // The page walk first, because it is the only reader that knows each page's fonts. The sweep
  // is the fallback for a file whose structure the walk cannot follow.
  for (const read of [readPages, readAllStreams]) {
    const decoded = (await read(raw, bytes)).replace(/\n{3,}/g, '\n\n').trim();
    // Judged before repair: dropping unreadable glyphs first could turn a broken font's output
    // into something that merely looks plausible.
    if (!looksLikeProse(decoded)) continue;

    const text = repairDevanagari(decoded);
    if (looksLikeProse(text)) return { text, pageCount: countPages(raw) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Devanagari repair
// ---------------------------------------------------------------------------

const CONSONANT = '[\\u0915-\\u0939\\u0958-\\u095F]\\u093C?';
/** A consonant cluster: consonants joined by a virama, ending in a full consonant. */
const CLUSTER = `(?:${CONSONANT}\\u094D)*${CONSONANT}`;
/** ि where typed text can never have one: not straight after a consonant or nukta. */
const VISUAL_ORDER_I = /(?<![क-हक़-य़]|़)ि/u;
const LEADING_I = new RegExp(`\\u093F(${CLUSTER})`, 'gu');
/** Unreadable glyphs: what an unmapped code or a glyph mapped to nothing decodes to. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const UNREADABLE = /[�\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;
/** A Devanagari word, with any unreadable glyph that is part of it. */
const DEVANAGARI_WORD = /[ऀ-ॿ�‌‍]*[ऀ-ॿ][ऀ-ॿ�‌‍]*/gu;

/**
 * Makes Devanagari read from a PDF either right or absent — never plausibly wrong.
 *
 * A PDF records glyphs in the order they are drawn, and Devanagari is not drawn in the order it
 * is typed. Two consequences:
 *
 *   - The short-i sign ि is drawn *before* its consonant, so `किरण` arrives as `िकरण`. When the
 *     text shows ि anywhere typed text cannot have it, the whole text is in drawn order and every
 *     ि is moved after its consonant cluster. Text already in typed order never trips the test,
 *     and is left alone.
 *   - Conjuncts and the reph (`स्थ`, `श्र`, the `र्` above `शर्मा`) are often single glyphs the
 *     font's map leaves empty. That is lost information: `शर्मा` arrives as `शमा` plus nothing.
 *     Proposing `शमा` as a name would be worse than proposing no name, so on any line with an
 *     unreadable glyph *every* Devanagari word is removed — keeping the readable ones would turn
 *     `राम शर्मा` into a confident `राम`. Latin text on the line is kept; a line whose Latin text
 *     is itself unreadable is dropped.
 *
 * Every Devanagari field still goes to a human (the local reader sits below the high-confidence
 * band); this is what keeps that human from being shown a subtly wrong spelling.
 */
export function repairDevanagari(text: string): string {
  const ordered = VISUAL_ORDER_I.test(text) ? text.replace(LEADING_I, '$1ि') : text;

  return ordered
    .split('\n')
    .flatMap((line) => {
      UNREADABLE.lastIndex = 0;
      if (!UNREADABLE.test(line)) return [line];

      const kept = line.replace(UNREADABLE, '�').replace(DEVANAGARI_WORD, '');
      if (kept.includes('�')) return [];
      // Separators a removed Hindi label leaves behind: "नाम / Name" → " / Name".
      const tidied = kept
        .replace(/^[\s/|:,-]+/, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
      return tidied === '' ? [] : [tidied];
    })
    .join('\n');
}
