/**
 * AI vision provider — the high-accuracy reader (docs/AI_PIPELINE.md §2).
 *
 * Speaks the OpenAI chat-completions shape, which DeepSeek, OpenAI, OpenRouter, vLLM and most
 * hosted gateways all implement. The endpoint and model are configuration, not code, because
 * §12.3 forbids hard-coding the product to one vendor — pointing this at a different provider,
 * or at a self-hosted vision model, is an environment change.
 *
 * Two decisions are worth explaining, because both are load-bearing.
 *
 * **It transcribes; it does not extract.** The model is asked for the text on the page, and the
 * existing rules engine (../extract.ts) turns that text into `customer.*` fields. Letting the
 * model emit field keys directly would route customer data around every guarantee downstream of
 * OCR: the Aadhaar masking gate (../safety.ts), the normalisers, the high-risk review rules and
 * the golden tests. A vision model is very good at reading a blurry certificate and has no
 * business deciding what `customer.category` means.
 *
 * **It sends bytes to a third party, so it refuses to run without organization opt-in.** The
 * pipeline checks this too — that is the authoritative gate — but a provider that ships
 * documents off the box should not depend on its caller remembering (§19.3, rule 10).
 */

import { z } from 'zod';
import { providerUnavailable } from '@assistigo/core';
import { paragraphBlocks, readLocalText } from './local-ocr';
import type { OcrInput, OcrProvider, OcrProviderConfig, OcrResult } from '../types';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = 'deepseek-chat';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Hosted chat endpoints reject large images, and base64 inflates a payload by a third. A file
 * over this cap is refused here rather than turned into a request that will fail slowly.
 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * A transcription is a reading of a page, not a quotation of a database, so it sits below the
 * `CONFIDENCE_HIGH` band on purpose: every field the vision reader produces lands in "medium"
 * and is therefore shown to a human before it can reach a profile (§12.6).
 */
const VISION_CONFIDENCE = 0.85;

/** Why the vision reader produced nothing. Turned into an operator warning by the pipeline. */
export type VisionUnreadableReason = 'pdf_needs_image' | 'file_too_large' | 'empty_response';

const TRANSCRIBE_SYSTEM_PROMPT = [
  'You transcribe scanned Indian identity and certificate documents for a data-entry assistant.',
  '',
  'Rules:',
  '- Output only what is printed or written on the document. Never guess, complete or correct a value.',
  '- Emit one "Label: Value" pair per line, using the label exactly as printed on the document.',
  '- Keep the original script. Do not transliterate Devanagari into Latin or translate anything.',
  '- Keep numbers, dates and identifiers character for character, in the order printed.',
  '- For text with no printed label, emit the line on its own with no label.',
  '- If a value is unreadable, omit that line entirely. Never write a placeholder.',
  '- Output the transcription only: no commentary, no headings, no markdown, no code fences.',
].join('\n');

const TRANSCRIBE_IMAGE_PROMPT = 'Transcribe this document.';

const TRANSCRIBE_TEXT_PROMPT = [
  'The text below was extracted from a PDF and may have lost its layout.',
  'Re-emit it as "Label: Value" lines following your rules. Add nothing that is not present.',
].join(' ');

