/**
 * Local OCR provider — the non-AI reader (docs/AI_PIPELINE.md §2).
 *
 * Runs entirely in-process. No network, no API key, no cost, and no byte of the document leaves
 * the server, which is what makes `non_ai` mode a privacy guarantee rather than a preference.
 *
 * It reads text three ways, in order:
 *
 *   1. the upload already *is* text (a .txt paste saved as a file, or a test fixture),
 *   2. it is a PDF that carries its own text — extracted by ./../pdf-text.ts,
 *   3. neither, in which case it returns empty text plus a reason code.
 *
 * Case 3 is the honest answer for a photograph: there is no OCR engine on this box, so a
 * camera snap of an Aadhaar card genuinely cannot be read here. Returning empty text with
 * `unreadableReason` set lets the pipeline either escalate to the vision reader (in `auto`
 * mode) or tell the operator to switch modes — both of which beat inventing fields.
 *
 * It never fabricates a value that is not in its input.
 */

import { extractPdfText, looksLikePdf, looksLikeProse } from '../pdf-text';
import type { OcrBlock, OcrInput, OcrProvider, OcrResult } from '../types';

/** Why nothing could be read. Maps to an operator-facing warning in the pipeline. */
export type LocalUnreadableReason = 'image_needs_ai' | 'pdf_has_no_text' | 'empty_file';

const PRINTABLE_RATIO_FOR_TEXT = 0.85;

/** Text read off the page is a scan, and a scan is never certain. Kept below the "high" band. */
const PDF_TEXT_CONFIDENCE = 0.94;
/** A file that already was text was not read at all, so nothing was guessed. */
const PLAIN_TEXT_CONFIDENCE = 0.99;

/** True when the bytes decode to something that looks like human-readable text. */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  let printable = 0;
  for (const byte of sample) {
    // Tab, newline, carriage return, or anything from space upward.
    if (byte === 9 || byte === 10 || byte === 13 || byte >= 32) printable += 1;
  }
  return printable / sample.length >= PRINTABLE_RATIO_FOR_TEXT;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * One block per paragraph, so downstream code exercises the multi-block path rather than
 * assuming a single blob. Boxes are synthesised on a nominal A4-ish grid: this provider reads
 * a content stream rather than a raster, so it has no true glyph positions to report, and
 * nothing in the pipeline treats a bbox as a measurement.
 */
export function paragraphBlocks(text: string, confidence: number): OcrBlock[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');

  let y = 60;
  return paragraphs.map((paragraph) => {
    const height = paragraph.split('\n').length * 18;
    const bbox = [60, y, 760, y + height] as const;
    y += height + 14;
    return { text: paragraph, page: 1, bbox, confidence };
  });
}

/**
 * The text a local reader can get out of these bytes, or a reason it cannot.
 *
 * Exported because the vision provider reuses it: an OpenAI-compatible chat endpoint accepts
 * images but not PDFs, so a text-bearing PDF is better read here and sent as text than not
 * read at all (see ./ai-vision.ts).
 */
export async function readLocalText(
  bytes: Uint8Array,
): Promise<{ text: string; pageCount: number; reason: LocalUnreadableReason | null }> {
  if (bytes.length === 0) return { text: '', pageCount: 0, reason: 'empty_file' };

  if (looksLikePdf(bytes)) {
    const pdf = await extractPdfText(bytes);
    return pdf === null
      ? { text: '', pageCount: 0, reason: 'pdf_has_no_text' }
      : { text: pdf.text, pageCount: pdf.pageCount, reason: null };
  }

  // Not a PDF. Either it is already text, or it is a raster we have no engine for.
  if (looksLikeText(bytes)) {
    const text = decode(bytes).trim();
    // The same guard the PDF path uses: a binary that happened to pass the printable-byte
    // sample must not reach the extractor as if it were a document.
    if (looksLikeProse(text)) {
      return { text, pageCount: 1, reason: null };
    }
  }

  return { text: '', pageCount: 0, reason: 'image_needs_ai' };
}

export class LocalOcrProvider implements OcrProvider {
  readonly name = 'local';
  /** Runs entirely in-process; no bytes leave the server. */
  readonly sendsDataOffBox = false;

  async extract(input: OcrInput): Promise<OcrResult> {
    const { text, pageCount, reason } = await readLocalText(input.bytes);

    const confidence = looksLikePdf(input.bytes) ? PDF_TEXT_CONFIDENCE : PLAIN_TEXT_CONFIDENCE;
    const blocks = paragraphBlocks(text, confidence);

    return {
      provider: this.name,
      // No vendor involved, so there is no vendor request id to keep. `reason` rides here
      // instead so the pipeline can turn it into an operator-facing warning; it describes the
      // *file*, never its contents, so it is safe to store and to log.
      providerRequestId: reason === null ? null : `local:${reason}`,
      rawText: text,
      pageCount: blocks.length > 0 ? Math.max(1, pageCount) : 0,
      blocks,
      confidence: blocks.length > 0 ? confidence : null,
    };
  }
}

/** The reason code carried back in `providerRequestId`, if this result came from this provider. */
export function localUnreadableReason(result: OcrResult): LocalUnreadableReason | null {
  const id = result.providerRequestId;
  if (id === null || !id.startsWith('local:')) return null;
  const reason = id.slice('local:'.length);
  return reason === 'image_needs_ai' || reason === 'pdf_has_no_text' || reason === 'empty_file'
    ? reason
    : null;
}
