/**
 * Tests for the channel settings schemas.
 *
 * The one thing that genuinely matters here is the three-way distinction a secret field has to
 * preserve: omitted means "keep what is stored", `''` means "clear it", and anything else means
 * "replace it". Collapsing omitted and empty — the obvious simplification — would silently wipe a
 * Super Admin's saved WhatsApp token every time they saved an unrelated field on the same card.
 */

import { describe, expect, it } from 'vitest';
import {
  saveChannelSettingsInputSchema,
  telegramChannelConfigSchema,
  testConnectionInputSchema,
  whatsappChannelConfigSchema,
} from './channels';

describe('whatsappChannelConfigSchema', () => {
  it('accepts a fully specified configuration', () => {
    const parsed = whatsappChannelConfigSchema.parse({
      isEnabled: true,
      phoneNumberId: '111111111111111',
      botNumber: '919900000000',
      verifyToken: 'a-verify-token-long-enough',
      accessToken: 'an-access-token',
      appSecret: 'an-app-secret',
    });

    expect(parsed.phoneNumberId).toBe('111111111111111');
    expect(parsed.accessToken).toBe('an-access-token');
  });

  it('distinguishes an omitted secret from a cleared one', () => {
    // Omitted: the caller is not touching the stored token.
    expect(whatsappChannelConfigSchema.parse({ isEnabled: true }).accessToken).toBeUndefined();
    // Empty string: the caller is explicitly clearing it.
    expect(
      whatsappChannelConfigSchema.parse({ isEnabled: true, accessToken: '' }).accessToken,
    ).toBe('');
  });

  it('refuses a verify token too short to be worth having', () => {
    expect(() =>
      whatsappChannelConfigSchema.parse({ isEnabled: true, verifyToken: 'short' }),
    ).toThrow();
  });

  it('trims surrounding whitespace off a pasted credential', () => {
    // Copy-pasting a token out of the Meta dashboard routinely brings a trailing newline with it.
    const parsed = whatsappChannelConfigSchema.parse({
      isEnabled: true,
      phoneNumberId: '  111111111111111  ',
    });
    expect(parsed.phoneNumberId).toBe('111111111111111');
  });
});

describe('telegramChannelConfigSchema', () => {
  it('accepts a fully specified configuration', () => {
    const parsed = telegramChannelConfigSchema.parse({
      isEnabled: true,
      botUsername: 'my_centre_bot',
      webhookSecret: 'a-webhook-secret-long-enough',
      botToken: '111111:a-bot-token',
    });

    expect(parsed.botUsername).toBe('my_centre_bot');
    expect(parsed.botToken).toBe('111111:a-bot-token');
  });

  it('refuses a webhook secret too short to be worth having', () => {
    expect(() =>
      telegramChannelConfigSchema.parse({ isEnabled: true, webhookSecret: 'short' }),
    ).toThrow();
  });
});

describe('saveChannelSettingsInputSchema', () => {
  it('routes on the channel discriminator', () => {
    const whatsapp = saveChannelSettingsInputSchema.parse({
      channel: 'whatsapp',
      isEnabled: true,
      phoneNumberId: '111111111111111',
    });
    expect(whatsapp.channel).toBe('whatsapp');

    const telegram = saveChannelSettingsInputSchema.parse({
      channel: 'telegram',
      isEnabled: false,
      botUsername: 'my_centre_bot',
    });
    expect(telegram.channel).toBe('telegram');
  });

  it('refuses an unknown channel', () => {
    // The table's own check constraint allows exactly these two; the schema must agree with it.
    expect(() =>
      saveChannelSettingsInputSchema.parse({ channel: 'signal', isEnabled: true }),
    ).toThrow();
  });
});

describe('testConnectionInputSchema', () => {
  it('accepts either channel and refuses anything else', () => {
    expect(testConnectionInputSchema.parse({ channel: 'whatsapp' }).channel).toBe('whatsapp');
    expect(testConnectionInputSchema.parse({ channel: 'telegram' }).channel).toBe('telegram');
    expect(() => testConnectionInputSchema.parse({ channel: 'web' })).toThrow();
  });
});
