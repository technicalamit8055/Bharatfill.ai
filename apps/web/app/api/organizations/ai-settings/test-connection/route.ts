import { z } from 'zod';
import { AiVisionOcrProvider } from '@assistigo/ai';
import { validationFailed } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import {
  AI_PROVIDER_PRESETS,
  isAllowedVendorBaseUrl,
  loadOrgAiSettings,
} from '@/lib/ai/vendor-settings';
import type { OrganizationAiProvider } from '@/lib/supabase/database.types';

/**
 * `POST /api/organizations/ai-settings/test-connection`
 *
 * Sends one trivial, harmless prompt to confirm an endpoint and key actually work, before an
 * owner saves them. Never sends a document — this exists precisely so a misconfigured vendor is
 * caught here instead of on a customer's upload.
 *
 * Accepts the settings-page form's current draft (which may include a key the owner has not
 * saved yet); any field left out falls back to what is already stored, so testing after typing
 * only a new base URL still uses the saved key.
 */
const bodySchema = z.object({
  provider: z
    .enum(['openai', 'anthropic', 'deepseek', 'gemini', 'ollama', 'openrouter', 'custom'])
    .optional(),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(500).optional(),
});

export const POST = handler('api.organizations.aiSettings.testConnection', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'org.security');

  const input = await parseBody(request, bodySchema);
  const stored = await loadOrgAiSettings(context.supabase, context.organization.id);

  const provider: OrganizationAiProvider = input.provider ?? stored?.provider ?? 'deepseek';
  const preset = AI_PROVIDER_PRESETS[provider];

  const apiKey = input.apiKey && input.apiKey !== '' ? input.apiKey : stored?.apiKey ?? undefined;
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

  const result = await vision.testConnection();
  return ok(result);
});
