/**
 * The part of @assistigo/ai a phone can run on text it read itself: classification, the label
 * dictionary's field extraction, and the identifier safety gate.
 *
 * The citizen app (`apps/mobile/lib/ocr`) reads a page with the phone's own text recogniser and
 * hands the lines here. No provider, no network client and no PDF parser comes with this entry
 * point, so none of them is bundled into the app.
 */

export { classifyDocument, type ClassifyInput } from './classify';
export { extractFields, type ExtractFieldsInput, fieldLabel } from './extract';
export { FIELDS_BY_DOCUMENT_TYPE } from './rules';
export { containsAadhaarLikeNumber, maskIdentifiersInText } from './safety';
export type {
  BoundingBox,
  ClassificationResult,
  ExtractedField,
  OcrBlock,
  OcrResult,
} from './types';
