import 'server-only';

import { ROAMING_PURPOSE_LABELS, type RoamingPurpose } from '@assistigo/core';

/**
 * What the consent OTP message says.
 * Master spec §19.2, §20 (bilingual); migration 0024.
 *
 * Same discipline as `apps/web/lib/document-drop/messages.ts`: this is the one place the text
 * that leaves the system over WhatsApp/SMS is assembled, so "what does the citizen actually see"
 * stays reviewable in one file. The differences from the document-drop messages are deliberate:
 *
 *   - This message *does* name the requesting centre and the purpose — the whole point of a
 *     consent prompt is telling the citizen who is asking and why, so they can refuse a request
 *     that sounds wrong.
 *   - It still never carries anything about the citizen themselves: no name, no field value, no
 *     document content. `centreName` and `schemeTitle` are the operator's own inputs, not the
 *     customer's.
 *   - Only English + a short Hindi line, not the full bilingual block document-drop uses — this
 *     message is time-critical (a five-minute code) and is read once by someone already at a
 *     counter, not composed at leisure.
 */

function safeCentreName(name: string): string {
  const cleaned = name.replace(/[\r\n]+/g, ' ').trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

function safeSchemeTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = title.replace(/[\r\n]+/g, ' ').trim();
  if (cleaned === '') return null;
  return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
}

export function roamingOtpMessage(options: {
  centreName: string;
  purpose: RoamingPurpose;
  schemeTitle: string | null;
  otp: string;
  durationMinutes: number;
}): string {
  const centre = safeCentreName(options.centreName);
  const scheme = safeSchemeTitle(options.schemeTitle);
  const purposeLabel = ROAMING_PURPOSE_LABELS[options.purpose];
  const hours = Math.round((options.durationMinutes / 60) * 10) / 10;
  const windowLabel =
    hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${options.durationMinutes} minutes`;

  const reason = scheme
    ? `${purposeLabel.en.toLowerCase()}: ${scheme}`
    : purposeLabel.en.toLowerCase();

  return [
    '🔒 Assistigo Security Alert',
    `Operator "${centre}" is requesting temporary ${windowLabel} access to your saved profile and documents for ${reason}.`,
    '',
    `Your verification code is: ${options.otp}`,
    '⚠️ Valid for 5 minutes. Never share this code if you are not at this counter right now.',
  ].join('\n');
}
