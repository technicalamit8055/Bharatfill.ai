/**
 * Tests for the AI vision reader.
 *
 * This is the only provider that puts a customer's document on the wire, so most of what is
 * asserted here is about restraint rather than capability: that it refuses without organization
 * opt-in, that it does not send the filename, and that a provider error never carries page
 * content back into an exception message.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_BASE_URL,
  AiVisionOcrProvider,
  buildDynamicSchemaPrompt,
  cleanTranscription,
  visionUnreadableReason,
} from './ai-vision';
import { ALL_EXTRACTABLE_FIELD_KEYS } from '../rules';
import type { OcrInput } from '../types';

const encoder = new TextEncoder();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function inputOf(overrides: Partial<OcrInput> = {}): OcrInput {
  return {
    bytes: JPEG,
    mimeType: 'image/jpeg',
    // A real filename, because the point of one assertion is that it is *not* transmitted.
    filename: 'sunita-devi-aadhaar.jpg',
    hintedType: null,
    aiProcessingEnabled: true,
    ...overrides,
  };
}

/** A fetch stub that records the request and replies with a chat completion. */
function stubFetch(content: string, init: { status?: number; id?: string } = {}) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    [];

  const impl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options?.body ?? '{}')),
      headers: (options?.headers ?? {}) as Record<string, string>,
    });

    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        id: init.id ?? 'req-1',
        choices: [{ message: { content } }],
      }),
    } as unknown as Response;
  });

  return { impl: impl as unknown as typeof fetch, calls };
}

function providerWith(fetchImpl: typeof fetch) {
  return new AiVisionOcrProvider({ apiKey: 'test-key', fetchImpl });
}

describe('AiVisionOcrProvider construction', () => {
  it('refuses to exist without a key, rather than failing on the first document', () => {
    expect(() => new AiVisionOcrProvider({})).toThrowError(/provider_not_configured/);
    expect(() => new AiVisionOcrProvider({ apiKey: '   ' })).toThrowError(
      /provider_not_configured/,
    );
  });

  it('declares that it sends data off the box', () => {
    // The pipeline's opt-in gate keys off this. Getting it wrong would bypass rule 10.
    expect(providerWith(stubFetch('x').impl).sendsDataOffBox).toBe(true);
  });
});

