import 'server-only';

import {
  buildTelegramDropLink,
  buildWebDropLink,
  buildWhatsAppDropLink,
  type DropChannel,
} from '@assistigo/core';
import { publicEnv } from '../env';
import { isTelegramConfigured, telegramBotUsername } from './telegram';
import { isWhatsappConfigured, whatsappBotNumber } from './whatsapp';

/**
 * The links behind the QR, resolved server-side.
 *
 * The bot number and bot handle are read from server env and never shipped to the browser as
 * configuration — the client gets finished URLs. That is not secrecy (the number is printed on a
 * standee); it is so a client bundle never has to know how to construct one, and so a channel
 * that is not configured simply is not offered.
 */

export type DropLinks = {
  /** Present only when that channel is fully configured. Absent means "do not offer it". */
  whatsapp: string | null;
  telegram: string | null;
  /** Always present: the mobile web drop needs no third-party credentials at all. */
  web: string;
};

export async function buildDropLinks(code: string): Promise<DropLinks> {
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  const [waConfigured, number, tgConfigured, handle] = await Promise.all([
    isWhatsappConfigured(),
    whatsappBotNumber(),
    isTelegramConfigured(),
    telegramBotUsername(),
  ]);

  return {
    whatsapp: waConfigured && number ? buildWhatsAppDropLink(number, code) : null,
    telegram: tgConfigured && handle ? buildTelegramDropLink(handle, code) : null,
    web: buildWebDropLink(appUrl, code),
  };
}

/** Channels an operator can actually be shown right now. */
export async function availableDropChannels(): Promise<DropChannel[]> {
  const [waConfigured, number, tgConfigured, handle] = await Promise.all([
    isWhatsappConfigured(),
    whatsappBotNumber(),
    isTelegramConfigured(),
    telegramBotUsername(),
  ]);

  const channels: DropChannel[] = [];
  if (waConfigured && number) channels.push('whatsapp');
  if (tgConfigured && handle) channels.push('telegram');
  channels.push('web');
  return channels;
}
