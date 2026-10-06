/**
 * Tests for the dependency-free PDF text reader.
 *
 * Two things matter. That it reads what real PDFs actually contain — browser and Word output is
 * subset Identity-H fonts behind a `/ToUnicode` map, with one printed line split into many runs —
 * and, more, the guard: a font it cannot decode must produce "no text", and Devanagari it can
 * only partly decode must produce no Hindi, never a plausible misspelling in front of an operator.
 */

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  extractPdfText,
  looksLikePdf,
  looksLikeProse,
  parseToUnicodeCMap,
  readContentStreamText,
  repairDevanagari,
  type FontDecoder,
} from './pdf-text';

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

// ---------------------------------------------------------------------------
// Real-world PDFs: subset CID fonts, runs split along a line
// ---------------------------------------------------------------------------

/**
 * A two-byte glyph-id font of the kind a browser embeds: each character gets an arbitrary id,
 * and only the `/ToUnicode` map says which. Ids start at 0x0100 so no glyph id is accidentally
 * a printable byte pair.
 */
function glyphFont(alphabet: string) {
  const characters = [...new Set(alphabet)];
  const idOf = new Map(characters.map((character, index) => [character, 0x100 + index]));
  const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, '0');

  const cmap = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    `${characters.length} beginbfchar`,
    ...characters.map(
      (character) => `<${hex(idOf.get(character) as number)}> <${hex(character.charCodeAt(0))}>`,
    ),
    'endbfchar endcmap',
  ].join('\n');

  return {
    cmap,
    /** A hex string showing `text` in this font. */
    show: (text: string) => `<${[...text].map((character) => hex(idOf.get(character) as number)).join('')}>`,
  };
}

/** Serialises numbered objects into a PDF. A string is a plain object; `{ dict, stream }` a stream. */
function pdfOf(objects: Record<number, string | { dict: string; stream: string }>): Uint8Array {
  const parts: Uint8Array[] = [encoder.encode('%PDF-1.7\n')];
  for (const [number, object] of Object.entries(objects)) {
    if (typeof object === 'string') {
      parts.push(encoder.encode(`${number} 0 obj ${object} endobj\n`));
      continue;
    }
    parts.push(encoder.encode(`${number} 0 obj << ${object.dict} /Filter /FlateDecode >>\nstream\n`));
    parts.push(deflateSync(object.stream));
    parts.push(encoder.encode('\nendstream\nendobj\n'));
  }
  parts.push(encoder.encode('trailer << /Root 1 0 R >>\n%%EOF\n'));

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** One page whose `/F1` is a Type0 font with the given ToUnicode map, as Chrome writes it. */
function browserPdf(content: string, cmap: string, extra: Record<number, string> = {}) {
  return pdfOf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    3: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
    4: '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Arial /Encoding /Identity-H /ToUnicode 5 0 R >>',
    5: { dict: '', stream: cmap },
    6: { dict: '', stream: content },
    ...extra,
  });
}

describe('parseToUnicodeCMap', () => {
  const raw = (...codes: number[]) =>
    codes.map((code) => String.fromCharCode(code >> 8, code & 0xff)).join('');

  it('decodes single mappings, ranges and range arrays', () => {
    const decoder = parseToUnicodeCMap(
      [
        '1 begincodespacerange <0000> <FFFF> endcodespacerange',
        '1 beginbfchar <0003> <0020> endbfchar',
        '2 beginbfrange <0024> <0026> <0041> <0030> <0031> [<0078> <0079>] endbfrange',
      ].join('\n'),
      2,
    );
    expect(decoder?.decode(raw(0x24, 0x25, 0x26, 0x03, 0x30, 0x31))).toBe('ABC xy');
  });

  it('maps one glyph to several characters — a ligature or a conjunct', () => {
    const decoder = parseToUnicodeCMap('1 beginbfchar <0101> <0066006C> endbfchar', 2);
    expect(decoder?.decode(raw(0x101))).toBe('fl');
  });

  it('marks a glyph the map does not cover instead of dropping it silently', () => {
    const decoder = parseToUnicodeCMap('1 beginbfchar <0024> <0041> endbfchar', 2);
    expect(decoder?.decode(raw(0x24, 0x99))).toBe('A�');
  });

  it('refuses a range too large to be a real font', () => {
    expect(parseToUnicodeCMap('1 beginbfrange <00000000> <FFFFFFFF> <0041> endbfrange', 2)).toBeNull();
  });
});

