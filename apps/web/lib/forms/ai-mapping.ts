import 'server-only';

import { createHash } from 'node:crypto';
import { AiVisionOcrProvider, getOcrProvider, isAiProviderConfigured } from '@assistigo/ai';
import {
  AI_MAPPING_PROMPT_VERSION,
  AI_MAPPING_SYSTEM_PROMPT,
  aiDescriptorCacheKey,
  buildAiMappingRequest,
  buildAiMappingUserPrompt,
  parseAiMappingResponse,
  toAiFieldMappings,
  type AiFieldMapping,
  type AiMappingRequest,
  type DetectedField,
  type PageContext,
} from '@assistigo/form-engine';
import { serverEnv } from '../env';
import { logger } from '../api/logger';
import { createSupabaseAdminClient, type AssistigoSupabaseClient } from '../supabase/server';
import { resolveAiProviderConfig } from '../jobs/handlers/ocr-extract';

/**
 * AI-assisted mapping, server side (§14.3 priority 5; docs/FORM_ENGINE.md §6d).
 *
 * What is sent and how the answer is checked is decided in packages/form-engine/src/ai-mapping.ts.
 * This file only adds the network: the shared vendor setup, a time budget, and a cache shared by
 * every centre so that each portal box is asked about once rather than on every Detect.
 *
 * It never throws and never blocks a mapping. A missing key, a slow vendor or a garbled reply all
 * end the same way: the boxes stay unmapped and the operator can still teach them.
 */

/** Detect must stay quick: past this, the proposal goes back without AI suggestions. */
export const AI_MAPPING_TIMEOUT_MS = 8_000;
/** Cached answers are re-asked after this, in case a better model or prompt is in use. */
export const AI_MAPPING_CACHE_DAYS = 30;

export type CachedAnswer = { customerField: string | null; confidence: number };

export type AiMappingCache = {
  read(hashes: readonly string[]): Promise<Map<string, CachedAnswer>>;
  write(
    rows: readonly (CachedAnswer & { hash: string; portalHost: string })[],
  ): Promise<void>;
};

export type AiCompleter = (systemPrompt: string, userPrompt: string) => Promise<string>;

export type AiMappingOutcome = {
  mappings: AiFieldMapping[];
  /** Boxes sent to the model in this request. */
  asked: number;
  /** Boxes answered from the cache. */
  cached: number;
  status: 'ok' | 'skipped' | 'failed';
};

export function descriptorHash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function subset(request: AiMappingRequest, refs: ReadonlySet<string>): AiMappingRequest {
  return {
    ...request,
    fields: request.fields.filter((field) => refs.has(field.ref)),
    signatures: Object.fromEntries(
      Object.entries(request.signatures).filter(([ref]) => refs.has(ref)),
    ),
  };
}

/**
 * Suggestions for the boxes nothing else mapped. `complete` null means "no vendor configured" —
 * the cache is still used, so boxes another centre's request already answered still get mapped.
 */
export async function suggestAiMappings(input: {
  candidates: readonly DetectedField[];
  page: Pick<PageContext, 'origin' | 'path'>;
  complete: AiCompleter | null;
  cache: AiMappingCache | null;
}): Promise<AiMappingOutcome> {
  const request = buildAiMappingRequest(input.candidates, input.page);
  if (!request) return { mappings: [], asked: 0, cached: 0, status: 'skipped' };

  const hashByRef = new Map(
    request.fields.map((field) => [
      field.ref,
      descriptorHash(aiDescriptorCacheKey(request.portal, field)),
    ]),
  );

  const answers = new Map<string, CachedAnswer>();
  if (input.cache) {
    try {
      const hits = await input.cache.read([...hashByRef.values()]);
      for (const [ref, hash] of hashByRef) {
        const hit = hits.get(hash);
        if (hit) answers.set(ref, hit);
      }
    } catch {
      // A cache outage costs a model call, nothing more.
    }
  }
  const cached = answers.size;

  const missing = new Set([...hashByRef.keys()].filter((ref) => !answers.has(ref)));
  if (missing.size === 0 || !input.complete) {
    return {
      mappings: toAiFieldMappings(answers, request.signatures),
      asked: 0,
      cached,
      status: missing.size === 0 ? 'ok' : 'skipped',
    };
  }

  const ask = subset(request, missing);
  let status: AiMappingOutcome['status'] = 'ok';
  try {
    const reply = await input.complete(AI_MAPPING_SYSTEM_PROMPT, buildAiMappingUserPrompt(ask));
    const fresh = parseAiMappingResponse(reply, ask);
    if (fresh.size === 0) status = 'failed';
    for (const [ref, answer] of fresh) answers.set(ref, answer);

    // Only what the model actually answered is cached — an omitted box is asked again next time.
    if (input.cache && fresh.size > 0) {
      await input.cache
        .write(
          [...fresh].map(([ref, answer]) => ({
            ...answer,
            hash: hashByRef.get(ref) ?? '',
            portalHost: request.portal,
          })),
        )
        .catch(() => undefined);
    }
  } catch {
    status = 'failed';
  }

  return {
    mappings: toAiFieldMappings(answers, request.signatures),
    asked: ask.fields.length,
    cached,
    status,
  };
}

