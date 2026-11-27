import { describe, expect, it, vi } from 'vitest';
import type { DetectedField } from '@assistigo/form-engine';
import type { AiMappingCache as Cache } from './ai-mapping';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

const { suggestAiMappings, descriptorHash } = await import('./ai-mapping');

// Synthetic values only — never real citizen data.
const PAGE = { origin: 'https://forms.demo.assistigo.test', path: '/apply' };

function field(signature: string, labelText: string): DetectedField {
  return {
    signature,
    tagName: 'input',
    inputType: 'text',
    name: null,
    id: null,
    placeholder: null,
    labelText,
    ariaLabel: null,
    nearbyText: null,
    sectionHeading: null,
    options: null,
    required: false,
    maxLength: null,
    pattern: null,
    accept: null,
    hasValue: false,
    visible: true,
    disabled: false,
    readOnly: false,
    frame: 0,
    order: 0,
  };
}

const BOXES = [field('a', 'Naam-e-Walid'), field('b', 'Zzq unknown')];

function memoryCache(seed: Map<string, { customerField: string | null; confidence: number }> = new Map()) {
  const store = new Map(seed);
  const writes: { hash: string; customerField: string | null }[] = [];
  const cache: Cache = {
    read: async (hashes) => new Map(hashes.filter((h) => store.has(h)).map((h) => [h, store.get(h)!])),
    write: async (rows) => {
      for (const row of rows) {
        store.set(row.hash, row);
        writes.push({ hash: row.hash, customerField: row.customerField });
      }
    },
  };
  return { cache, store, writes };
}

const REPLY = JSON.stringify({
  mappings: [
    { ref: 'f1', key: 'customer.father_name', confidence: 0.9 },
    { ref: 'f2', key: null, confidence: 0.2 },
  ],
});

describe('suggestAiMappings', () => {
  it('asks the model about leftover boxes and caches both answers, including the null', async () => {
    const { cache, writes } = memoryCache();
    const complete = vi.fn(async () => REPLY);

    const outcome = await suggestAiMappings({ candidates: BOXES, page: PAGE, complete, cache });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ status: 'ok', asked: 2, cached: 0 });
    expect(outcome.mappings).toEqual([
      { fieldSignature: 'a', customerField: 'customer.father_name', confidence: 0.85 },
    ]);
    expect(writes.map((write) => write.customerField)).toEqual(['customer.father_name', null]);
  });

  it('answers from the cache next time without calling the model', async () => {
    const { cache } = memoryCache();
    await suggestAiMappings({ candidates: BOXES, page: PAGE, complete: async () => REPLY, cache });

    const complete = vi.fn(async () => REPLY);
    const outcome = await suggestAiMappings({ candidates: BOXES, page: PAGE, complete, cache });

    expect(complete).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'ok', asked: 0, cached: 2 });
    expect(outcome.mappings).toHaveLength(1);
  });

  it('sends only the boxes the cache does not know', async () => {
    const { cache } = memoryCache();
    await suggestAiMappings({
      candidates: [BOXES[0]!],
      page: PAGE,
      complete: async () => '{"mappings":[{"ref":"f1","key":"customer.father_name","confidence":0.9}]}',
      cache,
    });

    let sent = '';
    await suggestAiMappings({
      candidates: BOXES,
      page: PAGE,
      complete: async (_system, user) => {
        sent = user;
        return '{"mappings":[{"ref":"f2","key":null,"confidence":0.1}]}';
      },
      cache,
    });
    expect(sent).toContain('Zzq unknown');
    expect(sent).not.toContain('Naam-e-Walid');
  });

  it('still uses the cache when no vendor is configured', async () => {
    const { cache } = memoryCache();
    await suggestAiMappings({ candidates: BOXES, page: PAGE, complete: async () => REPLY, cache });

    const outcome = await suggestAiMappings({ candidates: BOXES, page: PAGE, complete: null, cache });
    expect(outcome.mappings).toHaveLength(1);
  });

  it('never throws: a failing vendor or cache leaves the boxes unmapped', async () => {
    const broken: Cache = {
      read: async () => {
        throw new Error('down');
      },
      write: async () => {
        throw new Error('down');
      },
    };
    const outcome = await suggestAiMappings({
      candidates: BOXES,
      page: PAGE,
      complete: async () => {
        throw new Error('timeout');
      },
      cache: broken,
    });
    expect(outcome).toMatchObject({ status: 'failed', mappings: [] });
  });

  it('treats a garbled reply as a failure and caches nothing', async () => {
    const { cache, writes } = memoryCache();
    const outcome = await suggestAiMappings({
      candidates: BOXES,
      page: PAGE,
      complete: async () => 'Sorry, I cannot do that.',
      cache,
    });
    expect(outcome.status).toBe('failed');
    expect(writes).toEqual([]);
  });

  it('skips without a call when there is nothing to ask about', async () => {
    const complete = vi.fn(async () => REPLY);
    const outcome = await suggestAiMappings({ candidates: [], page: PAGE, complete, cache: null });
    expect(outcome.status).toBe('skipped');
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('descriptorHash', () => {
  it('is a 64-character hex digest, as the table requires', () => {
    expect(descriptorHash('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
