/**
 * Extraction-mode tests (docs/AI_PIPELINE.md §2).
 *
 * Three promises are made to the operator when they pick a reading method, and each one is a
 * test here:
 *
 *   1. `non_ai` never puts the document on the wire — whatever else is configured or enabled.
 *   2. `ai` never overrides the organization's opt-in. A dropdown is not consent.
 *   3. no reading method can fail a document just by being unavailable; it degrades and says so.
 *
 * The fourth group is the one that would hurt most if it broke: text that came back from a
 * vision model goes through exactly the same Aadhaar masking gate as text read locally.
 */

import { describe, expect, it, vi } from 'vitest';
import { DEMO_DOCUMENT_BY_CODE } from './fixtures';
import { runExtraction } from './pipeline';
import { containsAadhaarLikeNumber } from './safety';
import type { RunExtractionInput } from './pipeline';

const encoder = new TextEncoder();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** A fetch stub standing in for the vision endpoint, recording whether it was reached. */
function stubVision(transcription: string) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'req-1', choices: [{ message: { content: transcription } }] }),
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function failingVision() {
  const impl = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  return impl;
}

/** The AI reader wired up and permitted: configured provider, key, and organization opt-in. */
function withAi(
  fetchImpl: typeof fetch,
  overrides: Partial<RunExtractionInput> = {},
): RunExtractionInput {
  return {
    bytes: JPEG,
    mimeType: 'image/jpeg',
    filename: 'scan.jpg',
    providerName: 'local',
    aiProviderName: 'deepseek',
    providerConfig: { apiKey: 'test-key', fetchImpl },
    aiProcessingEnabled: true,
    ...overrides,
  };
}

function codes(warnings: readonly { code: string }[]): string[] {
  return warnings.map((warning) => warning.code);
}

describe('non_ai mode is a guarantee, not a preference', () => {
  it('never reaches the network, even with AI configured and the org opted in', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi');

    const { extraction, mode } = await runExtraction(
      withAi(impl, { extractionMode: 'non_ai', bytes: JPEG }),
    );

    expect(calls).toEqual([]);
    expect(mode).toBe('non_ai');
    expect(extraction.provider).toBe('local');
  });

  it('tells the operator why a photo came back empty instead of failing', async () => {
    const { impl } = stubVision('unused');
    const { extraction } = await runExtraction(withAi(impl, { extractionMode: 'non_ai' }));

    expect(extraction.fields).toEqual([]);
    expect(codes(extraction.warnings)).toContain('LOCAL_CANNOT_READ_IMAGES');
  });

  it('reads a text document locally and proposes fields from it', async () => {
    const { impl, calls } = stubVision('unused');
    const pan = DEMO_DOCUMENT_BY_CODE.get('pan')?.text ?? '';

    const { extraction } = await runExtraction(
      withAi(impl, {
        extractionMode: 'non_ai',
        bytes: encoder.encode(pan),
        mimeType: 'application/pdf',
      }),
    );

    expect(calls).toEqual([]);
    expect(extraction.fields.length).toBeGreaterThan(0);
  });
});

describe('ai mode yields to the organization opt-in', () => {
  it('refuses to send the document when the org has not opted in', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi');

    const { extraction, mode } = await runExtraction(
      withAi(impl, { extractionMode: 'ai', aiProcessingEnabled: false }),
    );

    // Rule 10: no raw document reaches an AI provider without org-level opt-in.
    expect(calls).toEqual([]);
    expect(mode).toBe('non_ai');
    expect(codes(extraction.warnings)).toContain('AI_PROCESSING_NOT_ENABLED');
  });

  it('reads locally, with a warning, when no AI provider is configured', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi');

    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'ai', aiProviderName: 'none' }),
    );

    expect(calls).toEqual([]);
    expect(codes(extraction.warnings)).toContain('AI_PROVIDER_NOT_CONFIGURED');
  });

  it('reads locally, with a warning, when the provider has no key', async () => {
    const { impl } = stubVision('Name: Sunita Devi');

    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'ai', providerConfig: { fetchImpl: impl } }),
    );

    expect(codes(extraction.warnings)).toContain('AI_PROVIDER_NOT_CONFIGURED');
  });

  it('uses the AI reader when everything is in place, and says so', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi\nDate of Birth: 01/01/1990');

    const { extraction, mode } = await runExtraction(withAi(impl, { extractionMode: 'ai' }));

    expect(calls).toHaveLength(1);
    expect(mode).toBe('ai');
    expect(extraction.provider).toBe('deepseek');
    // Transparency: the operator should know a third party read this page.
    expect(codes(extraction.warnings)).toContain('AI_READING_USED');
    expect(extraction.fields.find((field) => field.key === 'customer.full_name')?.value).toBe(
      'Sunita Devi',
    );
  });
});