/** The shared cache table (migration 0052). Service-role only: no tenant can read or write it. */
export function supabaseAiMappingCache(
  admin: AssistigoSupabaseClient,
  now: () => Date = () => new Date(),
): AiMappingCache {
  return {
    async read(hashes) {
      const result = new Map<string, CachedAnswer>();
      if (hashes.length === 0) return result;
      const since = new Date(now().getTime() - AI_MAPPING_CACHE_DAYS * 86_400_000).toISOString();
      const { data, error } = await admin
        .from('ai_field_mapping_cache')
        .select('descriptor_hash, customer_field, confidence')
        .in('descriptor_hash', [...hashes])
        .eq('prompt_version', AI_MAPPING_PROMPT_VERSION)
        .gte('created_at', since);
      if (error) throw error;
      for (const row of (data ?? []) as {
        descriptor_hash: string;
        customer_field: string | null;
        confidence: number | string;
      }[]) {
        result.set(row.descriptor_hash, {
          customerField: row.customer_field,
          confidence: Number(row.confidence),
        });
      }
      return result;
    },
    async write(rows) {
      const valid = rows.filter((row) => /^[0-9a-f]{64}$/.test(row.hash));
      if (valid.length === 0) return;
      const { error } = await admin.from('ai_field_mapping_cache').upsert(
        valid.map((row) => ({
          descriptor_hash: row.hash,
          portal_host: row.portalHost.slice(0, 255),
          customer_field: row.customerField,
          confidence: Number(row.confidence.toFixed(3)),
          prompt_version: AI_MAPPING_PROMPT_VERSION,
          created_at: now().toISOString(),
        })),
        { onConflict: 'descriptor_hash' },
      );
      if (error) throw error;
    },
  };
}

/**
 * The vendor and the cache for this request, or `null` when AI mapping is switched off for the
 * deployment. Uses the same shared AI setup as document reading (`platform_ai_settings`, then a
 * centre's earlier row, then the environment).
 */
export async function loadAiMappingDeps(
  organizationId: string,
): Promise<{ complete: AiCompleter | null; cache: AiMappingCache } | null> {
  if (serverEnv().AI_FIELD_MAPPING === 'off') return null;

  const admin = createSupabaseAdminClient();
  const cache = supabaseAiMappingCache(admin);

  try {
    const { aiProviderName, providerConfig } = await resolveAiProviderConfig(admin, organizationId);
    if (!isAiProviderConfigured(aiProviderName, providerConfig)) return { complete: null, cache };

    const provider = getOcrProvider(aiProviderName, {
      ...providerConfig,
      // Not a document read: the organization's document prompt does not apply here.
      customPrompt: undefined,
      timeoutMs: AI_MAPPING_TIMEOUT_MS,
    });
    if (!(provider instanceof AiVisionOcrProvider)) return { complete: null, cache };

    return {
      complete: async (systemPrompt, userPrompt) =>
        (await provider.completeText(systemPrompt, userPrompt)).text,
      cache,
    };
  } catch (error) {
    // The code only — the vendor's message can echo request content (§24.2).
    logger.warn('forms.ai_mapping_unavailable', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    return { complete: null, cache };
  }
}
