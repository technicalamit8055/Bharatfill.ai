/**
 * AI vision provider — the high-accuracy reader (docs/AI_PIPELINE.md §2).
 *
 * Speaks two wire shapes, chosen by `wireFormat`: the OpenAI chat-completions shape (DeepSeek,
 * OpenAI, OpenRouter, Ollama, vLLM and most hosted gateways implement this) and the Anthropic
 * messages shape. The endpoint, model and shape are configuration, not code, because §12.3
 * forbids hard-coding the product to one vendor — pointing this at a different provider, or at a
 * self-hosted vision model, is a configuration change, never a code change.
 *
 * Three decisions are worth explaining, because all three are load-bearing.
 *
 * **It transcribes by default; it does not extract.** The model is asked for the text on the
 * page, and the existing rules engine (../extract.ts) turns that text into `customer.*` fields.
 * Letting the model emit field keys directly would route customer data around every guarantee
 * downstream of OCR: the Aadhaar masking gate (../safety.ts), the normalisers, the high-risk
 * review rules and the golden tests. A vision model is very good at reading a blurry certificate
 * and has no business deciding what `customer.category` means.
 *
 * **Structured mode is the exception, and it has two entrances.** With `customPrompt`, the model
 * is asked to map the document to `customer.*` fields itself using an organization's own
 * instructions. With `dynamicSchema`, it is asked the same thing using a prompt generated from
 * the customer field registry (`buildDynamicSchemaPrompt`) — which is what the pipeline reaches
 * for when a document was read but matched no printed label at all, because there is nothing
 * further the rules engine can do with text it has already failed to place.
 *
 * Neither entrance bypasses the guarantees above: the model's answer is treated as a set of
 * *candidate* fields, and `../extract.ts`'s `buildFieldsFromStructuredOutput` still runs every
 * one of them through the same per-kind normaliser, the same high-risk review rules, and the
 * same safety gate before a human ever sees one — a prompt changes how a field is proposed,
 * never whether it is checked.
 *
 * **It sends bytes to a third party, so it refuses to run without organization opt-in.** The
 * pipeline checks this too — that is the authoritative gate — but a provider that ships
 * documents off the box should not depend on its caller remembering (§19.3, rule 10).
 */

import { z } from 'zod';
import { getCustomerField, isAppError, providerUnavailable } from '@assistigo/core';
import { ALL_EXTRACTABLE_FIELD_KEYS } from '../rules';
import { paragraphBlocks, readLocalText } from './local-ocr';
import {
  structuredExtractionResponseSchema,
  type AiWireFormat,
  type OcrInput,
  type OcrProvider,
  type OcrProviderConfig,
  type OcrResult,
  type StructuredExtractedField,
} from '../types';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = 'deepseek-chat';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';
const ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_TIMEOUT_MS = 60_000;

export function buildOpenAiChatCompletionsUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1') || clean.endsWith('/openai') || clean.includes('/v1beta/openai')) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

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
export type VisionUnreadableReason =
  | 'pdf_needs_image'
  | 'file_too_large'
  | 'empty_response'
  | 'invalid_structured_response';

const TRANSCRIBE_SYSTEM_PROMPT = [
  'You transcribe scanned Indian identity and certificate documents for a data-entry assistant.',
  '',
  'Rules:',
  '- Output only what is printed or written on the document. Never guess, complete or correct a value.',
  '- Emit one "Label: Value" pair per line, using the label exactly as printed on the document.',
  '- Add the colon yourself when the document prints a label and its value with no colon between them.',
  '- Marksheets and certificates are printed as grids. When one row of a table or a form carries',
  '  several label/value pairs side by side, emit each pair on its own line. Never put two pairs',
  '  on one line, and never merge one pair\'s value into another pair.',
  '- Keep a subject-wise marks table as it is printed, one subject per line.',
  '- Keep the original script. Do not transliterate Devanagari into Latin or translate anything.',
  '- Keep numbers, dates and identifiers character for character, in the order printed.',
  '- For text with no printed label, emit the line on its own with no label.',
  '- If a value is unreadable, omit that line entirely. Never write a placeholder.',
  '- Output the transcription only: no commentary, no headings, no markdown, no code fences.',
].join('\n');

