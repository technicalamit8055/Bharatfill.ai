/**
 * Writing scans into a PDF: reading a JPEG's size, sizing each page to its scan, a well-formed
 * file whose cross-reference table points at every object, and the JPEG carried byte for byte.
 * Synthetic JPEG headers only — no real documents.
 */

import { describe, expect, it } from 'vitest';

import {
  buildScanPdf,
  decodeBase64,
  jpegInfo,
  PDF_SHORT_SIDE,
  pdfPageSize,
  scanPdfPages,
} from '../lib/vault/scan-pdf';

/** The headers of a JPEG as a camera or OpenCV writes one, with a few bytes of "image data". */
function fakeJpeg(width: number, height: number, components = 3, frameMarker = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const frame = [
    0xff,
    frameMarker,
    0x00,
    8 + 3 * components,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    components,
    ...Array.from({ length: components }, (_, i) => [i + 1, 0x11, 0]).flat(),
  ];
  const scan = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0x78];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...frame, ...scan, 0xff, 0xd9]);
}

function text(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

describe('jpegInfo', () => {
  it('reads the size and channels from the frame header', () => {
    expect(jpegInfo(fakeJpeg(2480, 3508))).toEqual({ width: 2480, height: 3508, components: 3 });
    expect(jpegInfo(fakeJpeg(1200, 900, 1))).toEqual({ width: 1200, height: 900, components: 1 });
  });

  it('accepts progressive JPEGs', () => {
    expect(jpegInfo(fakeJpeg(640, 480, 3, 0xc2))?.width).toBe(640);
  });

  it('refuses what a PDF cannot carry as is', () => {
    expect(jpegInfo(fakeJpeg(640, 480, 4))).toBeNull(); // CMYK
    expect(jpegInfo(fakeJpeg(640, 480, 3, 0xc3))).toBeNull(); // lossless
    expect(jpegInfo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(jpegInfo(new Uint8Array(0))).toBeNull();
  });
});

describe('pdfPageSize', () => {
  it('makes the short side A4 and keeps the scan’s shape, portrait or landscape', () => {
    const portrait = pdfPageSize({ width: 1948, height: 2862 });
    expect(portrait.width).toBe(PDF_SHORT_SIDE);
    expect(portrait.height / portrait.width).toBeCloseTo(2862 / 1948, 3);
    const landscape = pdfPageSize({ width: 3000, height: 2000 });
    expect(landscape.height).toBe(PDF_SHORT_SIDE);
    expect(landscape.width).toBeCloseTo(892.92, 2);
  });
});

describe('buildScanPdf', () => {
  const pages = [fakeJpeg(1948, 2862), fakeJpeg(2480, 3508, 1)];
  const pdf = buildScanPdf(pages);
  const body = text(pdf);

  it('is a PDF with one page per scan', () => {
    expect(body.startsWith('%PDF-1.4\n')).toBe(true);
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(body).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2');
  });

  it('sizes each page to its scan and fills it with the image', () => {
    const first = pdfPageSize({ width: 1948, height: 2862 });
    expect(body).toContain(`/MediaBox [0 0 ${first.width} ${first.height}]`);
    expect(body).toContain(`q ${first.width} 0 0 ${first.height} 0 0 cm /Im0 Do Q`);
  });

  it('carries each JPEG byte for byte, in the right colour space', () => {
    for (const page of pages) expect(body).toContain(text(page));
    expect(body).toContain('/Width 1948 /Height 2862 /ColorSpace /DeviceRGB');
    expect(body).toContain('/Width 2480 /Height 3508 /ColorSpace /DeviceGray');
    expect(body).toContain(`/Filter /DCTDecode /Length ${(pages[0] as Uint8Array).length}`);
  });

  it('points its cross-reference table at every object', () => {
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(body)?.[1]);
    expect(body.slice(xrefAt).startsWith('xref\n0 9\n')).toBe(true);
    const entries = body.slice(xrefAt).split('\n').slice(3, 11);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(body.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
    });
  });

  it('gives every stream its true length', () => {
    for (const match of body.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = (match.index ?? 0) + match[0].length;
      expect(body.slice(start + Number(match[1]))).toMatch(/^\n?endstream/);
    }
  });

  it('writes nothing about the document but its pages', () => {
    expect(body).not.toMatch(/\/Title|\/Author|\/Subject|\/Keywords/);
  });

  it('refuses a page that is not a JPEG it can carry', () => {
    expect(scanPdfPages([fakeJpeg(10, 10, 4)])).toBeNull();
    expect(() => buildScanPdf([fakeJpeg(10, 10), fakeJpeg(10, 10, 4)])).toThrow(TypeError);
    expect(() => buildScanPdf([])).toThrow(TypeError);
  });
});

describe('decodeBase64', () => {
  it('decodes what the vault hands out', () => {
    expect(Array.from(decodeBase64('/9j/4A=='))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(text(decodeBase64('SGVsbG8='))).toBe('Hello');
    expect(text(decodeBase64('SGk'))).toBe('Hi');
  });

  it('refuses anything that is not base64', () => {
    expect(() => decodeBase64('abc$')).toThrow(TypeError);
    expect(() => decodeBase64('abcde')).toThrow(TypeError);
  });
});
