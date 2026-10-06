import { z } from 'zod';
import { requirePermission, resolveContext, type RequestContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import {
  AI_PROVIDER_PRESETS,
  encryptOrgAiApiKey,
  isAllowedVendorBaseUrl,
  type AiVendorSettingsSummary,
} from '@/lib/ai/vendor-settings';
import type { OrganizationAiProvider, OrganizationAiSettingsRow } from '@/lib/supabase/database.types';

/**
 * `GET/PUT/DELETE /api/organizations/ai-settings`
 *
 * An organization's own AI vendor configuration (docs/AI_PIPELINE.md §2). This is new sensitive
 * surface — a third-party API key stored per organization — so the rules here are deliberately
 * stricter than the generic `PATCH /api/organizations/current`:
 *
 *   - Reading is open to any active member (the upload panel shows "read by" to an operator),
 *     but the key itself is never included in a response — only `hasApiKey`.
 *   - Writing requires `org.security`, which only the owner role carries (docs/SECURITY.md §3).
 *   - `enabled` here is the same `organizations.settings.ai_processing_enabled` flag the
 *     extraction pipeline has always read (docs/AI_PIPELINE.md §2) — this is its first write
 *     path anywhere in the app. Configuring a vendor without turning this on configures a key
 *     that the pipeline will never use.
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
  customPrompt: z.string().trim().max(8000).optional(),
  enabled: z.boolean().optional(),
});

async function loadRow(context: RequestContext): Promise<OrganizationAiSettingsRow | null> {
  const { data, error } = await context.supabase
    .from('organization_ai_settings')
    .select('*')
    .eq('organization_id', context.organization.id)
    .maybeSingle();
  if (error) throw error;
  return data as OrganizationAiSettingsRow | null;
}

function summaryOf(
  row: OrganizationAiSettingsRow | null,
  aiProcessingEnabled: boolean,
): AiVendorSettingsSummary {
  return {
    provider: row?.provider ?? 'deepseek',
    wireFormat: row?.wire_format ?? 'openai_compatible',
    baseUrl: row?.base_url ?? null,
    model: row?.model ?? null,
    customPrompt: row?.custom_prompt ?? null,
    hasApiKey: Boolean(row?.api_key_encrypted),
    enabled: aiProcessingEnabled,
  };
}

export const GET = handler('api.organizations.aiSettings.get', async (request) => {
  const context = await resolveContext(request);
  const row = await loadRow(context);
  const settings = (context.organization.settings ?? {}) as Record<string, unknown>;
  return ok(summaryOf(row, settings.ai_processing_enabled === true));
});

export const PUT = handler('api.organizations.aiSettings.put', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'org.security');

  const input = await parseBody(request, putSchema);
  const preset = AI_PROVIDER_PRESETS[input.provider];

  const patch: Record<string, unknown> = {
    provider: input.provider,
    wire_format: preset.wireFormat,
    updated_by: context.userId,
  };
  if (input.baseUrl !== undefined) patch.base_url = input.baseUrl === '' ? null : input.baseUrl;
  if (input.model !== undefined) patch.model = input.model === '' ? null : input.model;
  if (input.customPrompt !== undefined) {
    patch.custom_prompt = input.customPrompt === '' ? null : input.customPrompt;
  }
  if (input.apiKey !== undefined) {
    patch.api_key_encrypted =
      input.apiKey === '' ? null : await encryptOrgAiApiKey(context.organization.id, input.apiKey);
  }

  const { data, error } = await context.supabase
    .from('organization_ai_settings')
    .upsert({ organization_id: context.organization.id, ...patch }, { onConflict: 'organization_id' })
    .select('*')
    .single();

  if (error) throw error;

  let aiProcessingEnabled = (context.organization.settings as Record<string, unknown> | null)
    ?.ai_processing_enabled;
  if (input.enabled !== undefined) {
    const nextSettings = {
      ...((context.organization.settings ?? {}) as Record<string, unknown>),
      ai_processing_enabled: input.enabled,
    };
    const { error: settingsError } = await context.supabase
      .from('organizations')
      .update({ settings: nextSettings })
      .eq('id', context.organization.id);
    if (settingsError) throw settingsError;
    aiProcessingEnabled = input.enabled;
  }

  await writeAuditLog(context, {
    action: 'organization.ai_settings_updated',
    entityType: 'organization',
    entityId: context.organization.id,
    // Which fields changed and the provider chosen — never the key, the base URL or the
    // prompt text itself (§24.2).
    metadata: {
      fields: Object.keys(input),
      provider: input.provider,
      apiKeyChanged: input.apiKey !== undefined,
    },
  });

  return ok(summaryOf(data as OrganizationAiSettingsRow, aiProcessingEnabled === true));
});

export const DELETE = handler('api.organizations.aiSettings.delete', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'org.security');

  const { error } = await context.supabase
    .from('organization_ai_settings')
    .delete()
    .eq('organization_id', context.organization.id);
  if (error) throw error;

  await writeAuditLog(context, {
    action: 'organization.ai_settings_updated',
    entityType: 'organization',
    entityId: context.organization.id,
    metadata: { fields: ['deleted'] },
  });

  const settings = (context.organization.settings ?? {}) as Record<string, unknown>;
  return ok(summaryOf(null, settings.ai_processing_enabled === true));
});