describe('auto mode escalates only when the local reader found nothing', () => {
  it('escalates a photo the local reader cannot see', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi\nDate of Birth: 01/01/1990');

    const { extraction, mode } = await runExtraction(withAi(impl, { extractionMode: 'auto' }));

    expect(calls).toHaveLength(1);
    expect(mode).toBe('ai');
    expect(extraction.fields.length).toBeGreaterThan(0);
  });

  it('does not escalate a document the local reader already read', async () => {
    // Re-reading a document that produced fields would spend money and privacy for nothing.
    const { impl, calls } = stubVision('unused');
    const pan = DEMO_DOCUMENT_BY_CODE.get('pan')?.text ?? '';

    const { extraction, mode } = await runExtraction(
      withAi(impl, {
        extractionMode: 'auto',
        bytes: encoder.encode(pan),
        mimeType: 'application/pdf',
      }),
    );

    expect(calls).toEqual([]);
    expect(mode).toBe('non_ai');
    expect(codes(extraction.warnings)).not.toContain('AI_READING_USED');
  });

  it('does not escalate when the org has not opted in', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi');

    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'auto', aiProcessingEnabled: false }),
    );

    expect(calls).toEqual([]);
    expect(codes(extraction.warnings)).toContain('AI_PROCESSING_NOT_ENABLED');
  });

  it('defaults to auto when no mode was chosen', async () => {
    const { impl, calls } = stubVision('Name: Sunita Devi');
    const { mode } = await runExtraction(withAi(impl));

    expect(calls).toHaveLength(1);
    expect(mode).toBe('ai');
  });
});

describe('an unavailable reader never fails the document', () => {
  it('falls back to the local reader when the AI provider cannot be reached', async () => {
    const { extraction, mode } = await runExtraction(
      withAi(failingVision(), { extractionMode: 'ai' }),
    );

    expect(mode).toBe('non_ai');
    expect(extraction.provider).toBe('local');
    expect(codes(extraction.warnings)).toContain('AI_READING_FAILED');
  });

  it('keeps the local result when an escalation fails', async () => {
    const { extraction } = await runExtraction(withAi(failingVision(), { extractionMode: 'auto' }));

    expect(codes(extraction.warnings)).toContain('AI_READING_FAILED');
    expect(codes(extraction.warnings)).not.toContain('AI_READING_USED');
  });

  it('reports a scanned PDF as needing an image rather than as a failure', async () => {
    const { impl } = stubVision('unused');
    const scan = encoder.encode('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF');

    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'ai', bytes: scan, mimeType: 'application/pdf' }),
    );

    expect(codes(extraction.warnings)).toContain('AI_NEEDS_IMAGE');
  });

  it('never repeats the same warning twice', async () => {
    const { impl } = stubVision('unused');
    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'auto', aiProcessingEnabled: false }),
    );

    const seen = codes(extraction.warnings);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('AI-read text goes through the same safety gate (§19.3)', () => {
  it('masks an Aadhaar number a vision model transcribed', async () => {
    // The regression that matters: the masking gate lives downstream of OCR, so it must apply
    // to a transcription exactly as it applies to locally-read text.
    const { impl } = stubVision(
      'UNIQUE IDENTIFICATION AUTHORITY OF INDIA\nName: Sunita Devi\nAadhaar: 2000 0000 0000',
    );

    const { extraction, rawText } = await runExtraction(withAi(impl, { extractionMode: 'ai' }));

    expect(containsAadhaarLikeNumber(rawText)).toBe(false);
    for (const field of extraction.fields) {
      expect(containsAadhaarLikeNumber(field.value), `value of ${field.key}`).toBe(false);
      expect(containsAadhaarLikeNumber(field.sourceText), `source of ${field.key}`).toBe(false);
    }
  });

  it('never emits a field outside the customer registry from a transcription', async () => {
    const { impl } = stubVision(
      'Name: Sunita Devi\nSecret Internal Code: XYZ\nDate of Birth: 01/01/1990',
    );

    const { extraction } = await runExtraction(withAi(impl, { extractionMode: 'ai' }));

    for (const field of extraction.fields) {
      expect(field.key.startsWith('customer.')).toBe(true);
    }
  });
});

