/**
 * Writes scanned pages straight into a PDF, the way a document scanner app does: one PDF page
 * per scan, sized to the scan's own shape (A4 across its short side) with the image filling it,
 * no margins and no stretching. Each JPEG goes in byte for byte (`DCTDecode`), so the PDF is as
 * sharp as the scan and barely bigger than its pages.
 *
 * Only baseline or progressive JPEGs in grey or RGB go in this way. Anything else (PNG, HEIC,
 * CMYK JPEG) is left to the print module; `scanPdfPages` says which.
 *
 * Pure, so it is unit tested. Nothing about the document (its name, tags or contents) is written
 * into the PDF besides the page images.
 */

/** A4's short side in PDF points (1/72 inch): 210 mm. */
export const PDF_SHORT_SIDE = 595.28;

export type JpegInfo = {
  readonly width: number;
  readonly height: number;
  /** 1 for grey, 3 for colour. */
  readonly components: 1 | 3;
};

/** Start-of-frame markers of the JPEG coding processes PDF readers decode. */
const FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2]);

/**
 * Size and colour channels of a JPEG, from its start-of-frame header. Null when the bytes are
 * not a JPEG a PDF can carry as is.
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] as number;
    // Fill bytes and markers without a length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // Image data starts before any frame header was seen.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = ((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number);
    if (length < 2) return null;
    if (FRAME_MARKERS.has(marker)) {
      if (at + 10 > bytes.length) return null;
      const height = ((bytes[at + 5] as number) << 8) | (bytes[at + 6] as number);
      const width = ((bytes[at + 7] as number) << 8) | (bytes[at + 8] as number);
      const components = bytes[at + 9];
      if (width === 0 || height === 0) return null;
      return components === 1 || components === 3 ? { width, height, components } : null;
    }
    // Other coding processes (lossless, arithmetic) are not decoded by every reader.
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return null;
    }
    at += 2 + length;
  }
  return null;
}

/** Every page's `jpegInfo`, or null when any page cannot go into a PDF as is. */
export function scanPdfPages(pages: readonly Uint8Array[]): JpegInfo[] | null {
  const infos: JpegInfo[] = [];
  for (const page of pages) {
    const info = jpegInfo(page);
    if (!info) return null;
    infos.push(info);
  }
  return infos.length > 0 ? infos : null;
}

/** The PDF page for an image: A4 across its short side, the long side in proportion. */
export function pdfPageSize(info: Pick<JpegInfo, 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const scale = PDF_SHORT_SIDE / Math.min(info.width, info.height);
  return { width: round2(info.width * scale), height: round2(info.height * scale) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** PDF structure is plain ASCII; bytes above 0x7f are written as given (the binary marker). */
function latin1(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

/**
 * A PDF with one page per JPEG in `pages`, each filled edge to edge by its image. Throws a
 * `TypeError` when a page is not a JPEG a PDF can carry as is (check with `scanPdfPages`).
 */
export function buildScanPdf(pages: readonly Uint8Array[]): Uint8Array {
  const infos = scanPdfPages(pages);
  if (!infos) throw new TypeError('Every page must be a grey or colour JPEG.');

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const text = (value: string) => push(latin1(value));
  /** Starts object `id` (1-based), noting where it begins for the cross-reference table. */
  const begin = (id: number) => {
    offsets[id] = length;
    text(`${id} 0 obj\n`);
  };

  // Objects: 1 catalog, 2 page tree, then per page: page, content stream, image.
  const pageId = (index: number) => 3 + index * 3;
  const count = pages.length;

  // The comment's high bytes mark the file as binary for transfer tools.
  text('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1);
  text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2);
  const kids = infos.map((_, index) => `${pageId(index)} 0 R`).join(' ');
  text(`<< /Type /Pages /Kids [${kids}] /Count ${count} >>\nendobj\n`);

  infos.forEach((info, index) => {
    const id = pageId(index);
    const size = pdfPageSize(info);
    const content = `q ${size.width} 0 0 ${size.height} 0 0 cm /Im0 Do Q\n`;
    const image = pages[index] as Uint8Array;

    begin(id);
    text(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
        `/Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>\nendobj\n`,
    );
    begin(id + 1);
    text(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
    begin(id + 2);
    text(
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
        `/ColorSpace /${info.components === 1 ? 'DeviceGray' : 'DeviceRGB'} ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
    );
    push(image);
    text('\nendstream\nendobj\n');
  });

  const objectCount = 2 + count * 3;
  const xref = length;
  text(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    text(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  text(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = new Int16Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i += 1) BASE64_VALUES[BASE64.charCodeAt(i)] = i;

/** Decodes standard base64 (as the vault hands pages out). Throws on anything else. */
export function decodeBase64(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new TypeError('Not base64.');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const digit = code < 128 ? (BASE64_VALUES[code] as number) : -1;
    if (digit < 0) throw new TypeError('Not base64.');
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (value >> bits) & 0xff;
      at += 1;
    }
  }
  return out;
}
