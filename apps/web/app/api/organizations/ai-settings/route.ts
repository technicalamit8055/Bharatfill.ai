import { loadOrgAiSettings, loadPlatformAiSettings } from '@/lib/ai/vendor-settings';
import { resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * `GET /api/organizations/ai-settings` — whether AI reading is set up, for the upload panel's note.
 * Open to any active member, so it never names the vendor or model.
 *
 * Read-only: a Super Admin manages one setup for every centre at `/admin/ai`. The service-role
 * client is needed because tenants hold no grant on that table.
 */
export const GET = handler('api.organizations.aiSettings.get', async (request) => {
  const context = await resolveContext(request);

  const platform = await loadPlatformAiSettings(createSupabaseAdminClient());
  if (platform) return ok({ hasApiKey: platform.hasApiKey });

  const own = await loadOrgAiSettings(context.supabase, context.organization.id);
  return ok({ hasApiKey: Boolean(own?.apiKey) });
});