describe('an escalation that finds nothing still says so', () => {
  it('reports that the AI reader was asked and came back empty', async () => {
    // Otherwise the operator sees only 'the basic reader cannot read photos' and tries the AI
    // reader next, not knowing it has already been asked.
    const { impl, calls } = stubVision('   ');

    const { extraction, mode } = await runExtraction(withAi(impl, { extractionMode: 'auto' }));

    expect(calls).toHaveLength(1);
    expect(mode).toBe('non_ai');
    expect(codes(extraction.warnings)).toContain('AI_RETURNED_NO_TEXT');
  });
});

describe('structured mode: an organization vendor with a custom prompt', () => {
  function stubStructuredVision(jsonText: string) {
    const impl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ id: 'req-1', choices: [{ message: { content: jsonText } }] }),
        }) as unknown as Response,
    );
    return impl as unknown as typeof fetch;
  }

  function withOrgVendor(
    impl: typeof fetch,
    customPrompt: string,
    overrides: Partial<RunExtractionInput> = {},
  ): RunExtractionInput {
    return withAi(impl, {
      extractionMode: 'ai',
      aiProviderName: 'org_ai_vendor',
      providerConfig: { apiKey: 'org-key', customPrompt, fetchImpl: impl },
      ...overrides,
    });
  }

  it('builds fields from the vendor JSON instead of the label-matching rules engine', async () => {
    const impl = stubStructuredVision(
      JSON.stringify({
        fields: [{ key: 'customer.full_name', label: 'Name', value: 'Amit Kumar', confidence: 0.9 }],
      }),
    );

    const { extraction, mode } = await runExtraction(withOrgVendor(impl, 'Extract the full name.'));

    expect(mode).toBe('ai');
    expect(extraction.fields).toHaveLength(1);
    expect(extraction.fields[0]).toMatchObject({ key: 'customer.full_name', value: 'Amit Kumar' });
  });

  it('still masks an Aadhaar-like number the vendor put in a field value', async () => {
    const impl = stubStructuredVision(
      JSON.stringify({
        fields: [
          { key: 'customer.address.printed', value: 'ID 123456789012, Ghazipur', confidence: 0.9 },
        ],
      }),
    );

    const { extraction, rawText } = await runExtraction(withOrgVendor(impl, 'Extract the address.'));

    expect(containsAadhaarLikeNumber(JSON.stringify(extraction.fields))).toBe(false);
    expect(containsAadhaarLikeNumber(rawText)).toBe(false);
  });

  it('still yields to the organization opt-in gate, exactly like the transcribing path', async () => {
    const impl = stubStructuredVision(JSON.stringify({ fields: [] }));

    const { extraction, mode } = await runExtraction(
      withOrgVendor(impl, 'Extract the full name.', { aiProcessingEnabled: false }),
    );

    expect(mode).toBe('non_ai');
    expect(codes(extraction.warnings)).toContain('AI_PROCESSING_NOT_ENABLED');
  });
});

// ---------------------------------------------------------------------------
// Dynamic-schema escalation (docs/AI_PIPELINE.md §2)
// ---------------------------------------------------------------------------

