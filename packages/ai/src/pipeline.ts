/**
 * The extraction pipeline.
 * Master spec §12.1; docs/AI_PIPELINE.md §1.
 *
 *   upload → OCR → classification → field extraction → normalisation → confidence → (human review)
 *
 * This module stops at the boundary of human review. It proposes; it never writes to a customer
 * profile. Nothing reaches `customers` until an operator accepts it (§12.6, §9.3).
 *
 * The OCR step has two readers behind it — local and AI vision — and this is where the choice
 * between them is made. Three rules hold whichever mode the operator picked:
 *
 *   1. `non_ai` never touches the network. It is a guarantee the operator can rely on.
 *   2. `ai` yields to `organizations.settings.ai_processing_enabled`. A dropdown cannot opt an
 *      organization into third-party processing (§12.3, docs/DEVELOPMENT_RULES.md §1 rule 10).
 *   3. Nothing here fails a document because a reader was unavailable. A reader that cannot run
 *      degrades to the other one and leaves a warning saying so, because an operator who can see
 *      "read by the basic reader" can act on it; a document stuck at `failed` tells them nothing.
 */

import type { DocumentType } from '@assistigo/core';
import { classifyDocument } from './classify';
import { buildFieldsFromStructuredOutput, extractFields, meanConfidence } from './extract';
import {
  getOcrProvider,
  isAiProviderConfigured,
  localUnreadableReason,
  visionUnreadableReason,
} from './providers';
import { FIELDS_BY_DOCUMENT_TYPE } from './rules';
import { sanitizeRawText } from './safety';
import {
  DEFAULT_EXTRACTION_MODE,
  type ExtractedField,
  type ExtractionMode,
  type ExtractionResult,
  type ExtractionWarning,
  type OcrProvider,
  type OcrProviderConfig,
  type OcrResult,
} from './types';

export type RunExtractionInput = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  filename: string;
  /** The type the operator declared on upload, if any. Evidence, not an instruction. */
  hintedType?: DocumentType | null;
  /** What the operator asked for on upload. Defaults to `auto`. */
  extractionMode?: ExtractionMode;
  /** The local, on-box provider — normally `OCR_PROVIDER`. */
  providerName?: string;
  /** The AI vision provider — normally `OCR_AI_PROVIDER`. Omit to disable the AI path. */
  aiProviderName?: string;
  /** Credentials and endpoint for the AI provider. Never read from the environment here. */
  providerConfig?: OcrProviderConfig;
  /** `organizations.settings.ai_processing_enabled` (§12.3, §19.3). */
  aiProcessingEnabled?: boolean;
  /** Injection point for tests. Bypasses mode-based selection, but not the opt-in gate. */
  provider?: OcrProvider;
};

export type RunExtractionOutput = {
  extraction: ExtractionResult;
  /**
   * OCR text with identifiers masked, safe to persist. Retained only until the extraction is
   * reviewed (docs/AI_PIPELINE.md §7).
   */
  rawText: string;
  /** Which reader actually produced the text, after every fallback. */
  mode: 'non_ai' | 'ai';
};

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

const WARNING_MESSAGE_KEYS: Record<string, string> = {
  AI_PROCESSING_NOT_ENABLED: 'documents.warnings.aiProcessingNotEnabled',
  AI_PROVIDER_NOT_CONFIGURED: 'documents.warnings.aiProviderNotConfigured',
  AI_READING_USED: 'documents.warnings.aiReadingUsed',
  AI_READING_FAILED: 'documents.warnings.aiReadingFailed',
  AI_NEEDS_IMAGE: 'documents.warnings.aiNeedsImage',
  AI_FILE_TOO_LARGE: 'documents.warnings.aiFileTooLarge',
  AI_RETURNED_NO_TEXT: 'documents.warnings.aiReturnedNoText',
  AI_STRUCTURED_INVALID: 'documents.warnings.aiStructuredInvalid',
  AI_DYNAMIC_EXTRACTION_USED: 'documents.warnings.aiDynamicExtractionUsed',
  LOCAL_CANNOT_READ_IMAGES: 'documents.warnings.localCannotReadImages',
  PDF_HAS_NO_TEXT: 'documents.warnings.pdfHasNoText',
  EMPTY_FILE: 'documents.warnings.emptyFile',
  UNKNOWN_DOCUMENT_TYPE: 'documents.warnings.unknownDocumentType',
};

