import { z } from 'zod';
import { validationFailed } from '@assistigo/core';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { requirePlatformPermission, resolvePlatformContext } from '@/lib/admin/context';
import {
  AI_PROVIDER_PRESETS,
  encryptPlatformAiApiKey,
  isAllowedVendorBaseUrl,
  loadPlatformAiSettings,
} from '@/lib/ai/vendor-settings';
import { resolveOwnAiKey } from '@/lib/ai/key-sources';
import { handler, ok, parseBody } from '@/lib/api/response';
import type { OrganizationAiProvider } from '@/lib/supabase/database.types';

/**
 * `PUT /api/admin/ai-settings` — the one AI setup every centre uses (docs/AI_PIPELINE.md §2).
 *
 * Super Admin only (`platform.team.manage`). It covers every centre and the
 * citizen app; there is no on/off switch. The key is never returned.
 */

const providerSchema: z.ZodType<OrganizationAiProvider> = z.enum([
  'openai',
  'anthropic',
  'deepseek',
  'gemini',
  'vertex',
  'ollama',
  'openrouter',
  'custom',
]);

const putSchema = z.object({
  provider: providerSchema,
  baseUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || isAllowedVendorBaseUrl(value), {
      message: 'validation.ai_base_url_invalid',
    })
    .optional(),
  model: z.string().trim().max(200).optional(),
  /** Omitted: keep the stored key. `''`: clear it. Anything else: replace it. */
  apiKey: z.string().trim().max(500).optional(),
  /** Reuse the saved key of a centre the caller owns. Wins over `apiKey`. */
  copyKeyFrom: z.string().uuid().optional(),
  customPrompt: z.string().trim().max(8000).optional(),
});

export const PUT = handler('api.admin.aiSettings.put', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  const input = await parseBody(request, putSchema);
  const newKey = input.copyKeyFrom
    ? await resolveOwnAiKey(context.supabase, context.userId, input.copyKeyFrom)
    : input.apiKey;
  const existing = await loadPlatformAiSettings(context.supabase);

  const willHaveKey =
    newKey !== undefined ? newKey !== '' : (existing?.hasApiKey ?? false);
  // No key would silently stop AI reading at every centre.
  if (!willHaveKey) {
    throw validationFailed({ fields: { apiKey: 'admin.aiSettings.keyRequired' } });
  }

  const patch: Record<string, unknown> = {
    provider: input.provider,
    wire_format: AI_PROVIDER_PRESETS[input.provider].wireFormat,
    enabled: true,
    updated_by: context.userId,
  };
  if (input.baseUrl !== undefined) patch.base_url = input.baseUrl === '' ? null : input.baseUrl;
  if (input.model !== undefined) patch.model = input.model === '' ? null : input.model;
  if (input.customPrompt !== undefined) {
    patch.custom_prompt = input.customPrompt === '' ? null : input.customPrompt;
  }
  if (newKey !== undefined) {
    patch.api_key_encrypted =
      newKey === '' ? null : await encryptPlatformAiApiKey(newKey);
  }

  const { error } = await context.supabase
    .from('platform_ai_settings')
    .upsert({ id: true, ...patch }, { onConflict: 'id' });
  if (error) throw error;

  await writePlatformAuditLog(context.supabase, {
    actorUserId: context.userId,
    action: 'platform.ai_settings_updated',
    entityType: 'platform_ai_settings',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    // Never the key, the base URL or the prompt text itself (§24.2).
    metadata: {
      fields: Object.keys(input),
      provider: input.provider,
      apiKeyChanged: newKey !== undefined,
      ...(input.copyKeyFrom ? { keyCopiedFrom: input.copyKeyFrom } : {}),
    },
  });

  return ok({ hasApiKey: willHaveKey });
});