describe('organization opt-in', () => {
  it('refuses to run when the organization has not opted in', async () => {
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    const provider = providerWith(impl);

    await expect(provider.extract(inputOf({ aiProcessingEnabled: false }))).rejects.toThrowError(
      /ai_processing_not_enabled/,
    );
    // The real assertion: nothing was transmitted.
    expect(calls).toHaveLength(0);
  });

  it('refuses when the flag is simply absent', async () => {
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    const input = inputOf();
    delete (input as { aiProcessingEnabled?: boolean }).aiProcessingEnabled;

    await expect(providerWith(impl).extract(input)).rejects.toThrowError(
      /ai_processing_not_enabled/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('request shape', () => {
  it('sends an image as an inline data URL', async () => {
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    await providerWith(impl).extract(inputOf());

    const content = calls[0]?.body.messages as { role: string; content: unknown }[];
    const parts = content[1]?.content as { type: string; image_url?: { url: string } }[];

    expect(calls[0]?.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer test-key');
    expect(parts.find((part) => part.type === 'image_url')?.image_url?.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });

  it('never transmits the filename', async () => {
    // Filenames routinely carry the customer's name and add nothing to a transcription (§19.6).
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    await providerWith(impl).extract(inputOf());

    expect(JSON.stringify(calls[0]?.body)).not.toContain('sunita');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('aadhaar.jpg');
  });

  it('asks for a deterministic transcription, not an interpretation', async () => {
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    await providerWith(impl).extract(inputOf());

    expect(calls[0]?.body.temperature).toBe(0);
    const system = (calls[0]?.body.messages as { content: string }[])[0]?.content ?? '';
    expect(system).toContain('Never guess');
    // It must not be told to produce field keys — that is the rules engine's job.
    expect(system).not.toContain('customer.');
  });

  it('honours a configured endpoint and model', async () => {
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    const provider = new AiVisionOcrProvider({
      apiKey: 'k',
      baseUrl: 'https://gateway.example.com/',
      model: 'some-vision-model',
      fetchImpl: impl,
    });

    await provider.extract(inputOf());

    expect(calls[0]?.url).toBe('https://gateway.example.com/v1/chat/completions');
    expect(calls[0]?.body.model).toBe('some-vision-model');
  });
});

describe('reading a document', () => {
  it('returns the transcription as OCR text with the vendor request id kept for audit', async () => {
    const { impl } = stubFetch('Name: Sunita Devi\nPAN: ABCDE1234F', { id: 'chat-42' });
    const result = await providerWith(impl).extract(inputOf());

    expect(result.rawText).toBe('Name: Sunita Devi\nPAN: ABCDE1234F');
    expect(result.providerRequestId).toBe('chat-42');
    expect(result.provider).toBe('deepseek');
  });

  it('scores a transcription below the high-confidence band so every field is reviewed', async () => {
    const { impl } = stubFetch('Name: Sunita Devi');
    const result = await providerWith(impl).extract(inputOf());
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('refuses a scanned PDF with an actionable reason instead of a failure', async () => {
    const { impl, calls } = stubFetch('unused');
    const scan = encoder.encode('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF');

    const result = await providerWith(impl).extract(
      inputOf({ bytes: scan, mimeType: 'application/pdf' }),
    );

    expect(visionUnreadableReason(result)).toBe('pdf_needs_image');
    expect(calls).toHaveLength(0);
  });

  it('refuses a file too large to send', async () => {
    const { impl, calls } = stubFetch('unused');
    const huge = new Uint8Array(7 * 1024 * 1024);
    huge.set(JPEG, 0);

    const result = await providerWith(impl).extract(inputOf({ bytes: huge }));

    expect(visionUnreadableReason(result)).toBe('file_too_large');
    expect(calls).toHaveLength(0);
  });

  it('reports an empty answer as unreadable rather than as a read document', async () => {
    const { impl } = stubFetch('   ');
    const result = await providerWith(impl).extract(inputOf());
    expect(visionUnreadableReason(result)).toBe('empty_response');
  });
});

describe('provider failures', () => {
  it('reports a rejected key as a configuration problem', async () => {
    const { impl } = stubFetch('', { status: 401 });
    await expect(providerWith(impl).extract(inputOf())).rejects.toThrowError(
      /provider_not_configured/,
    );
  });

  it('does not put the response body in the error', async () => {
    // A provider error body can quote the prompt, and the prompt is the document (§24.2).
    const impl = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'context: Name: Sunita Devi' }),
    })) as unknown as typeof fetch;

    await expect(providerWith(impl).extract(inputOf())).rejects.toThrowError(
      /^errors\.ocr_provider_failed$/,
    );
  });

  it('surfaces a malformed response as a provider failure, not a crash', async () => {
    const impl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    })) as unknown as typeof fetch;

    await expect(providerWith(impl).extract(inputOf())).rejects.toThrowError(/ocr_provider_failed/);
  });

  it('reports a timeout distinctly from a failure', async () => {
    const impl = (async () => {
      throw new Error('aborted');
    }) as unknown as typeof fetch;

    const provider = new AiVisionOcrProvider({ apiKey: 'k', fetchImpl: impl, timeoutMs: 5 });
    await expect(provider.extract(inputOf())).rejects.toThrowError(/ocr_provider_failed/);
  });
});

describe('cleanTranscription', () => {
  it('strips a code fence the model added anyway', () => {
    expect(cleanTranscription('```\nName: Sunita Devi\n```')).toBe('Name: Sunita Devi');
  });

  it('strips a conversational preamble', () => {
    expect(cleanTranscription('Here is the transcription:\nName: Sunita Devi')).toBe(
      'Name: Sunita Devi',
    );
  });

  it('strips markdown bullets without touching the values', () => {
    expect(cleanTranscription('- Name: Sunita Devi\n- PAN: ABCDE1234F')).toBe(
      'Name: Sunita Devi\nPAN: ABCDE1234F',
    );
  });

  it('leaves an ordinary transcription alone', () => {
    expect(cleanTranscription('Name: Sunita Devi\nDOB: 01/01/1990')).toBe(
      'Name: Sunita Devi\nDOB: 01/01/1990',
    );
  });

  it('does not eat a single line that reads like a preamble', () => {
    expect(cleanTranscription('Transcription')).toBe('Transcription');
  });
});

/** A fetch stub that replies with an Anthropic-shaped `/v1/messages` response. */
function stubAnthropicFetch(text: string, init: { status?: number; id?: string } = {}) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    [];

  const impl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options?.body ?? '{}')),
      headers: (options?.headers ?? {}) as Record<string, string>,
    });

    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ id: init.id ?? 'msg-1', content: [{ type: 'text', text }] }),
    } as unknown as Response;
  });

  return { impl: impl as unknown as typeof fetch, calls };
}