function warn(code: keyof typeof WARNING_MESSAGE_KEYS | string): ExtractionWarning {
  return { code, messageKey: WARNING_MESSAGE_KEYS[code] ?? 'documents.warnings.unknown' };
}

/** Turns a reader's "I could not read this" reason code into an operator-facing warning. */
function unreadableWarning(ocr: OcrResult): ExtractionWarning | null {
  switch (localUnreadableReason(ocr)) {
    case 'image_needs_ai':
      return warn('LOCAL_CANNOT_READ_IMAGES');
    case 'pdf_has_no_text':
      return warn('PDF_HAS_NO_TEXT');
    case 'empty_file':
      return warn('EMPTY_FILE');
    default:
      break;
  }

  switch (visionUnreadableReason(ocr)) {
    case 'pdf_needs_image':
      return warn('AI_NEEDS_IMAGE');
    case 'file_too_large':
      return warn('AI_FILE_TOO_LARGE');
    case 'empty_response':
      return warn('AI_RETURNED_NO_TEXT');
    case 'invalid_structured_response':
      return warn('AI_STRUCTURED_INVALID');
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reader selection
// ---------------------------------------------------------------------------

/** Whether the AI reader is allowed to run at all, and why not when it is not. */
function aiAvailability(input: RunExtractionInput): {
  allowed: boolean;
  blockedBy: ExtractionWarning | null;
} {
  const name = input.aiProviderName;

  if (name === undefined || name === '' || name === 'none') {
    return { allowed: false, blockedBy: warn('AI_PROVIDER_NOT_CONFIGURED') };
  }
  if (!isAiProviderConfigured(name, input.providerConfig)) {
    return { allowed: false, blockedBy: warn('AI_PROVIDER_NOT_CONFIGURED') };
  }
  // The organization gate, and the only one an operator cannot talk their way past.
  if (input.aiProcessingEnabled !== true) {
    return { allowed: false, blockedBy: warn('AI_PROCESSING_NOT_ENABLED') };
  }
  return { allowed: true, blockedBy: null };
}

function ocrInputOf(input: RunExtractionInput) {
  return {
    bytes: input.bytes,
    mimeType: input.mimeType,
    filename: input.filename,
    hintedType: input.hintedType ?? null,
    aiProcessingEnabled: input.aiProcessingEnabled ?? false,
  };
}

/**
 * Classification plus field extraction over one OCR result. Pure; safe to run twice.
 *
 * `classificationText` exists for the dynamic-schema escalation below, whose `rawText` is the
 * model's JSON answer rather than the page: the class was already decided from the transcription,
 * and re-deciding it from a JSON payload would throw away the better evidence.
 */
function interpret(
  input: RunExtractionInput,
  ocr: OcrResult,
  classificationText?: string,
): {
  documentType: DocumentType;
  classificationConfidence: number;
  fields: ExtractedField[];
  warnings: ExtractionWarning[];
} {
  const classification = classifyDocument({
    text: classificationText ?? ocr.rawText,
    filename: input.filename,
    mimeType: input.mimeType,
    hintedType: input.hintedType ?? null,
  });

  // Structured mode: an organization's custom prompt already mapped the document to
  // `customer.*` fields, so there is no OCR text to line-split or label-match. Either path still
  // ends at the same safety gate and review rules (docs/AI_PIPELINE.md §2, §9).
  const { fields, warnings } =
    ocr.structuredFields != null
      ? buildFieldsFromStructuredOutput({ fields: ocr.structuredFields })
      : extractFields({ ocr, documentType: classification.documentType });

  return {
    documentType: classification.documentType,
    classificationConfidence: classification.confidence,
    fields,
    warnings:
      classification.documentType === 'unknown'
        ? [warn('UNKNOWN_DOCUMENT_TYPE'), ...warnings]
        : warnings,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runExtraction(input: RunExtractionInput): Promise<RunExtractionOutput> {
  const warnings: ExtractionWarning[] = [];
  const mode = input.extractionMode ?? DEFAULT_EXTRACTION_MODE;
  const localProviderName = input.providerName ?? 'mock';

  let usedAi = false;
  let ocr: OcrResult;
  /**
   * Every vendor request that contributed to the stored extraction. Normally one; the
   * dynamic-schema escalation below adds a second, and the row has to name both — the one that
   * produced the retained text and the one that produced the fields (§24.2 keeps the payloads
   * out, not the ids).
   */
  const providerRequestIds: string[] = [];

  if (input.provider !== undefined) {
    // An injected provider is used as given. The opt-in gate still applies: a provider that
    // ships bytes off the box may not run without the organization having said yes, and falling
    // back to the local reader keeps the operator working (docs/AI_PIPELINE.md §2).
    let provider = input.provider;
    if (provider.sendsDataOffBox && input.aiProcessingEnabled !== true) {
      warnings.push(warn('AI_PROCESSING_NOT_ENABLED'));
      provider = getOcrProvider(localProviderName);
    } else {
      usedAi = provider.sendsDataOffBox;
    }
    ocr = await provider.extract(ocrInputOf(input));
  } else {
    const ai = aiAvailability(input);

    if (mode === 'ai' && ai.allowed) {
      const attempt = await readWithAi(input, warnings);
      ocr = attempt.ocr;
      usedAi = attempt.usedAi;
    } else {
      // `ai` mode that cannot have AI says so, then reads locally anyway.
      if (mode === 'ai' && ai.blockedBy !== null) warnings.push(ai.blockedBy);
      ocr = await getOcrProvider(localProviderName, input.providerConfig).extract(
        ocrInputOf(input),
      );
    }
  }

  let interpretation = interpret(input, ocr);

  // `auto`: the local reader went first. Escalate only when it came back with nothing useful —
  // no text at all, or text that matched no label. Both are cases where a vision model
  // genuinely changes the outcome; re-reading a document that was already read would just spend
  // an organization's money and its customers' privacy for nothing.
  if (
    mode === 'auto' &&
    input.provider === undefined &&
    !usedAi &&
    interpretation.fields.length === 0
  ) {
    const ai = aiAvailability(input);
    if (ai.allowed) {
      const attempt = await readWithAi(input, warnings);
      if (attempt.usedAi && attempt.ocr.rawText.trim() !== '') {
        ocr = attempt.ocr;
        usedAi = true;
        interpretation = interpret(input, ocr);
      } else if (attempt.usedAi) {
        // The AI reader ran and came back with nothing, so the local result stands. Carry its
        // reason across anyway: an operator told only "the basic reader cannot read photos"
        // would reasonably try the AI reader next, not knowing it had already been asked.
        const attemptWarning = unreadableWarning(attempt.ocr);
        if (attemptWarning !== null) warnings.push(attemptWarning);
      }
    } else if (ai.blockedBy !== null && ocr.rawText.trim() === '') {
      // Only worth saying when the document could not be read at all. A document that was read
      // but yielded no fields is an extraction gap, not a missing-AI problem.
      warnings.push(ai.blockedBy);
    }
  }

  // Read, but nothing on the page matched a printed label the dictionary knows. This is the
  // unclassified university marksheet, the college certificate, the state form nobody has
  // written rules for — and there is nothing further the rules engine can do with text it has
  // already failed to place. Hand the model the profile schema and ask it to do the mapping
  // (docs/AI_PIPELINE.md §2).
  //
  // It costs one more request to a vendor the organization has already opted into and this
  // document has already been sent to, and it is asked for only when the alternative is handing
  // the operator nothing at all.
  if (
    mode !== 'non_ai' &&
    input.provider === undefined &&
    interpretation.fields.length === 0 &&
    ocr.rawText.trim() !== '' &&
    // A photograph or a signature has no fields *by design* — it is the value (§12.4). That is
    // not a failure to place the page, and re-reading it would find nothing either way.
    hasExtractableFields(interpretation.documentType) &&
    // Structured mode already asked the model to map the document; asking twice would just be
    // the same answer, and an organization's own prompt is not ours to second-guess.
    ocr.structuredFields == null
  ) {
    const ai = aiAvailability(input);
    if (ai.allowed) {
      const attempt = await readWithAi(input, warnings, { dynamicSchema: true });
      const proposed = attempt.usedAi ? (attempt.ocr.structuredFields ?? []) : [];

      if (proposed.length > 0) {
        // The transcription stays the retained text and the class stays as the page decided it;
        // only the fields come from this second pass.
        const dynamic = interpret(input, attempt.ocr, ocr.rawText);
        if (dynamic.fields.length > 0) {
          interpretation = dynamic;
          usedAi = true;
          if (attempt.ocr.providerRequestId !== null) {
            providerRequestIds.push(attempt.ocr.providerRequestId);
          }
          warnings.push(warn('AI_DYNAMIC_EXTRACTION_USED'));
        }
      } else if (attempt.usedAi) {
        // Asked and got nothing usable — an answer that would not parse, most likely. Say so,
        // for the same reason the escalation above does: an operator who is told only "no
        // details could be read" would try the AI reader next, not knowing it has been asked.
        const attemptWarning = unreadableWarning(attempt.ocr);
        if (attemptWarning !== null) warnings.push(attemptWarning);
      }
    }
  }

  if (usedAi) warnings.push(warn('AI_READING_USED'));

  const unreadable = unreadableWarning(ocr);
  if (unreadable !== null) warnings.push(unreadable);

  return {
    extraction: {
      documentType: interpretation.documentType,
      classificationConfidence: interpretation.classificationConfidence,
      provider: ocr.provider,
      providerRequestId: joinRequestIds([ocr.providerRequestId, ...providerRequestIds]),
      fields: interpretation.fields,
      warnings: dedupeWarnings([...warnings, ...interpretation.warnings]),
      confidence: meanConfidence(interpretation.fields),
    },
    rawText: sanitizeRawText(ocr.rawText),
    mode: usedAi ? 'ai' : 'non_ai',
  };
}

/**
 * One attempt at the AI reader, falling back to the local one if it cannot complete.
 *
 * A provider outage, a timeout or a revoked key must not cost the operator their upload, so the
 * failure becomes a warning on a locally-read document rather than a failed job.
 */
async function readWithAi(
  input: RunExtractionInput,
  warnings: ExtractionWarning[],
  configOverrides?: Partial<OcrProviderConfig>,
): Promise<{ ocr: OcrResult; usedAi: boolean }> {
  const localProviderName = input.providerName ?? 'mock';

  try {
    const provider = getOcrProvider(input.aiProviderName, {
      ...input.providerConfig,
      ...configOverrides,
    });
    return { ocr: await provider.extract(ocrInputOf(input)), usedAi: true };
  } catch {
    // The reason is deliberately dropped: a provider error can quote the request, and the
    // request is the document (§24.2). The job handler logs the failure separately.
    warnings.push(warn('AI_READING_FAILED'));
    const ocr = await getOcrProvider(localProviderName, input.providerConfig).extract(
      ocrInputOf(input),
    );
    return { ocr, usedAi: false };
  }
}

/** False for the classes that carry no fields at all — a photo, a signature, a receipt. */
function hasExtractableFields(documentType: DocumentType): boolean {
  return (FIELDS_BY_DOCUMENT_TYPE[documentType] ?? []).length > 0;
}

/** The audit column holds one string, so several request ids travel comma-separated. */
function joinRequestIds(ids: readonly (string | null)[]): string | null {
  const present = [...new Set(ids.filter((id): id is string => id !== null && id !== ''))];
  return present.length === 0 ? null : present.join(',').slice(0, 200);
}

/** The same warning can arrive from two paths; showing it twice looks like two problems. */
function dedupeWarnings(warnings: readonly ExtractionWarning[]): ExtractionWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.fieldKey ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The status an extraction row should carry once the pipeline has run (§18.2).
 *
 * `review_required` whenever any field needs a human, which — because every high-risk field is
 * always reviewed — is true for essentially every identity document. That is intended.
 */
export function extractionStatus(result: ExtractionResult): 'completed' | 'review_required' {
  return result.fields.some((field) => field.status === 'needs_review')
    ? 'review_required'
    : 'completed';
}

/** The matching `documents.status` value (§18.2). */
export function documentStatusAfterExtraction(
  result: ExtractionResult,
): 'extracted' | 'review_required' {
  return extractionStatus(result) === 'review_required' ? 'review_required' : 'extracted';
}
