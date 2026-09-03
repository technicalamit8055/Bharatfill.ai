/**
 * Tests for channel secret encryption.
 *
 * The service module's network calls (Meta Graph, Telegram Bot API) are thin `fetch` wrappers and
 * not worth mocking. What *is* worth pinning is the encryption contract underneath them, because
 * getting it wrong is silent: a wrongly-bound ciphertext still decrypts to something, or stops
 * decrypting months later when nobody remembers why.
 *
 * The AAD binding is the property under test. Each channel's secrets are encrypted under a
 * channel-scoped AAD, so a WhatsApp access token ciphertext cannot be moved into the Telegram
 * row and decrypted there.
 */

import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.FIELD_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

const { encryptField, decryptField } = await import('@assistigo/core/privacy/crypto');

// Mirrors the AAD the service and the two channel adapters build. Kept as a literal rather than
// imported so a change to the scheme has to be made deliberately in both places — silently
// re-deriving it here would let a rename pass tests while orphaning every stored ciphertext.
const aad = (channel: 'whatsapp' | 'telegram') => `${channel}:platform_channel_secret`;

describe('channel secret encryption', () => {
  it('round-trips a WhatsApp access token', () => {
    const token = 'EAAG-a-meta-graph-access-token';
    const ciphertext = encryptField(token, aad('whatsapp'));

    expect(ciphertext).not.toContain(token);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(decryptField(ciphertext, aad('whatsapp'))).toBe(token);
  });

  it('round-trips a Telegram bot token', () => {
    const token = '111111:a-telegram-bot-token';
    const ciphertext = encryptField(token, aad('telegram'));

    expect(ciphertext).not.toContain(token);
    expect(decryptField(ciphertext, aad('telegram'))).toBe(token);
  });

  it('refuses a ciphertext transplanted onto the other channel', () => {
    // The attack the AAD exists to stop: moving a stored secret between rows.
    const ciphertext = encryptField('a-whatsapp-secret', aad('whatsapp'));
    expect(() => decryptField(ciphertext, aad('telegram'))).toThrow();
  });

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    const ciphertext = encryptField('a-whatsapp-secret', aad('whatsapp'));
    const parts = ciphertext.split('.');
    const tampered = [parts[0], parts[1], parts[2], 'AAAA'].join('.');
    expect(() => decryptField(tampered, aad('whatsapp'))).toThrow();
  });
});
