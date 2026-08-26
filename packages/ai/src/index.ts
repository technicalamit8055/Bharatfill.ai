/**
 * @assistigo/ai — document intelligence: OCR provider abstraction, classification and
 * field extraction.
 *
 * Pure domain logic. No Supabase client, no React, no storage access — the caller hands over
 * bytes and receives proposed fields. Nothing in this package writes to a customer profile;
 * that only ever happens after a human accepts the extraction (master spec §12.6).
 */

export * from './types';
export * from './safety';
export * from './classify';
export * from './rules';
export * from './extract';
export * from './pipeline';
export * from './text';
export * from './fixtures';
export { extractPdfText, looksLikePdf, looksLikeProse } from './pdf-text';
export type { PdfTextResult } from './pdf-text';
export {
  AI_OCR_PROVIDER_NAMES,
  AiVisionOcrProvider,
  LOCAL_OCR_PROVIDER_NAMES,
  LocalOcrProvider,
  MockOcrProvider,
  OCR_PROVIDER_NAMES,
  getOcrProvider,
  isAiOcrProviderName,
  isAiProviderConfigured,
  isLocalOcrProviderName,
  isOcrProviderName,
  readLocalText,
} from './providers';
export type { AiOcrProviderName, LocalOcrProviderName, OcrProviderName } from './providers';
