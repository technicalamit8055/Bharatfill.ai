/**
 * WhatsApp / Telegram channel configuration — Super Admin panel (§9.1, §6.1).
 *
 * Schemas for the admin API request/response shapes only. Nothing here touches encryption or a
 * database row directly — that is apps/web/lib/admin/channels/service.ts, which is server-only.
 * Kept here rather than there because the request bodies need validating on the API boundary
 * (docs/DEVELOPMENT_RULES.md §2) and the response shape is what the admin UI imports for its
 * props, same split as the AI vendor settings surface.
 */

import { z } from 'zod';

export const CHANNEL_SOURCES = ['database', 'environment', 'unconfigured'] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

// ---------------------------------------------------------------------------
// Save requests
// ---------------------------------------------------------------------------

export const whatsappChannelConfigSchema = z.object({
  isEnabled: z.boolean(),
  phoneNumberId: z.string().trim().max(64).optional(),
  botNumber: z.string().trim().max(32).optional(),
  verifyToken: z.string().trim().min(16).max(200).optional(),
  /** Omitted: keep the stored token. `''`: clear it. Anything else: replace it. */
  accessToken: z.string().trim().max(2000).optional(),
  appSecret: z.string().trim().max(500).optional(),
});
export type WhatsappChannelConfigInput = z.infer<typeof whatsappChannelConfigSchema>;

export const telegramChannelConfigSchema = z.object({
  isEnabled: z.boolean(),
  botUsername: z.string().trim().max(64).optional(),
  webhookSecret: z.string().trim().min(16).max(256).optional(),
  /** Omitted: keep the stored token. `''`: clear it. Anything else: replace it. */
  botToken: z.string().trim().max(500).optional(),
});
export type TelegramChannelConfigInput = z.infer<typeof telegramChannelConfigSchema>;

export const saveChannelSettingsInputSchema = z.discriminatedUnion('channel', [
  whatsappChannelConfigSchema.extend({ channel: z.literal('whatsapp') }),
  telegramChannelConfigSchema.extend({ channel: z.literal('telegram') }),
]);
export type SaveChannelSettingsInput = z.infer<typeof saveChannelSettingsInputSchema>;

// ---------------------------------------------------------------------------
// Client-facing (masked) response shapes
// ---------------------------------------------------------------------------

export type WhatsappChannelSummary = {
  channel: 'whatsapp';
  isEnabled: boolean;
  source: ChannelSource;
  phoneNumberId: string | null;
  botNumber: string | null;
  verifyToken: string | null;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  webhookUrl: string;
};

export type TelegramChannelSummary = {
  channel: 'telegram';
  isEnabled: boolean;
  source: ChannelSource;
  botUsername: string | null;
  webhookSecret: string | null;
  hasBotToken: boolean;
  webhookUrl: string;
};

export const channelSettingsResponseSchema = z.object({
  whatsapp: z.custom<WhatsappChannelSummary>(),
  telegram: z.custom<TelegramChannelSummary>(),
});
export type ChannelSettingsResponse = {
  whatsapp: WhatsappChannelSummary;
  telegram: TelegramChannelSummary;
};

// ---------------------------------------------------------------------------
// Test connection / register webhook
// ---------------------------------------------------------------------------

export const testConnectionInputSchema = z.object({
  channel: z.enum(['whatsapp', 'telegram']),
});
export type TestConnectionInput = z.infer<typeof testConnectionInputSchema>;

export type TestConnectionResult = { ok: true } | { ok: false; reason: string };

export const registerWebhookInputSchema = z.object({
  channel: z.literal('telegram'),
});
export type RegisterWebhookInput = z.infer<typeof registerWebhookInputSchema>;

export type RegisterWebhookResult = { ok: true } | { ok: false; reason: string };