/** Only the shape we read. An unknown extra field is not an error. */
const completionSchema = z.object({
  id: z.string().max(200).optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

function base64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * Strips the things a chat model adds even when told not to: a code fence, a "Here is the
 * transcription:" preamble, or markdown bullets in front of each line.
 */
export function cleanTranscription(content: string): string {
  let text = content.trim();

  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fence?.[1] !== undefined) text = fence[1].trim();

  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trimEnd())
    .filter((line, index, lines) => {
      // Drop a leading conversational preamble, but only when more lines follow it.
      if (index > 0 || lines.length === 1) return true;
      return !/^(?:here is|here's|sure|certainly|transcription)\b[^:]*:?\s*$/i.test(line.trim());
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type AiVisionProviderOptions = OcrProviderConfig & {
  /** Recorded as `OcrResult.provider` and stored on the extraction row for audit. */
  name?: string;
};

export class AiVisionOcrProvider implements OcrProvider {
  readonly name: string;
  /** Document bytes cross the network to a third party. Requires org opt-in. */
  readonly sendsDataOffBox = true;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: AiVisionProviderOptions) {
    if (options.apiKey === undefined || options.apiKey.trim() === '') {
      throw providerUnavailable('errors.ocr_provider_not_configured');
    }

    this.name = options.name ?? 'deepseek';
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEEPSEEK_BASE_URL).replace(/\/+$/, '');
    this.model = options.model ?? DEEPSEEK_MODEL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    // Defence in depth. The pipeline is the authoritative gate; this is the second one.
    if (input.aiProcessingEnabled !== true) {
      throw providerUnavailable('errors.ai_processing_not_enabled');
    }

    const content = await this.buildContent(input);
    if (typeof content === 'string') return this.unreadable(content as VisionUnreadableReason);

    const response = await this.complete(content);
    const text = cleanTranscription(response.text);

    if (text === '') return this.unreadable('empty_response', response.requestId);

    const blocks = paragraphBlocks(text, VISION_CONFIDENCE);

    return {
      provider: this.name,
      // The vendor's request id only, for audit. The payload is never stored (§12.3).
      providerRequestId: response.requestId,
      rawText: text,
      pageCount: blocks.length > 0 ? 1 : 0,
      blocks,
      confidence: blocks.length > 0 ? VISION_CONFIDENCE : null,
    };
  }

  /**
   * The `messages[].content` array to send, or a reason code when the document cannot be sent.
   *
   * A chat-completions endpoint takes images, not PDFs. Rather than refuse every PDF, a
   * text-bearing one is read locally and its text is sent instead — the model is still worth
   * asking, because turning a layout-mangled column dump back into `Label: Value` lines is
   * exactly what it is good at. A *scanned* PDF has no text to send and no image to make
   * without a rasteriser, so it is refused with a reason the operator can act on.
   */
  private async buildContent(input: OcrInput): Promise<unknown[] | VisionUnreadableReason> {
    if (input.mimeType === 'application/pdf') {
      const local = await readLocalText(input.bytes);
      if (local.text === '') return 'pdf_needs_image';
      return [{ type: 'text', text: `${TRANSCRIBE_TEXT_PROMPT}\n\n${local.text}` }];
    }

    if (input.bytes.length > MAX_IMAGE_BYTES) return 'file_too_large';

    return [
      { type: 'text', text: TRANSCRIBE_IMAGE_PROMPT },
      {
        type: 'image_url',
        // A data URL, so no document is ever uploaded to a bucket a third party can re-fetch.
        image_url: { url: `data:${input.mimeType};base64,${base64(input.bytes)}` },
      },
    ];
  }

  private async complete(content: unknown[]): Promise<{ text: string; requestId: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        // The filename is deliberately not sent: it routinely carries the customer's name and
        // adds nothing to a transcription (§19.6).
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
            { role: 'user', content },
          ],
        }),
        signal: controller.signal,
      });
    } catch {
      // Timeout or transport failure. The cause is not attached: an error from a body-carrying
      // request can echo page content back into a log line (§24.2).
      throw providerUnavailable(
        controller.signal.aborted ? 'errors.ocr_provider_timeout' : 'errors.ocr_provider_failed',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Status only. A provider error body can quote the prompt, and the prompt is the document.
      throw providerUnavailable(
        response.status === 401 || response.status === 403
          ? 'errors.ocr_provider_not_configured'
          : 'errors.ocr_provider_failed',
      );
    }

    const parsed = completionSchema.safeParse(await response.json());
    if (!parsed.success) throw providerUnavailable('errors.ocr_provider_failed');

    return {
      text: parsed.data.choices[0]?.message.content ?? '',
      requestId: parsed.data.id ?? null,
    };
  }

  /**
   * An empty result carrying a reason, so the pipeline warns instead of failing the document.
   *
   * `providerRequestId` is the only field on an `OcrResult` this can travel in, and when the
   * vendor did answer there is also a request id worth keeping for audit — so both go in,
   * reason first: `ai:<reason>[:<request id>]`.
   */
  private unreadable(reason: VisionUnreadableReason, requestId?: string | null): OcrResult {
    return {
      provider: this.name,
      providerRequestId:
        requestId === undefined || requestId === null
          ? `ai:${reason}`
          : `ai:${reason}:${requestId}`,
      rawText: '',
      pageCount: 0,
      blocks: [],
      confidence: null,
    };
  }
}

const VISION_REASONS = ['pdf_needs_image', 'file_too_large', 'empty_response'] as const;

/** The reason code carried back in `providerRequestId`, if this result came from this provider. */
export function visionUnreadableReason(result: OcrResult): VisionUnreadableReason | null {
  const id = result.providerRequestId;
  if (id === null || !id.startsWith('ai:')) return null;
  const reason = id.slice('ai:'.length).split(':')[0];
  return VISION_REASONS.find((candidate) => candidate === reason) ?? null;
}