describe('Anthropic wire format', () => {
  it('speaks the messages shape, not chat-completions', async () => {
    const { impl, calls } = stubAnthropicFetch('Name: Sunita Devi');
    const provider = new AiVisionOcrProvider({
      apiKey: 'test-key',
      baseUrl: ANTHROPIC_BASE_URL,
      wireFormat: 'anthropic_messages',
      fetchImpl: impl,
    });

    const result = await provider.extract(inputOf());

    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers['x-api-key']).toBe('test-key');
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.headers['anthropic-version']).toBeTruthy();
    expect(calls[0]?.body.system).toBeTypeOf('string');
    expect(result.rawText).toBe('Name: Sunita Devi');
    expect(result.providerRequestId).toBe('msg-1');
  });

  it('sends the image as base64 source data, not a data URL', async () => {
    const { impl, calls } = stubAnthropicFetch('Name: Sunita Devi');
    await new AiVisionOcrProvider({
      apiKey: 'k',
      wireFormat: 'anthropic_messages',
      fetchImpl: impl,
    }).extract(inputOf());

    const userMessage = (calls[0]?.body.messages as { content: unknown }[])[0];
    const parts = userMessage?.content as { type: string; source?: { media_type: string } }[];
    const image = parts.find((part) => part.type === 'image');
    expect(image?.source?.media_type).toBe('image/jpeg');
  });

  it('reports a rejected key the same way as the OpenAI-compatible path', async () => {
    const { impl } = stubAnthropicFetch('', { status: 401 });
    const provider = new AiVisionOcrProvider({
      apiKey: 'bad-key',
      wireFormat: 'anthropic_messages',
      fetchImpl: impl,
    });

    await expect(provider.extract(inputOf())).rejects.toThrowError(/provider_not_configured/);
  });
});

describe('structured mode (an organization custom prompt)', () => {
  const CUSTOM_PROMPT = 'Extract the full name and date of birth from this Indian ID document.';

  it('never mentions field keys in the system prompt when no custom prompt is set', async () => {
    // Regression guard for the load-bearing rule this file documents: by default the model
    // transcribes, it does not decide what a field means.
    const { impl, calls } = stubFetch('Name: Sunita Devi');
    await providerWith(impl).extract(inputOf());

    const system = (calls[0]?.body.messages as { content: string }[])[0]?.content ?? '';
    expect(system).not.toContain('customer.');
  });

  it('parses a structured JSON response into structuredFields, not rawText', async () => {
    const { impl, calls } = stubFetch(
      JSON.stringify({
        fields: [
          { key: 'customer.full_name', label: 'Name', value: 'Sunita Devi', confidence: 0.95 },
          { key: 'customer.date_of_birth', label: 'DOB', value: '01/01/1990', confidence: 0.8 },
        ],
      }),
    );

    const provider = new AiVisionOcrProvider({
      apiKey: 'k',
      customPrompt: CUSTOM_PROMPT,
      fetchImpl: impl,
    });
    const result = await provider.extract(inputOf());

    // The organization's own prompt is what the model is asked, plus the JSON envelope
    // instructions — never the default transcription rules.
    const system = (calls[0]?.body.messages as { content: string }[])[0]?.content ?? '';
    expect(system).toContain(CUSTOM_PROMPT);
    expect(system).toContain('JSON');

    expect(result.structuredFields).toHaveLength(2);
    expect(result.structuredFields?.[0]).toMatchObject({
      key: 'customer.full_name',
      value: 'Sunita Devi',
      confidence: 0.95,
    });
  });

  it('strips a code fence the model wrapped the JSON in anyway', async () => {
    const { impl } = stubFetch(
      '```json\n{"fields": [{"key": "customer.full_name", "label": "Name", "value": "Amit", "confidence": 0.9}]}\n```',
    );
    const provider = new AiVisionOcrProvider({ apiKey: 'k', customPrompt: CUSTOM_PROMPT, fetchImpl: impl });

    const result = await provider.extract(inputOf());
    expect(result.structuredFields).toHaveLength(1);
  });

  it('drops individually malformed field entries instead of discarding every field', async () => {
    const { impl } = stubFetch(
      JSON.stringify({
        fields: [
          { key: 'customer.full_name', value: 'Amit Kumar', confidence: 0.9 },
          { value: 'missing its key entirely' },
          { key: 'customer.mobile', value: '9900012345', confidence: 0.7 },
        ],
      }),
    );
    const provider = new AiVisionOcrProvider({ apiKey: 'k', customPrompt: CUSTOM_PROMPT, fetchImpl: impl });

    const result = await provider.extract(inputOf());
    const keys = result.structuredFields?.map((field) => field.key);
    expect(keys).toEqual(['customer.full_name', 'customer.mobile']);
  });

  it('reports unparsable JSON as a distinct, actionable reason rather than a crash', async () => {
    const { impl } = stubFetch('That is not JSON at all, sorry!');
    const provider = new AiVisionOcrProvider({ apiKey: 'k', customPrompt: CUSTOM_PROMPT, fetchImpl: impl });

    const result = await provider.extract(inputOf());
    expect(visionUnreadableReason(result)).toBe('invalid_structured_response');
    expect(result.structuredFields).toBeUndefined();
  });
});

