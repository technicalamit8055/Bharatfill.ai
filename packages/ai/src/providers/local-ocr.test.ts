/**
 * Tests for the local, non-AI reader.
 *
 * Two properties matter more than the reading itself. First, that it never claims to have read
 * something it could not: an unreadable file must come back as empty text with a reason, so the
 * pipeline can route it, rather than as thin text the extractor would mine for fields. Second,
 * that it stays offline — `sendsDataOffBox` is what the org opt-in gate keys off.
 */

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { LocalOcrProvider, localUnreadableReason, readLocalText } from './local-ocr';
import type { OcrInput } from '../types';

const encoder = new TextEncoder();
const provider = new LocalOcrProvider();

function inputOf(bytes: Uint8Array, overrides: Partial<OcrInput> = {}): OcrInput {
  return {
    bytes,
    mimeType: 'application/pdf',
    filename: 'document.pdf',
    hintedType: null,
    aiProcessingEnabled: false,
    ...overrides,
  };
}

/** A structurally real one-page PDF carrying `content` as a Flate content stream. */
function pdfWith(content: string): Uint8Array {
  const body = deflateSync(content);
  const head = encoder.encode(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '3 0 obj << /Type /Page /Contents 99 0 R >> endobj',
      '99 0 obj << /Length 0 0 R /Filter /FlateDecode >>',
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

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('LocalOcrProvider', () => {
  it('keeps every byte on this server', () => {
    // The pipeline's opt-in gate reads this flag. It is the whole basis of `non_ai` mode.
    expect(provider.sendsDataOffBox).toBe(false);
  });

  it('reads a text upload as it stands', async () => {
    const result = await provider.extract(
      inputOf(encoder.encode('Name: Sunita Devi\nFather: Ram Prasad')),
    );

    expect(result.rawText).toContain('Sunita Devi');
    expect(result.provider).toBe('local');
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('reads the text a PDF already carries', async () => {
    const result = await provider.extract(
      inputOf(pdfWith('BT (Name: Sunita Devi) Tj 0 -18 Td (PAN: ABCDE1234F) Tj ET')),
    );

    expect(result.rawText).toContain('Name: Sunita Devi');
    expect(result.rawText).toContain('ABCDE1234F');
  });

  it('scores PDF text below the high-confidence band', async () => {
    // Text read off a page is a reading, not a quotation, so its fields stay reviewable.
    const result = await provider.extract(inputOf(pdfWith('BT (Name: Sunita Devi) Tj ET')));
    expect(result.confidence).toBeLessThan(0.95);
  });

  it('reports an image as needing the AI reader rather than returning nothing quietly', async () => {
    const result = await provider.extract(
      inputOf(JPEG_HEADER, { mimeType: 'image/jpeg', filename: 'aadhaar.jpg' }),
    );

    expect(result.rawText).toBe('');
    expect(result.blocks).toEqual([]);
    expect(result.confidence).toBeNull();
    expect(localUnreadableReason(result)).toBe('image_needs_ai');
  });

  it('distinguishes a scanned PDF from an unreadable one', async () => {
    const scan = await provider.extract(inputOf(pdfWith('q 595 0 0 842 0 0 cm /Im0 Do Q')));
    expect(localUnreadableReason(scan)).toBe('pdf_has_no_text');

    const empty = await provider.extract(inputOf(new Uint8Array()));
    expect(localUnreadableReason(empty)).toBe('empty_file');
  });

  it('never reports a reason on a document it did read', async () => {
    const result = await provider.extract(inputOf(encoder.encode('Name: Sunita Devi')));
    expect(localUnreadableReason(result)).toBeNull();
  });

  it('is deterministic — the same bytes read the same way twice', async () => {
    const bytes = pdfWith('BT (Name: Sunita Devi) Tj ET');
    const first = await provider.extract(inputOf(bytes));
    const second = await provider.extract(inputOf(bytes));
    expect(first).toEqual(second);
  });
});

describe('readLocalText', () => {
  it('refuses a binary that happens to pass the printable-byte sample', async () => {
    // 0x20–0x7e bytes with almost no letters: printable, but not a document.
    const punctuation = encoder.encode('#$%^&*(){}[]<>|~+=_-/@!?;:,.'.repeat(8));
    const result = await readLocalText(punctuation);

    expect(result.text).toBe('');
    expect(result.reason).toBe('image_needs_ai');
  });

  it('reads Hindi text without mistaking matras for nonsense', async () => {
    const result = await readLocalText(encoder.encode('नाम : सुनीता देवी\nपिता : राम प्रसाद'));
    expect(result.text).toContain('सुनीता देवी');
    expect(result.reason).toBeNull();
  });
});