describe('readContentStreamText with fonts', () => {
  const font = glyphFont('Name: Sunita Devi');
  const decoder = parseToUnicodeCMap(font.cmap, 2) as FontDecoder;
  const fonts = new Map([['F1', decoder]]);

  it('decodes a run through the font selected with Tf', () => {
    expect(readContentStreamText(`BT /F1 12 Tf ${font.show('Sunita Devi')} Tj ET`, fonts)).toBe(
      'Sunita Devi',
    );
  });

  it('joins runs nudged along one baseline without inventing a space — even mid-word', () => {
    // Chrome writes "Name: Sunita Devi" as runs like these, split inside "Sunita".
    const content = [
      'BT /F1 16 Tf 1 0 0 -1 48 110 Tm',
      `${font.show('Name: Sun')} Tj 80.5 0 Td ${font.show('ita Devi')} Tj`,
      'ET',
    ].join(' ');
    expect(readContentStreamText(content, fonts)).toBe('Name: Sunita Devi');
  });

  it('puts a space between blocks placed separately on the same baseline', () => {
    // Word gives each run its own BT … Tm … ET block.
    const content = [
      `BT /F1 11 Tf 1 0 0 1 72 700 Tm ${font.show('Name:')} Tj ET`,
      `BT /F1 11 Tf 1 0 0 1 140 700 Tm ${font.show('Sunita Devi')} Tj ET`,
    ].join('\n');
    expect(readContentStreamText(content, fonts)).toBe('Name: Sunita Devi');
  });

  it('breaks the line when the baseline moves', () => {
    const content = [
      `BT /F1 11 Tf 1 0 0 1 72 700 Tm ${font.show('Name:')} Tj ET`,
      `BT /F1 11 Tf 1 0 0 1 72 680 Tm ${font.show('Sunita Devi')} Tj ET`,
    ].join('\n');
    expect(readContentStreamText(content, fonts)).toBe('Name:\nSunita Devi');
  });

  it('skips inline image data, whatever bytes it holds', () => {
    const content = 'BI /W 2 /H 1 /BPC 8 /CS /G ID (Tj) Tj EI BT (Ward 4) Tj ET';
    expect(readContentStreamText(content)).toBe('Ward 4');
  });
});

describe('extractPdfText on browser- and Word-style PDFs', () => {
  const font = glyphFont("Name: Sunita Devi\nFather's Ram Prasad");
  const CONTENT = [
    'BT /F1 16 Tf 1 0 0 -1 48 110 Tm',
    `${font.show('Name: Sun')} Tj 80.5 0 Td ${font.show('ita Devi')} Tj`,
    'ET',
    'BT /F1 16 Tf 1 0 0 -1 48 144 Tm',
    `${font.show("Father's Name: Ram Prasad")} Tj`,
    'ET',
  ].join('\n');

  it('reads a subset Identity-H font through its ToUnicode map', async () => {
    const result = await extractPdfText(browserPdf(CONTENT, font.cmap));
    expect(result?.text).toBe("Name: Sunita Devi\nFather's Name: Ram Prasad");
  });

  it('finds fonts and pages packed into a compressed object stream', async () => {
    // Word and most PDF libraries put dictionaries inside /ObjStm, where no plain scan sees them.
    const packed = [
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode 5 0 R >>',
    ];
    const first = `3 0 4 ${packed[0]?.length ?? 0} `;
    const result = await extractPdfText(
      pdfOf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
        5: { dict: '', stream: font.cmap },
        6: { dict: '', stream: CONTENT },
        7: { dict: `/Type /ObjStm /N 2 /First ${first.length}`, stream: first + packed.join('') },
      }),
    );
    expect(result?.text).toBe("Name: Sunita Devi\nFather's Name: Ram Prasad");
  });

  it('reads text a page paints from a form XObject', async () => {
    const result = await extractPdfText(
      pdfOf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
        3: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> /XObject << /X1 7 0 R >> >> /Contents 6 0 R >>',
        4: '<< /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode 5 0 R >>',
        5: { dict: '', stream: font.cmap },
        6: { dict: '', stream: 'q /X1 Do Q' },
        7: { dict: '/Type /XObject /Subtype /Form /BBox [0 0 600 800]', stream: CONTENT },
      }),
    );
    expect(result?.text).toBe("Name: Sunita Devi\nFather's Name: Ram Prasad");
  });

  it('still reports no text when the ToUnicode map covers too little of what is shown', async () => {
    const partial = glyphFont('N');
    const unmapped = `<${'0200'.repeat(30)}>`;
    expect(await extractPdfText(browserPdf(`BT /F1 12 Tf ${partial.show('N')}${unmapped} Tj ET`, partial.cmap))).toBeNull();
  });
});

describe('repairDevanagari', () => {
  it('moves a drawn-order ि after its consonant', () => {
    // How a browser PDF records किरण, दिनांक and पिता.
    expect(repairDevanagari('िकरण / िदनांक / िपता')).toBe('किरण / दिनांक / पिता');
  });

  it('moves ि past a whole conjunct cluster', () => {
    expect(repairDevanagari('िस्थ')).toBe('स्थि');
  });

  it('leaves text that is already in typed order alone', () => {
    // सिमित is a valid typed string too; nothing here proves drawn order, so nothing moves.
    expect(repairDevanagari('समिति / सिमित / किरण')).toBe('समिति / सिमित / किरण');
  });

  it('drops every Hindi word on a line with an unreadable glyph, and keeps the English', () => {
    // शर्मा with its reph mapped to nothing. Keeping राम alone would be a confident wrong name.
    expect(repairDevanagari('नाम / Name: RAM SHARMA / राम शमा\u0000')).toBe('Name: RAM SHARMA /');
  });

  it('drops a line whose Latin text is itself unreadable', () => {
    expect(repairDevanagari('Roll No: 0012\nN�me: S�nita')).toBe('Roll No: 0012');
  });
});

describe('looksLikePdf', () => {
  it('recognises the magic bytes and nothing else', () => {
    expect(looksLikePdf(encoder.encode('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(encoder.encode('Name: Sunita'))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});