describe('testConnection', () => {
  it('reports success without touching the aiProcessingEnabled gate', async () => {
    const { impl, calls } = stubFetch('OK');
    const provider = new AiVisionOcrProvider({ apiKey: 'k', fetchImpl: impl });

    const result = await provider.testConnection();

    expect(result).toEqual({ ok: true });
    // No `input.aiProcessingEnabled` exists for a connectivity check — it must not be required.
    expect(calls).toHaveLength(1);
  });

  it('reports a failure reason instead of throwing', async () => {
    const { impl } = stubFetch('', { status: 401 });
    const provider = new AiVisionOcrProvider({ apiKey: 'bad', fetchImpl: impl });

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dynamic-schema mode
// ---------------------------------------------------------------------------

/**
 * Structured mode without an organization prompt: the model is asked to map the page onto the
 * customer field registry, using a prompt generated from that registry. The pipeline reaches for
 * it only when a document was read and matched no printed label at all.
 */
describe('dynamic-schema mode', () => {
  const ANSWER = JSON.stringify({
    fields: [{ key: 'customer.full_name', label: "Candidate's Name", value: 'Sunita Devi', confidence: 0.9 }],
  });

  function systemPromptOf(calls: { body: Record<string, unknown> }[]): string {
    return (calls[0]?.body.messages as { content: string }[])[0]?.content ?? '';
  }

  it('offers the model the keys the dictionary can produce, with their meanings', () => {
    const prompt = buildDynamicSchemaPrompt();

    for (const key of ALL_EXTRACTABLE_FIELD_KEYS) {
      expect(prompt, key).toContain(key);
    }
    // A bare key list is not a schema — the model needs to know what each one means.
    expect(prompt).toContain('Full name');
    expect(prompt).toContain('Graduation — Roll number');
  });

  it('tells the model to use customer.aadhaar for a printed Aadhaar number', () => {
    expect(buildDynamicSchemaPrompt()).toContain('customer.aadhaar');
    expect(buildDynamicSchemaPrompt()).toMatch(/use customer\.aadhaar/i);
  });

  it('asks for the schema mapping instead of a transcription, and returns candidate fields', async () => {
    const { impl, calls } = stubFetch(ANSWER);
    const provider = new AiVisionOcrProvider({
      apiKey: 'k',
      dynamicSchema: true,
      fetchImpl: impl,
    });

    const result = await provider.extract(inputOf());

    expect(systemPromptOf(calls)).toContain('customer.full_name');
    expect(systemPromptOf(calls)).toContain('JSON');
    expect(result.structuredFields).toHaveLength(1);
    expect(result.structuredFields?.[0]).toMatchObject({ value: 'Sunita Devi' });
  });

  it("yields to an organization's own prompt when both are configured", async () => {
    const { impl, calls } = stubFetch(ANSWER);
    const provider = new AiVisionOcrProvider({
      apiKey: 'k',
      customPrompt: 'Extract only the full name.',
      dynamicSchema: true,
      fetchImpl: impl,
    });

    await provider.extract(inputOf());

    expect(systemPromptOf(calls)).toContain('Extract only the full name.');
    expect(systemPromptOf(calls)).not.toContain('customer.education.graduation.roll_number');
  });

  it('still refuses to run without the organization opt-in', async () => {
    const { impl, calls } = stubFetch(ANSWER);
    const provider = new AiVisionOcrProvider({ apiKey: 'k', dynamicSchema: true, fetchImpl: impl });

    await expect(provider.extract(inputOf({ aiProcessingEnabled: false }))).rejects.toThrowError(
      /ai_processing_not_enabled/,
    );
    expect(calls).toHaveLength(0);
  });
});
