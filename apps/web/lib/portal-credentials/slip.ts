import 'server-only';

import { providerUnavailable } from '@assistigo/core';
import type { Translator } from '../i18n';
import { isWhatsappConfigured, sendWhatsappTextResult } from '../document-drop/whatsapp';

/**
 * The login slip handed to the citizen — printed at the counter or sent to their own WhatsApp.
 * Spec §19.7a.
 *
 * The WhatsApp copy goes only to the mobile number on the customer's own record, from the
 * platform's WhatsApp number (never the operator's personal phone, which is how citizen data
 * piles up in cyber-cafe chats today). It does pass through Meta's Cloud API: the product owner
 * accepted that for this feature, and the operator chooses it per slip.
 */

export type SlipContent = {
  portalName: string;
  loginIdLabel: string;
  loginId: string;
  password: string | null;
  homeUrl: string | null;
};

export function buildSlipMessage(t: Translator, slip: SlipContent): string {
  const lines = [
    t('customers.portalLogins.slip.whatsappTitle', { portal: slip.portalName }),
    '',
    `${slip.loginIdLabel}: ${slip.loginId}`,
  ];
  if (slip.password !== null) {
    lines.push(`${t('customers.portalLogins.password')}: ${slip.password}`);
  }
  if (slip.homeUrl) lines.push(slip.homeUrl);
  lines.push('', t('customers.portalLogins.slip.keepPrivate'));
  return lines.join('\n');
}

/** Sends the slip; throws `providerUnavailable` so the operator is told it did not go out. */
export async function sendSlipOnWhatsapp(mobile: string, body: string): Promise<void> {
  if (!(await isWhatsappConfigured())) {
    throw providerUnavailable('errors.portal_slip_whatsapp_not_configured');
  }
  // Indian mobiles are stored as bare ten digits; the Cloud API wants the country code.
  const to = mobile.length === 10 ? `91${mobile}` : mobile;
  const sent = await sendWhatsappTextResult(to, body);
  if (!sent) throw providerUnavailable('errors.portal_slip_send_failed');
}
