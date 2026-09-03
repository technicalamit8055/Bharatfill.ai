import { saveChannelSettingsInputSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { resolvePlatformContext, requirePlatformPermission } from '@/lib/admin/context';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import {
  loadAllChannelSettings,
  saveTelegramChannel,
  saveWhatsAppChannel,
} from '@/lib/admin/channels/service';

/**
 * `GET/POST /api/admin/channels` — Super Admin "Channels & Bots" (§9.1, §6.1).
 *
 * Gated on `platform.team.manage`, the same owner-tier permission as the rest of the internal
 * team screen: every centre's walk-in intake shares one WhatsApp number and one Telegram bot, so
 * changing this is a platform-wide act, not a per-tenant setting.
 *
 * GET is readable by anyone holding that permission and returns only masked indicators for
 * secrets (`hasAccessToken`/`hasAppSecret`/`hasBotToken`) — never a decrypted token. POST accepts
 * a draft for exactly one channel at a time, matching the two-card layout of the panel.
 */

export const GET = handler('api.admin.channels.get', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  return ok(await loadAllChannelSettings(context.supabase));
});

export const POST = handler('api.admin.channels.post', async (request) => {
  const context = await resolvePlatformContext(request);
  requirePlatformPermission(context, 'platform.team.manage');

  const input = await parseBody(request, saveChannelSettingsInputSchema);

  if (input.channel === 'whatsapp') {
    await saveWhatsAppChannel(context.supabase, input, context.userId);
  } else {
    await saveTelegramChannel(context.supabase, input, context.userId);
  }

  await writePlatformAuditLog(context.supabase, {
    actorUserId: context.userId,
    action: 'platform.channel_settings_updated',
    entityType: 'platform_channel_settings',
    entityId: input.channel,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    // Which fields changed and whether a secret was replaced — never the secret, the phone
    // number id or the verify token itself (§19.6, §24.2).
    metadata: {
      channel: input.channel,
      isEnabled: input.isEnabled,
      fields: Object.keys(input).filter((key) => key !== 'channel'),
      secretChanged:
        input.channel === 'whatsapp'
          ? input.accessToken !== undefined || input.appSecret !== undefined
          : input.botToken !== undefined,
    },
  });

  return ok(await loadAllChannelSettings(context.supabase));
});
