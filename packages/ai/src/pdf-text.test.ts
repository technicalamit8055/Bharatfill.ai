/**
 * Tests for the dependency-free PDF text reader.
 *
 * The point of interest is not "does it read a PDF" — it is the guard. This reader has no font
 * machinery, so a subset or CID font decodes to nonsense, and nonsense that reaches the
 * extractor becomes nonsense field proposals in front of an operator. So the assertions that
 * matter most are the ones proving it says "no text" instead of handing back rubbish.
 */

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractPdfText, looksLikePdf, looksLikeProse, readContentStreamText } from './pdf-text';

const encoder = new TextEncoder();

/** Characters 0x01–0x18: what an unresolvable Identity-H subset font decodes to here. */
const GLYPH_IDS = Array.from({ length: 24 }, (_unused, index) =>
  String.fromCharCode(index + 1),
).join('');

/**
 * A minimal but structurally real single-page PDF wrapping one content stream.
 * `/Length` is deliberately wrong, because in the wild it is often an indirect reference and the
 * reader must not depend on it.
 */
function pdfWith(
  content: string,
  options: { compress?: boolean; pages?: number } = {},
): Uint8Array {
  const body = options.compress === false ? encoder.encode(content) : deflateSync(content);
  const filter = options.compress === false ? '' : ' /Filter /FlateDecode';

  const pageObjects = Array.from(
    { length: options.pages ?? 1 },
    (_unused, index) =>
      `${3 + index} 0 obj << /Type /Page /Parent 2 0 R /Contents 99 0 R >> endobj`,
  ).join('\n');

  const head = encoder.encode(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Count 1 >> endobj',
      pageObjects,
      `99 0 obj << /Length 0 0 R${filter} >>`,
      'stream\n',
    ].join('\n'),
  );
  const tail = encoder.encode('\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

  const out = new Uint8Array(head.length + body.length + tail.length);
  out.set(head, 0);
  out.set(body, head.length);
  out.set(tail, head.length + body.length);
  return out;
}

const TWO_LINE_CONTENT = [
  'BT',
  '/F1 12 Tf',
  '72 720 Td',
  '(Name: Sunita Devi) Tj',
  '0 -18 Td',
  "(Father's Name: Ram Prasad) Tj",
  'ET',
].join('\n');

describe('readContentStreamText', () => {
  it('reads a string shown with Tj', () => {
    expect(readContentStreamText('BT (Income Certificate) Tj ET')).toBe('Income Certificate');
  });

  it('joins the pieces of a TJ array into one line', () => {
    // Kerned text is one printed line split into many strings; rejoining it is the whole job.
    expect(readContentStreamText('BT [(Annual) -250 ( Income) -250 (: 120000)] TJ ET')).toBe(
      'Annual Income: 120000',
    );
  });

  it('treats a cursor move as a line break', () => {
    expect(readContentStreamText(TWO_LINE_CONTENT)).toBe(
      "Name: Sunita Devi\nFather's Name: Ram Prasad",
    );
  });

  it('keeps a parenthesis that belongs to the text', () => {
    // `(Shri (Jr.) Kumar)` is one string. A regex sweep would stop at the first inner `)`.
    expect(readContentStreamText('BT (Name: Shri (Jr.) Kumar) Tj ET')).toBe(
      'Name: Shri (Jr.) Kumar',
    );
  });

  it('decodes escapes and octal codes in a literal string', () => {
    expect(readContentStreamText('BT (A\\(B\\) C\\101) Tj ET')).toBe('A(B) CA');
  });

  it('decodes a hex string', () => {
    expect(readContentStreamText('BT <50414E> Tj ET')).toBe('PAN');
  });

  it('does not mistake a dictionary for a hex string', () => {
    expect(readContentStreamText('<< /A 1 >> BT (Ward 4) Tj ET')).toBe('Ward 4');
  });
});

describe('looksLikeProse', () => {
  it('accepts printed document text', () => {
    expect(looksLikeProse('Name: Sunita Devi')).toBe(true);
  });

  it('accepts Devanagari', () => {
    expect(looksLikeProse('नाम : सुनीता देवी')).toBe(true);
  });

  it('rejects the control characters a CID font decodes to', () => {
    expect(looksLikeProse(GLYPH_IDS)).toBe(false);
  });

  it('rejects printable punctuation runs from a wrongly-mapped simple font', () => {
    expect(looksLikeProse('#$%^&*(){}[]<>|~+=_-/\\@!?;:,.')).toBe(false);
  });

  it('rejects a string too short to judge', () => {
    expect(looksLikeProse('Name')).toBe(false);
  });
});

describe('extractPdfText', () => {
  it('reads a compressed content stream', async () => {
    const result = await extractPdfText(pdfWith(TWO_LINE_CONTENT));
    expect(result?.text).toBe("Name: Sunita Devi\nFather's Name: Ram Prasad");
  });

  it('reads an uncompressed content stream', async () => {
    const result = await extractPdfText(pdfWith(TWO_LINE_CONTENT, { compress: false }));
    expect(result?.text).toContain('Sunita Devi');
  });

  it('counts pages without counting the /Pages node', async () => {
    const result = await extractPdfText(pdfWith(TWO_LINE_CONTENT, { pages: 3 }));
    expect(result?.pageCount).toBe(3);
  });

  it('reports no text for a scan — an image with no text operators', async () => {
    // What a phone-photo-in-a-PDF actually looks like: one image XObject, nothing to read.
    expect(await extractPdfText(pdfWith('q 595 0 0 842 0 0 cm /Im0 Do Q'))).toBeNull();
  });

  it('reports no text rather than nonsense when the font encoding cannot be resolved', async () => {
    const hex = [...GLYPH_IDS]
      .map((character) => character.charCodeAt(0).toString(16).padStart(4, '0'))
      .join('');
    expect(await extractPdfText(pdfWith(`BT <${hex}> Tj ET`))).toBeNull();
  });

  it('refuses an encrypted PDF instead of returning ciphertext', async () => {
    const marked = String.fromCharCode(...pdfWith(TWO_LINE_CONTENT)).replace(
      '/Root',
      '/Encrypt 5 0 R /Root',
    );
    const bytes = Uint8Array.from(marked, (character) => character.charCodeAt(0));
    expect(await extractPdfText(bytes)).toBeNull();
  });

  it('returns null for anything that is not a PDF', async () => {
    expect(await extractPdfText(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(await extractPdfText(new Uint8Array())).toBeNull();
  });
});

describe('looksLikePdf', () => {
  it('recognises the magic bytes and nothing else', () => {
    expect(looksLikePdf(encoder.encode('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(encoder.encode('Name: Sunita'))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});
