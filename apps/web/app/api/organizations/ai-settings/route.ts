import { isCitizenAppOrganization } from '@assistigo/core';
import { loadOrgAiSettings, loadPlatformAiSettings } from '@/lib/ai/vendor-settings';
import { resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * `GET /api/organizations/ai-settings` — which vendor reads this centre's documents, and whether
 * AI reading is on, for the upload panel's "read by" note. Open to any active member.
 *
 * Read-only: a Super Admin manages one setup for every centre at `/admin/ai`. The service-role
 * client is needed because tenants hold no grant on that table; only these three fields leave.
 */
export const GET = handler('api.organizations.aiSettings.get', async (request) => {
  const context = await resolveContext(request);
  const organizationId = context.organization.id;

  const platform = isCitizenAppOrganization(organizationId)
    ? null
    : await loadPlatformAiSettings(createSupabaseAdminClient());
  if (platform) {
    return ok({
      provider: platform.provider,
      hasApiKey: platform.hasApiKey,
      enabled: platform.enabled,
    });
  }

  const own = await loadOrgAiSettings(context.supabase, organizationId);
  const settings = (context.organization.settings ?? {}) as Record<string, unknown>;

  return ok({
    provider: own?.provider ?? 'deepseek',
    hasApiKey: Boolean(own?.apiKey),
    enabled: settings.ai_processing_enabled === true,
  });
});
