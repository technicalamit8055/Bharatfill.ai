/**
 * Embedded-text extraction from a PDF, with no dependency.
 * docs/AI_PIPELINE.md §2 — the local, non-AI reader.
 *
 * A PDF produced by a portal, a banking app or a word processor already carries its text; the
 * only thing between us and it is Flate compression and the content-stream operator syntax.
 * Both are cheap to handle with `node:zlib`, which is why this exists instead of a dependency:
 * it keeps the non-AI path genuinely offline and adds nothing to the serverless bundle.
 *
 * What it deliberately does NOT do:
 *
 *   - it does not rasterise, so a *scanned* PDF (an image in a PDF wrapper) yields nothing,
 *   - it does not resolve font encodings, so a subset font with a custom `/Encoding` or an
 *     Identity-H CID font decodes to nonsense.
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

const OPERATOR_CHAR = /[A-Za-z*'"]/;
const SHOWS_TEXT = /\b(?:Tj|TJ)\b|\bBT\b/;

/**
 * Text out of one decoded content stream.
 *
 * A hand-written scanner rather than a regex sweep, because a `)` inside a literal string is
 * ordinary — `(Shri (Jr.) Kumar)` is one string — and no regex tracks that nesting.
 * Positioning operators become line breaks: `Td`/`TD`/`T*`/`Tm` move the cursor, and on a
 * printed form that almost always means a new line or a new column.
 */
export function readContentStreamText(content: string): string {
  const lines: string[] = [];
  /** Strings collected since the last positioning operator. */
  let line: string[] = [];
  /** Operands seen since the last operator, so `[…] TJ` and `(…) Tj` behave the same. */
  let pendingStrings: string[] = [];
  let token = '';

  function endLine() {
    const text = line
      .join('')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (text !== '') lines.push(text);
    line = [];
  }

  function flushOperator(operator: string) {
    switch (operator) {
      case 'Tj':
      case 'TJ':
        line.push(...pendingStrings);
        break;
      // Both move to the next line before showing their string.
      case "'":
      case '"':
        endLine();
        line.push(...pendingStrings);
        break;
      case 'Td':
      case 'TD':
      case 'T*':
      case 'Tm':
      case 'BT':
      case 'ET':
        endLine();
        break;
      default:
        break;
    }
    pendingStrings = [];
  }

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] as string;

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
      token = '';
      continue;
    }

    // `<<` opens a dictionary; a lone `<` opens a hex string.
    if (character === '<' && content[index + 1] !== '<') {
      const close = content.indexOf('>', index + 1);
      if (close === -1) break;
      pendingStrings.push(decodeHex(content.slice(index + 1, close)));
      index = close;
      token = '';
      continue;
    }

    if (OPERATOR_CHAR.test(character)) {
      token += character;
      continue;
    }

    if (token !== '') {
      flushOperator(token);
      token = '';
    }
  }

  if (token !== '') flushOperator(token);
  endLine();

  return lines.join('\n');
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

  const text = chunks
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!looksLikeProse(text)) return null;

  return { text, pageCount: countPages(raw) };
}
