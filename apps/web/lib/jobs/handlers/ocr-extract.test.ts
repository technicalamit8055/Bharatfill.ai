/**
 * Tests for the `ocr.extract` job handler.
 *
 * The handler is where the extraction pipeline meets the database, so what is worth asserting
 * is the crossing itself: that the right statuses are written, that classification is allowed to
 * correct the operator's guess, and — the one that matters most — that nothing carrying a full
 * Aadhaar reaches a stored column.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIZEN_APP_ORGANIZATION_ID } from '@assistigo/core';
import { DEMO_DOCUMENT_BY_CODE, containsAadhaarLikeNumber } from '@assistigo/ai';

// serverEnv() validates the whole server schema on first call, so the required keys must exist
// before the module under test is imported.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.OCR_PROVIDER = 'mock';

process.env.FIELD_ENCRYPTION_KEY ??= Buffer.from('0'.repeat(32)).toString('base64');

const { handleOcrExtract, resolveAiProviderConfig } = await import('./ocr-extract');
const { encryptField } = await import('@assistigo/core/privacy/crypto');

type Captured = { table: string; op: 'upsert' | 'update'; payload: Record<string, unknown> };

/**
 * A stub Supabase client covering exactly the calls this handler makes. Deliberately small:
 * a general-purpose fake would be a second implementation to keep in sync.
 *
 * `organization_ai_settings` defaults to no row (`null`) — no organization in this suite has
 * configured its own vendor unless a test explicitly says so — and `organizations` defaults to
 * an empty settings blob, matching a fresh organization that has never opted into AI processing.
 */
