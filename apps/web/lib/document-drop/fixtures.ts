import 'server-only';

import { deflateSync } from 'node:zlib';
import { DEMO_DOCUMENT_BY_CODE } from '@assistigo/ai';
import type { AllowedUploadMimeType, SimulatedDropFixture } from '@assistigo/core';

/**
 * Bytes for the "Simulate inbound drop" panel.
 * Master spec §32.1; docs/DATABASE.md §7 — invented data only.
 *
 * The simulator exists because almost nobody developing or demoing this has a live Meta
 * WhatsApp Business number, and an intake feature that can only be exercised with one is a
 * feature nobody checks. So it produces real files that travel the real path: they are sniffed,
 * stored in the private bucket, queued for extraction and reviewed like anything a citizen
 * sends. Nothing about intake is bypassed except the messaging hop.
 *
 * The bytes are built from `DEMO_DOCUMENTS` in @assistigo/ai, which is the one place invented
 * documents live. No real citizen data reaches here, and none may ever be added.
 */

/** Which invented document each simulator button drops. */
const FIXTURE_CODES: Record<SimulatedDropFixture, string> = {
  aadhaar: 'aadhaar_like',
  marksheet_10: 'marksheet_10',
  photo: 'photo',
};

/**
 * A 1×1 JPEG. Real enough to decode, so the photo tools and the review thumbnail behave as they
 * would on a citizen's upload rather than on a file that only passes the magic-byte check.
 */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwc' +
  'JC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDP/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAA' +
  'AAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMR' +
  'AD8AlgD/2Q==';

/**
 * Escapes a PDF literal string. Unbalanced parentheses or a stray backslash inside one end the
 * string early and turn the rest of the page into operators — a corrupt file, not a readable one.
 */
function pdfLiteral(line: string): string {
  return line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * A line safe to put in a PDF literal string: printable ASCII only.
 *
 * The reader decodes these bytes as latin-1, so a Devanagari line would come back as mojibake
 * and be thrown out by its own plausibility guard. Dropping such a line is honest; carrying it
 * would produce a file that claims to hold text it cannot give back.
 */
const ASCII_PRINTABLE_LINE = /^[ -~]*$/;

/**
 * A structurally valid one-page PDF whose Flate-compressed content stream carries `lines`.
 *
 * Written out rather than pulled from a PDF library because this is the only place in the app
 * that authors a PDF, and the local reader in packages/ai/src/pdf-text.ts parses exactly this
 * much: `%PDF-` magic, a FlateDecode stream, and `(text) Tj` operators.
 *
 * Only ASCII lines survive `ASCII_PRINTABLE_LINE`. Under `OCR_PROVIDER=mock` the filename lookup
 * returns the fixture's full bilingual text anyway, so nothing is lost where it matters.
 */
function textPdf(lines: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();

  const content = [
    'BT /F1 11 Tf 60 780 Td 14 TL',
    ...lines
      .filter((line) => ASCII_PRINTABLE_LINE.test(line))
      .map((line) => `(${pdfLiteral(line)}) Tj T*`),
    'ET',
  ].join('\n');

  const stream = deflateSync(Buffer.from(content, 'latin1'));

  const head = encoder.encode(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj',
      `4 0 obj << /Length ${stream.length} /Filter /FlateDecode >>`,
      'stream\n',
    ].join('\n'),
  );
  const tail = encoder.encode('\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

  const out = new Uint8Array(head.length + stream.length + tail.length);
  out.set(head, 0);
  out.set(stream, head.length);
  out.set(tail, head.length + stream.length);
  return out;
}

export type SimulatedFile = {
  filename: string;
  mimeType: AllowedUploadMimeType;
  bytes: Uint8Array;
  /** The caption a citizen would have typed, so the type hint path is exercised too. */
  caption: string;
};

/**
 * Builds one simulated inbound file.
 *
 * The filename is the fixture's own, which is what lets the mock OCR provider recognise it
 * (`findDemoDocumentByFilename`) and return the full bilingual text — so a simulated drop
 * produces a real extraction to review, not an empty one.
 */
export function buildSimulatedFile(fixture: SimulatedDropFixture): SimulatedFile {
  const demo = DEMO_DOCUMENT_BY_CODE.get(FIXTURE_CODES[fixture]);
  if (!demo) {
    // Would mean the fixture catalogue and this map have drifted apart.
    throw new Error(`unknown simulated drop fixture: ${fixture}`);
  }

  const caption = CAPTIONS[fixture];

  if (demo.mimeType === 'image/jpeg') {
    return {
      filename: demo.filename,
      mimeType: 'image/jpeg',
      bytes: new Uint8Array(Buffer.from(TINY_JPEG_BASE64, 'base64')),
      caption,
    };
  }

  return {
    filename: demo.filename,
    mimeType: 'application/pdf',
    bytes: textPdf(demo.text.split('\n')),
    caption,
  };
}

/** What a citizen at a counter in Uttar Pradesh would actually type alongside each file. */
const CAPTIONS: Record<SimulatedDropFixture, string> = {
  aadhaar: 'Aadhaar card',
  marksheet_10: '10th marksheet',
  photo: 'passport size photo',
};
