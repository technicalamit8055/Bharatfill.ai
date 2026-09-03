import 'server-only';

import { providerUnavailable, type RoamingOtpChannel } from '@assistigo/core';
import { isWhatsappConfigured, sendWhatsappTextResult } from '../document-drop/whatsapp';

/**
 * Sends the consent OTP to the citizen's own phone.
 * Master spec §19.2; migration 0024.
 *
 * WhatsApp reuses `apps/web/lib/document-drop/whatsapp.ts` — same Cloud API credentials, same
 * database-first/environment-fallback resolution. Unlike the walk-in-bot's webhook replies,
 * this is a request path, not a webhook, so a send failure *does* propagate here, as
 * `providerUnavailable()` — an operator told the code went out when it did not would keep a
 * citizen waiting at the counter for nothing.
 *
 * SMS is deliberately unimplemented. No SMS gateway is configured anywhere in this deployment
 * (no provider, no credentials, no vendor account), and adding one is a vendor and billing
 * decision for the product owner, not something to guess at while wiring a feature
 * (docs/DEVELOPMENT_RULES.md §8, "Escalate, do not guess"). The channel is modelled in the
 * schema and the UI so it is a configuration change, not a migration, once a provider is chosen.
 */
export async function dispatchRoamingOtp(
  channel: RoamingOtpChannel,
  mobile: string,
  body: string,
): Promise<void> {
  if (channel === 'sms') {
    throw providerUnavailable('errors.roaming_sms_not_configured');
  }

  if (!(await isWhatsappConfigured())) {
    throw providerUnavailable('errors.roaming_whatsapp_not_configured');
  }

  // WhatsApp Cloud API expects the number with a country code; Indian mobiles are stored as
  // bare ten digits.
  const to = mobile.length === 10 ? `91${mobile}` : mobile;
  const sent = await sendWhatsappTextResult(to, body);
  if (!sent) throw providerUnavailable('errors.roaming_otp_send_failed');
}
