import { testConnectionInputSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { resolvePlatformContext, requirePlatformPermission } from '@/lib/admin/context';
import { runChannelTest } from '@/lib/admin/channels/service';

/**
 * `POST /api/admin/channels/test` — verify a channel's saved credentials before relying on them.
 *
 * Reads whatever is currently saved (or falls back to environment variables, same as the intake
 * webhooks) rather than accepting a draft token from the request body: the admin screen never
 * receives a decrypted secret back from GET, so there is nothing for it to resend here. Save
 * first, then test — the same order the AI vendor settings test-connection button uses.
 */
export const POST = handler('api.admin.channels.test', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  const input = await parseBody(request, testConnectionInputSchema);
  const result = await runChannelTest(context.supabase, input.channel);

  return ok(result);
});
