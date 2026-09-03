import { registerWebhookInputSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { resolvePlatformContext, requirePlatformPermission } from '@/lib/admin/context';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { registerTelegramWebhook } from '@/lib/admin/channels/service';

/**
 * `POST /api/admin/channels/set-webhook` — 1-click Telegram `setWebhook` registration.
 *
 * Telegram, unlike Meta, has no dashboard handshake: the only documented way to point a bot at a
 * webhook URL is one `setWebhook` API call. This endpoint makes that call directly with the
 * saved (or env-fallback) bot token and secret, so an operator never has to run curl by hand —
 * the one manual step the implementation plan calls out explicitly.
 *
 * WhatsApp needs no equivalent: Meta's webhook subscription is configured once in the Meta App
 * dashboard against a fixed verify token, which `/api/webhooks/whatsapp`'s GET handler already
 * answers.
 */
export const POST = handler('api.admin.channels.setWebhook', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  await parseBody(request, registerWebhookInputSchema);
  const result = await registerTelegramWebhook(context.supabase);

  await writePlatformAuditLog(context.supabase, {
    actorUserId: context.userId,
    action: 'platform.channel_webhook_registered',
    entityType: 'platform_channel_settings',
    entityId: 'telegram',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { channel: 'telegram', ok: result.ok },
  });

  return ok(result);
});