/**
 * The system prompt for dynamic-schema mode, built from the customer field registry.
 *
 * This is the answer to a document the rules engine could not place: an unclassified university
 * marksheet, a college certificate, a state form nobody has written label rules for. Rather than
 * guess at its class, the model is handed the profile schema itself and asked which printed
 * labels correspond to which `customer.*` keys — the mapping step the static `LABEL_RULES`
 * dictionary does for documents it recognises (../rules.ts).
 *
 * It changes how a field is *proposed* and nothing else. `buildFieldsFromStructuredOutput`
 * still runs every answer through the same per-kind normaliser, the same high-risk review rules
 * and the same Aadhaar safety gate as the rules engine, and a key outside the registry is
 * dropped with a warning rather than shown (../extract.ts, ../safety.ts).
 *
 * Built lazily and cached: it is a few hundred lines of registry and most requests never need it.
 */
let dynamicSchemaPrompt: string | undefined;

export function buildDynamicSchemaPrompt(): string {
  if (dynamicSchemaPrompt !== undefined) return dynamicSchemaPrompt;

  const keys = ALL_EXTRACTABLE_FIELD_KEYS.map((key) => {
    const definition = getCustomerField(key);
    return definition === undefined ? key : `${key} — ${definition.label.en}`;
  });

  dynamicSchemaPrompt = [
    'You read a scanned Indian document and map what is printed on it onto a fixed customer',
    'profile schema for a data-entry assistant. The document has not been classified: it may be a',
    'university marksheet, a college certificate, an admit card, a state form or anything else.',
    '',
    'Rules:',
    '- Work only from what is printed. Never guess, complete, translate or correct a value.',
    '- Use a key only when the document actually prints that value. Omit every other key.',
    '- Read the label as printed to decide the key. A value printed under "Father\'s Name" is the',
    "  father's name and never the candidate's own — that mistake files the wrong person.",
    '- A document laid out as a grid puts several label/value pairs in one row. Read each pair',
    '  separately.',
    '- Never output a full Aadhaar number. If the document shows one, use',
    '  customer.aadhaar_last4 and give only the last four digits.',
    '- Copy names in the script they are printed in.',
    '',
    'The keys you may use, with what each one means:',
    ...keys,
  ].join('\n');

  return dynamicSchemaPrompt;
}

/**
 * Appended to whichever prompt asked for structured output — an organization's own, or the
 * generated schema above. That prompt says *what* to extract; this says *how* to answer, so the
 * response can always be parsed the same way whichever asked.
 */
const STRUCTURED_OUTPUT_INSTRUCTIONS = [
  '',
  '',
  'Respond with ONLY a single JSON object, no commentary, no markdown, no code fences, in exactly',
  'this shape:',
  '{"fields": [{"key": "customer.full_name", "label": "Name", "value": "Amit Kumar", "confidence": 0.9}]}',
  '- "key" must be one of the customer field keys given above.',
  '- "value" must be copied from the document, character for character. Never guess or complete a value.',
  '- "confidence" is a number from 0 to 1: how sure you are the value was read correctly.',
  '- Omit any field you could not read. Never invent a value.',
].join('\n');

const TRANSCRIBE_IMAGE_PROMPT = 'Transcribe this document.';
const STRUCTURED_IMAGE_PROMPT = 'Read this document and extract the requested fields as JSON.';

const TRANSCRIBE_TEXT_PROMPT = [
  'The text below was extracted from a PDF and may have lost its layout.',
  'Re-emit it as "Label: Value" lines following your rules. Add nothing that is not present.',
].join(' ');

const STRUCTURED_TEXT_PROMPT = [
  'The text below was extracted from a PDF and may have lost its layout.',
  'Extract the requested fields as JSON from it, following your rules. Add nothing that is not present.',
].join(' ');

/** A trivial, harmless request used only to check that an endpoint and key work (§7.3.4.12). */
const PING_PROMPT = 'Reply with exactly the single word: OK';

