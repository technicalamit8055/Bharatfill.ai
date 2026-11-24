import { z } from 'zod';
import { AiVisionOcrProvider } from '@assistigo/ai';
import { validationFailed } from '@assistigo/core';
import { requirePlatformPermission, resolvePlatformContext } from '@/lib/admin/context';
import { logger } from '@/lib/api/logger';
import { resolveOwnAiKey } from '@/lib/ai/key-sources';
import { handler, ok, parseBody } from '@/lib/api/response';
import {
  AI_PROVIDER_PRESETS,
  isAllowedVendorBaseUrl,
  loadPlatformAiSettings,
} from '@/lib/ai/vendor-settings';
import type { OrganizationAiProvider } from '@/lib/supabase/database.types';

/**
 * `POST /api/admin/ai-settings/test-connection`
 *
 * Sends one trivial, harmless prompt to confirm an endpoint and key actually work, before
 * they are saved. Never sends a document — this exists precisely so a misconfigured vendor is
 * caught here instead of on a customer's upload.
 *
 * Accepts the settings-page form's current draft (which may include a key not saved
 * yet); any field left out falls back to what is already stored, so testing after typing
 * only a new base URL still uses the saved key.
 */
const bodySchema = z.object({
  provider: z
    .enum(['openai', 'anthropic', 'deepseek', 'gemini', 'vertex', 'ollama', 'openrouter', 'custom'])
    .optional(),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(500).optional(),
  copyKeyFrom: z.string().uuid().optional(),
});

export const POST = handler('api.admin.aiSettings.testConnection', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  const input = await parseBody(request, bodySchema);
  const stored = await loadPlatformAiSettings(context.supabase);

  const provider: OrganizationAiProvider = input.provider ?? stored?.provider ?? 'deepseek';
  const preset = AI_PROVIDER_PRESETS[provider];

  const apiKey = input.copyKeyFrom
    ? await resolveOwnAiKey(context.supabase, context.userId, input.copyKeyFrom)
    : input.apiKey && input.apiKey !== ''
      ? input.apiKey
      : (stored?.apiKey ?? undefined);
  if (!apiKey) {
    throw validationFailed({ fields: { apiKey: 'validation.ai_api_key_required' } });
  }

  const baseUrl =
    input.baseUrl && input.baseUrl !== '' ? input.baseUrl : stored?.baseUrl ?? preset.defaultBaseUrl;
  // `custom` and `ollama` have no vendor-specific default (§ vendor-settings.ts) — without one,
  // there is nothing to test, and falling through to the provider's own baked-in default would
  // silently send this key to a different vendor's endpoint than the one being tested.
  if (baseUrl === '') {
    throw validationFailed({ fields: { baseUrl: 'validation.ai_base_url_required' } });
  }
  if (!isAllowedVendorBaseUrl(baseUrl)) {
    throw validationFailed({ fields: { baseUrl: 'validation.ai_base_url_invalid' } });
  }

  const model = input.model && input.model !== '' ? input.model : stored?.model ?? undefined;

  const vision = new AiVisionOcrProvider({
    name: provider,
    apiKey,
    baseUrl,
    ...(model !== undefined ? { model } : {}),
    wireFormat: preset.wireFormat,
    timeoutMs: 15_000,
  });

  logger.debug('api.admin.aiSettings.testConnection.request', {
    provider,
    baseUrl,
    model: model ?? '(default)',
    wireFormat: preset.wireFormat,
    hasApiKey: !!apiKey,
  });

  const result = await vision.testConnection();

  logger.debug('api.admin.aiSettings.testConnection.result', { ok: result.ok });

  return ok(result);
});