function stubClient(
  document: Record<string, unknown> | null,
  fileText: string,
  options: {
    orgSettings?: Record<string, unknown>;
    aiVendorRow?: Record<string, unknown> | null;
    platformRow?: Record<string, unknown> | null;
  } = {},
) {
  const captured: Captured[] = [];
  const orgSettings = options.orgSettings ?? {};
  const aiVendorRow = options.aiVendorRow ?? null;

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        maybeSingle: () => {
          if (table === 'documents') return Promise.resolve({ data: document, error: null });
          if (table === 'organizations') {
            return Promise.resolve({ data: { settings: orgSettings }, error: null });
          }
          if (table === 'platform_ai_settings') {
            return Promise.resolve({ data: options.platformRow ?? null, error: null });
          }
          if (table === 'organization_ai_settings') {
            return Promise.resolve({ data: aiVendorRow, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(payload: Record<string, unknown>) {
          captured.push({ table, op: 'update', payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        upsert(payload: Record<string, unknown>) {
          captured.push({ table, op: 'upsert', payload });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        download: () =>
          Promise.resolve({
            data: { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(fileText).buffer) },
            error: null,
          }),
      }),
    },
  };

  // The handler's parameter is the real client type; this stub implements the slice it uses.
  return { client: client as never, captured };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organization_id: '22222222-2222-4222-8222-222222222222',
    storage_path: 'org/22222222-2222-4222-8222-222222222222/customer/x/y/demo.pdf',
    storage_bucket: 'customer-documents',
    original_filename: 'demo-aadhaar.pdf',
    mime_type: 'application/pdf',
    document_type: 'unknown',
    ...overrides,
  };
}

const aadhaarText = DEMO_DOCUMENT_BY_CODE.get('aadhaar_like')?.text ?? '';

function extractionRow(captured: Captured[]) {
  return captured.find((entry) => entry.table === 'document_extractions')?.payload;
}

function documentUpdate(captured: Captured[]) {
  return captured.find((entry) => entry.table === 'documents')?.payload;
}

describe('handleOcrExtract', () => {
  beforeEach(() => {
    // The handler logs a completion line; keep the test output readable.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('stores the extraction and marks the document as needing review', async () => {
    const { client, captured } = stubClient(documentRow(), aadhaarText);

    const result = await handleOcrExtract(client, { documentId: documentRow().id });

    expect(result).toEqual({ ok: true });
    expect(extractionRow(captured)?.status).toBe('review_required');
    expect(documentUpdate(captured)?.status).toBe('review_required');
  });

  it('lets classification correct the type the operator guessed on upload', async () => {
    const { client, captured } = stubClient(documentRow(), aadhaarText);
    await handleOcrExtract(client, { documentId: documentRow().id });

    expect(extractionRow(captured)?.document_type).toBe('aadhaar_like');
    expect(documentUpdate(captured)?.document_type).toBe('aadhaar_like');
  });

  it('keeps the operator label when classification cannot place the document', async () => {
    const { client, captured } = stubClient(
      documentRow({ document_type: 'income_certificate', original_filename: 'scan.pdf' }),
      'nothing recognisable on this page at all',
    );

    await handleOcrExtract(client, { documentId: documentRow().id });

    // Overwriting a human's label with `unknown` would lose information, not add it.
    expect(documentUpdate(captured)?.document_type).toBe('income_certificate');
  });

  it('never stores a full Aadhaar in the raw text or any field other than customer.aadhaar', async () => {
    const { client, captured } = stubClient(documentRow(), aadhaarText);
    await handleOcrExtract(client, { documentId: documentRow().id });

    const row = extractionRow(captured);
    expect(containsAadhaarLikeNumber(String(row?.raw_text ?? ''))).toBe(false);

    const fields = (row?.extracted_fields ?? []) as { key: string }[];
    const otherFields = fields.filter((field) => field.key !== 'customer.aadhaar');
    expect(containsAadhaarLikeNumber(JSON.stringify(otherFields))).toBe(false);
  });

  it('records the failure so the operator can see it, rather than failing silently', async () => {
    const { client, captured } = stubClient(documentRow(), aadhaarText);
    const broken = {
      ...(client as unknown as Record<string, unknown>),
      storage: {
        from: () => ({ download: () => Promise.reject(new Error('object not found')) }),
      },
    } as never;

    const result = await handleOcrExtract(broken, { documentId: documentRow().id });

    expect(result.ok).toBe(false);
    expect(extractionRow(captured)?.status).toBe('failed');
    expect(documentUpdate(captured)?.status).toBe('failed');
    // The provider's error string can echo page content, so only a stable code is stored.
    expect(extractionRow(captured)?.error_code).toBe('EXTRACTION_FAILED');
    expect(JSON.stringify(extractionRow(captured))).not.toContain('object not found');
  });

  it('treats a document deleted between enqueue and run as nothing to do', async () => {
    const { client, captured } = stubClient(null, aadhaarText);

    const result = await handleOcrExtract(client, { documentId: documentRow().id });

    expect(result).toEqual({ ok: true });
    expect(captured).toEqual([]);
  });

  it('rejects a payload that is not a document id', async () => {
    const { client } = stubClient(documentRow(), aadhaarText);
    await expect(handleOcrExtract(client, { documentId: 'not-a-uuid' })).rejects.toThrow();
  });
});

describe('handleOcrExtract reading method', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('accepts a reading method from the payload', async () => {
    const { client, captured } = stubClient(documentRow(), aadhaarText);

    const result = await handleOcrExtract(client, {
      documentId: documentRow().id,
      extractionMode: 'non_ai',
    });

    expect(result).toEqual({ ok: true });
    expect(extractionRow(captured)?.status).toBe('review_required');
  });

  it('defaults to auto for a job queued before reading methods existed', async () => {
    // Jobs already sitting in the queue carry no `extractionMode`; they must still run.
    const { client, captured } = stubClient(documentRow(), aadhaarText);

    const result = await handleOcrExtract(client, { documentId: documentRow().id });

    expect(result).toEqual({ ok: true });
    expect(extractionRow(captured)?.document_type).toBe('aadhaar_like');
  });

  it('rejects a reading method that is not one of the three', async () => {
    const { client } = stubClient(documentRow(), aadhaarText);

    await expect(
      handleOcrExtract(client, { documentId: documentRow().id, extractionMode: 'magic' }),
    ).rejects.toThrow();
  });

  it('cannot reach an AI provider from this deployment when none is configured', async () => {
    // OCR_AI_PROVIDER is unset in this suite, so `ai` must degrade rather than throw.
    const { client, captured } = stubClient(documentRow(), aadhaarText);

    const result = await handleOcrExtract(client, {
      documentId: documentRow().id,
      extractionMode: 'ai',
    });

    expect(result).toEqual({ ok: true });
    const warnings = JSON.stringify(extractionRow(captured)?.warnings ?? []);
    expect(warnings).toContain('AI_PROVIDER_NOT_CONFIGURED');
  });
});

describe('resolveAiProviderConfig', () => {
  it('falls back to the deployment-wide environment config when the organization has none', async () => {
    const { client } = stubClient(documentRow(), aadhaarText);

    const { aiProviderName, providerConfig } = await resolveAiProviderConfig(client, 'org-1');

    expect(aiProviderName).toBe('none'); // OCR_AI_PROVIDER is unset in this suite
    expect(providerConfig.apiKey).toBeUndefined();
  });

  it("prefers the organization's own configured vendor over the environment", async () => {
    const encryptedKey = encryptField('sk-org-secret', 'org-1:ai_vendor_api_key');
    const { client } = stubClient(documentRow(), aadhaarText, {
      aiVendorRow: {
        provider: 'openai',
        wire_format: 'openai_compatible',
        base_url: 'https://api.openai.com',
        model: 'gpt-4o',
        api_key_encrypted: encryptedKey,
        custom_prompt: 'Extract full name and DOB.',
      },
    });

    const { aiProviderName, providerConfig } = await resolveAiProviderConfig(client, 'org-1');

    expect(aiProviderName).toBe('org_ai_vendor');
    expect(providerConfig.apiKey).toBe('sk-org-secret');
    expect(providerConfig.baseUrl).toBe('https://api.openai.com');
    expect(providerConfig.model).toBe('gpt-4o');
    expect(providerConfig.wireFormat).toBe('openai_compatible');
    expect(providerConfig.customPrompt).toBe('Extract full name and DOB.');
    expect(providerConfig.name).toBe('openai');
  });

  it('reports "not configured" rather than crashing when the stored key cannot be decrypted', async () => {
    const { client } = stubClient(documentRow(), aadhaarText, {
      aiVendorRow: {
        provider: 'deepseek',
        wire_format: 'openai_compatible',
        base_url: null,
        model: null,
        api_key_encrypted: 'v1.not.a.real-ciphertext',
        custom_prompt: null,
      },
    });

    const { aiProviderName, providerConfig } = await resolveAiProviderConfig(client, 'org-1');

    expect(aiProviderName).toBe('org_ai_vendor');
    expect(providerConfig.apiKey).toBeUndefined();
  });
});

describe('the shared AI setup (0049)', () => {
  const platformRow = (enabled: boolean) => ({
    id: true,
    enabled,
    provider: 'vertex',
    wire_format: 'vertex_generate_content',
    base_url: null,
    model: 'shared-model',
    api_key_encrypted: encryptField('sk-shared', 'platform:ai_vendor_api_key'),
    custom_prompt: null,
  });
  const ownRow = {
    provider: 'openai',
    wire_format: 'openai_compatible',
    base_url: null,
    model: 'own-model',
    api_key_encrypted: null,
    custom_prompt: null,
  };

  it.each([true, false])("replaces a centre's own vendor (stored switch: %s)", async (on) => {
    const { client } = stubClient(documentRow(), aadhaarText, {
      platformRow: platformRow(on),
      aiVendorRow: ownRow,
    });

    const result = await resolveAiProviderConfig(client, 'org-1');

    expect(result.providerConfig.apiKey).toBe('sk-shared');
    expect(result.providerConfig.model).toBe('shared-model');
  });

  it('leaves the centre on its own setting until it is saved', async () => {
    const { client } = stubClient(documentRow(), aadhaarText, { aiVendorRow: ownRow });

    const result = await resolveAiProviderConfig(client, 'org-1');

    expect(result.providerConfig.model).toBe('own-model');
  });

  it('covers citizen app documents too', async () => {
    const { client } = stubClient(documentRow(), aadhaarText, { platformRow: platformRow(true) });

    const result = await resolveAiProviderConfig(client, CITIZEN_APP_ORGANIZATION_ID);

    expect(result.providerConfig.apiKey).toBe('sk-shared');
  });

  it.each([
    [true, false],
    [false, true],
    [false, false],
  ])('reads with AI whatever the old switches say (shared %s, centre %s)', async (on, orgOn) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
    const { client } = stubClient(documentRow(), aadhaarText, {
      platformRow: platformRow(on),
      orgSettings: { ai_processing_enabled: orgOn },
    });

    await handleOcrExtract(client, { documentId: documentRow().id, extractionMode: 'ai' });

    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