/** Only the shape we read. An unknown extra field is not an error. */
const openAiCompletionSchema = z.object({
  id: z.string().max(200).optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

const anthropicMessageSchema = z.object({
  id: z.string().max(200).optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
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

/** Strips a code fence a model wrapped its JSON in anyway. Returns null if nothing parses. */
function parseJsonResponse(content: string): unknown | null {
  let text = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(text);
  if (fence?.[1] !== undefined) text = fence[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64Data: string };

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
  private readonly wireFormat: AiWireFormat;
  private readonly customPrompt: string | undefined;
  private readonly dynamicSchema: boolean;
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
    this.wireFormat = options.wireFormat ?? 'openai_compatible';
    this.customPrompt =
      options.customPrompt !== undefined && options.customPrompt.trim() !== ''
        ? options.customPrompt.trim()
        : undefined;
    this.dynamicSchema = options.dynamicSchema === true;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    // Defence in depth. The pipeline is the authoritative gate; this is the second one.
    if (input.aiProcessingEnabled !== true) {
      throw providerUnavailable('errors.ai_processing_not_enabled');
    }

    const structured = this.customPrompt !== undefined || this.dynamicSchema;
    const content = await this.buildContent(input, structured);
    if (typeof content === 'string') return this.unreadable(content as VisionUnreadableReason);

    // An organization's own instructions outrank the generated schema when both are configured.
    const structuredPrompt = this.customPrompt ?? buildDynamicSchemaPrompt();
    const systemPrompt = structured
      ? `${structuredPrompt}${STRUCTURED_OUTPUT_INSTRUCTIONS}`
      : TRANSCRIBE_SYSTEM_PROMPT;

    const response = await this.complete(systemPrompt, content);

    if (structured) return this.buildStructuredResult(response);

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
   * Sends a trivial, harmless prompt so a settings page can confirm an endpoint and key work
   * without processing any document. Never throws: a settings UI wants a pass/fail and a reason,
   * not an exception to catch (§7.3.4.12).
   */
  async testConnection(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const response = await this.complete(PING_PROMPT, [{ type: 'text', text: PING_PROMPT }]);
      if (response.text.trim() === '') {
        return { ok: false, reason: 'errors.ocr_provider_failed' };
      }
      return { ok: true };
    } catch (thrown) {
      const reason =
        thrown instanceof Error && thrown.message !== '' ? thrown.message : 'errors.ocr_provider_failed';
      return { ok: false, reason };
    }
  }

  private buildStructuredResult(response: { text: string; requestId: string | null }): OcrResult {
    const parsedJson = parseJsonResponse(response.text);
    const parsed = parsedJson === null ? null : structuredExtractionResponseSchema.safeParse(parsedJson);

    if (parsed === null || !parsed.success) {
      return this.unreadable('invalid_structured_response', response.requestId);
    }

    const fields: StructuredExtractedField[] = parsed.data.fields;
    // The masked JSON text is the closest thing to "raw text" for this reader — retained only
    // until review, exactly like a transcription (docs/AI_PIPELINE.md §7).
    const rawText = response.text.trim();

    return {
      provider: this.name,
      providerRequestId: response.requestId,
      rawText,
      pageCount: fields.length > 0 ? 1 : 0,
      blocks: [],
      confidence:
        fields.length === 0
          ? null
          : Number((fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length).toFixed(3)),
      structuredFields: fields,
    };
  }

  /**
   * The content parts to send, or a reason code when the document cannot be sent.
   *
   * A chat endpoint takes images, not PDFs. Rather than refuse every PDF, a text-bearing one is
   * read locally and its text is sent instead — the model is still worth asking, because turning
   * a layout-mangled column dump back into structured output is exactly what it is good at. A
   * *scanned* PDF has no text to send and no image to make without a rasteriser, so it is refused
   * with a reason the operator can act on.
   */
  private async buildContent(
    input: OcrInput,
    structured: boolean,
  ): Promise<ChatContentPart[] | VisionUnreadableReason> {
    if (input.mimeType === 'application/pdf') {
      const local = await readLocalText(input.bytes);
      if (local.text !== '') {
        const prompt = structured ? STRUCTURED_TEXT_PROMPT : TRANSCRIBE_TEXT_PROMPT;
        return [{ type: 'text', text: `${prompt}\n\n${local.text}` }];
      }

      // Google Gemini's multimodal endpoint accepts PDF documents directly.
      if (this.name === 'gemini' || this.baseUrl.includes('googleapis.com')) {
        if (input.bytes.length > MAX_IMAGE_BYTES) return 'file_too_large';
        return [
          { type: 'text', text: structured ? STRUCTURED_IMAGE_PROMPT : TRANSCRIBE_IMAGE_PROMPT },
          { type: 'image', mimeType: 'application/pdf', base64Data: base64(input.bytes) },
        ];
      }

      return 'pdf_needs_image';
    }

    if (input.bytes.length > MAX_IMAGE_BYTES) return 'file_too_large';

    return [
      { type: 'text', text: structured ? STRUCTURED_IMAGE_PROMPT : TRANSCRIBE_IMAGE_PROMPT },
      { type: 'image', mimeType: input.mimeType, base64Data: base64(input.bytes) },
    ];
  }

  private async complete(
    systemPrompt: string,
    content: ChatContentPart[],
  ): Promise<{ text: string; requestId: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response =
        this.wireFormat === 'anthropic_messages'
          ? await this.callAnthropic(systemPrompt, content, controller.signal)
          : await this.callOpenAiCompatible(systemPrompt, content, controller.signal);
      return response;
    } catch (error) {
      // Already a typed provider error from callOpenAiCompatible/callAnthropic — pass it through
      // rather than relabelling it as a transport failure.
      if (isAppError(error)) throw error;
      // Timeout or transport failure. The cause is not attached: an error from a body-carrying
      // request can echo page content back into a log line (§24.2).
      throw providerUnavailable(
        controller.signal.aborted ? 'errors.ocr_provider_timeout' : 'errors.ocr_provider_failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async callOpenAiCompatible(
    systemPrompt: string,
    content: ChatContentPart[],
    signal: AbortSignal,
  ): Promise<{ text: string; requestId: string | null }> {
    const hasImage = content.some((part) => part.type === 'image');
    const userContent: string | unknown[] = hasImage
      ? content.map((part) =>
          part.type === 'text'
            ? part
            : {
                type: 'image_url',
                // A data URL, so no document is ever uploaded to a bucket a third party can re-fetch.
                image_url: { url: `data:${part.mimeType};base64,${part.base64Data}` },
              },
        )
      : content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');

    let endpointUrl = buildOpenAiChatCompletionsUrl(this.baseUrl);
    if (endpointUrl.includes('googleapis.com') && !endpointUrl.includes('key=')) {
      endpointUrl += `${endpointUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.apiKey)}`;
    }

    const response = await this.fetchImpl(endpointUrl, {
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      // Status only. A provider error body can quote the prompt, and the prompt is the document.
      throw providerUnavailable(
        response.status === 401 || response.status === 403
          ? 'errors.ocr_provider_not_configured'
          : 'errors.ocr_provider_failed',
      );
    }

    const parsed = openAiCompletionSchema.safeParse(await response.json());
    if (!parsed.success) throw providerUnavailable('errors.ocr_provider_failed');

    return {
      text: parsed.data.choices[0]?.message.content ?? '',
      requestId: parsed.data.id ?? null,
    };
  }

  private async callAnthropic(
    systemPrompt: string,
    content: ChatContentPart[],
    signal: AbortSignal,
  ): Promise<{ text: string; requestId: string | null }> {
    const userContent = content.map((part) =>
      part.type === 'text'
        ? part
        : {
          type: 'image',
          source: { type: 'base64', media_type: part.mimeType, data: part.base64Data },
        },
    );

    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal,
    });

    if (!response.ok) {
      throw providerUnavailable(
        response.status === 401 || response.status === 403
          ? 'errors.ocr_provider_not_configured'
          : 'errors.ocr_provider_failed',
      );
    }

    const parsed = anthropicMessageSchema.safeParse(await response.json());
    if (!parsed.success) throw providerUnavailable('errors.ocr_provider_failed');

    const text = parsed.data.content
      .filter((block) => block.type === 'text' && block.text !== undefined)
      .map((block) => block.text)
      .join('\n');

    return { text, requestId: parsed.data.id ?? null };
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

const VISION_REASONS = [
  'pdf_needs_image',
  'file_too_large',
  'empty_response',
  'invalid_structured_response',
] as const;

/** The reason code carried back in `providerRequestId`, if this result came from this provider. */
export function visionUnreadableReason(result: OcrResult): VisionUnreadableReason | null {
  const id = result.providerRequestId;
  if (id === null || !id.startsWith('ai:')) return null;
  const reason = id.slice('ai:'.length).split(':')[0];
  return VISION_REASONS.find((candidate) => candidate === reason) ?? null;
}