/**
 * A page that was read but matched no printed label the dictionary knows — an unclassified
 * university marksheet, a state form nobody has written rules for — is handed back to the model
 * with the profile schema, because there is nothing further the rules engine can do with text it
 * has already failed to place.
 *
 * The reason this group is worth its length: this is the one path where field *keys* come from a
 * model rather than from ../rules.ts, so what is asserted here is that it changes nothing else.
 * The opt-in gate, the Aadhaar masking gate, the high-risk review rules and the classification
 * all have to behave exactly as they do on the transcribing path.
 */
describe('a document that was read but matched no label', () => {
  /** A page with real words and not one printed label. */
  const UNPLACEABLE = [
    'DEMO STATE UNIVERSITY, RAMPUR',
    'PROVISIONAL MARKSHEET',
    'B.Sc. (Hons) PART III DEGREE EXAMINATION',
    'Marks are printed overleaf and verified by seal',
  ].join('\n');

  /** Replies with each body in turn, so a transcription and a JSON answer can differ. */
  function stubTurns(...bodies: string[]) {
    const calls: Record<string, unknown>[] = [];
    const impl = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>;
      calls.push(body);
      const content = bodies[Math.min(calls.length - 1, bodies.length - 1)] ?? '';
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `req-${calls.length}`, choices: [{ message: { content } }] }),
      } as unknown as Response;
    });
    return { impl: impl as unknown as typeof fetch, calls };
  }

  function structured(fields: Record<string, string>): string {
    return JSON.stringify({
      fields: Object.entries(fields).map(([key, value]) => ({
        key,
        label: key,
        value,
        confidence: 0.9,
      })),
    });
  }

  function unplaceableInput(impl: typeof fetch, overrides: Partial<RunExtractionInput> = {}) {
    return withAi(impl, {
      extractionMode: 'ai',
      bytes: encoder.encode(UNPLACEABLE),
      mimeType: 'application/pdf',
      ...overrides,
    });
  }

  it('asks the model to map the page onto the profile, and says that it did', async () => {
    const { impl, calls } = stubTurns(
      UNPLACEABLE,
      structured({
        'customer.full_name': 'SUNITA DEVI',
        'customer.education.graduation.result': 'PASSED',
      }),
    );

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(calls).toHaveLength(2);
    expect(codes(extraction.warnings)).toContain('AI_DYNAMIC_EXTRACTION_USED');
    expect(extraction.fields.find((field) => field.key === 'customer.full_name')?.value).toBe(
      'SUNITA DEVI',
    );
    expect(
      extraction.fields.find((field) => field.key === 'customer.education.graduation.result')
        ?.value,
    ).toBe('PASSED');
  });

  it('does not ask a second time for a page the rules engine could read', async () => {
    // Re-reading a document that produced fields would spend money and privacy for nothing.
    const { impl, calls } = stubTurns('Name: Sunita Devi\nDate of Birth: 01/01/1990');

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(calls).toHaveLength(1);
    expect(codes(extraction.warnings)).not.toContain('AI_DYNAMIC_EXTRACTION_USED');
  });

  it('never escalates in non_ai mode — the guarantee holds here too', async () => {
    const { impl, calls } = stubTurns(structured({ 'customer.full_name': 'SUNITA DEVI' }));

    const { extraction, mode } = await runExtraction(
      unplaceableInput(impl, { extractionMode: 'non_ai' }),
    );

    expect(calls).toEqual([]);
    expect(mode).toBe('non_ai');
    expect(extraction.fields).toEqual([]);
  });

  it('never escalates without the organization opt-in', async () => {
    const { impl, calls } = stubTurns(structured({ 'customer.full_name': 'SUNITA DEVI' }));

    const { extraction } = await runExtraction(
      unplaceableInput(impl, { aiProcessingEnabled: false }),
    );

    // Rule 10: no raw document reaches an AI provider without org-level opt-in.
    expect(calls).toEqual([]);
    expect(codes(extraction.warnings)).toContain('AI_PROCESSING_NOT_ENABLED');
  });

  it('leaves an organization with its own prompt alone', async () => {
    // Structured mode already asked the model to map the document; asking again would produce
    // the same answer, and an organization's own instructions are not ours to second-guess.
    const { impl, calls } = stubTurns(JSON.stringify({ fields: [] }));

    const { extraction } = await runExtraction(
      unplaceableInput(impl, {
        aiProviderName: 'org_ai_vendor',
        providerConfig: { apiKey: 'org-key', customPrompt: 'Extract the name.', fetchImpl: impl },
      }),
    );

    expect(calls).toHaveLength(1);
    expect(codes(extraction.warnings)).not.toContain('AI_DYNAMIC_EXTRACTION_USED');
  });

  it('keeps the class the page proved, rather than re-deciding it from a JSON payload', async () => {
    const { impl } = stubTurns(UNPLACEABLE, structured({ 'customer.full_name': 'SUNITA DEVI' }));

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(extraction.documentType).toBe('marksheet_graduation');
  });

  it('keeps the transcription as the retained text, not the model JSON', async () => {
    const { impl } = stubTurns(UNPLACEABLE, structured({ 'customer.full_name': 'SUNITA DEVI' }));

    const { rawText } = await runExtraction(unplaceableInput(impl));

    expect(rawText).toContain('PROVISIONAL MARKSHEET');
    expect(rawText).not.toContain('customer.full_name');
  });

  it('names both vendor requests, since both contributed to the stored row', async () => {
    const { impl } = stubTurns(UNPLACEABLE, structured({ 'customer.full_name': 'SUNITA DEVI' }));

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(extraction.providerRequestId).toBe('req-1,req-2');
  });

  it('puts the model answer through the same Aadhaar gate as a transcription (§19.3)', async () => {
    const { impl } = stubTurns(
      UNPLACEABLE,
      structured({ 'customer.address.printed': 'ID 123456789012, Ghazipur' }),
    );

    const { extraction, rawText } = await runExtraction(unplaceableInput(impl));

    expect(containsAadhaarLikeNumber(JSON.stringify(extraction.fields))).toBe(false);
    expect(containsAadhaarLikeNumber(rawText)).toBe(false);
  });

  it('still always reviews a high-risk field the model proposed', async () => {
    const { impl } = stubTurns(UNPLACEABLE, structured({ 'customer.category': 'obc' }));

    const { extraction } = await runExtraction(unplaceableInput(impl));
    const category = extraction.fields.find((field) => field.key === 'customer.category');

    expect(category?.status).toBe('needs_review');
    expect(category?.reviewReason).toBe('high_risk_field');
  });

  it('keeps the transcription result when the model maps nothing after all', async () => {
    const { impl, calls } = stubTurns(UNPLACEABLE, JSON.stringify({ fields: [] }));

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(calls).toHaveLength(2);
    expect(extraction.fields).toEqual([]);
    expect(codes(extraction.warnings)).not.toContain('AI_DYNAMIC_EXTRACTION_USED');
    expect(codes(extraction.warnings)).toContain('NO_FIELDS_FOUND');
  });

  it('says so when the model answers with something that will not parse', async () => {
    const { impl } = stubTurns(UNPLACEABLE, 'That is not JSON at all, sorry!');

    const { extraction } = await runExtraction(unplaceableInput(impl));

    expect(codes(extraction.warnings)).toContain('AI_STRUCTURED_INVALID');
    expect(codes(extraction.warnings)).not.toContain('AI_DYNAMIC_EXTRACTION_USED');
  });

  it('does not escalate a photograph, which has no fields by design', async () => {
    const { impl, calls } = stubTurns('Sunita', structured({ 'customer.full_name': 'SUNITA' }));

    const { extraction } = await runExtraction(
      withAi(impl, { extractionMode: 'ai', bytes: JPEG, mimeType: 'image/jpeg' }),
    );

    expect(extraction.documentType).toBe('photo');
    expect(calls).toHaveLength(1);
  });
});
