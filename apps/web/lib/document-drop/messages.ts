import 'server-only';

/**
 * What the bot says to the citizen.
 * Master spec §20 (bilingual), §19 (privacy).
 *
 * These live here rather than in `messages/en.json` on purpose. Everything in that catalogue is
 * rendered by the dashboard for an operator; this is the only text in the product that leaves
 * the system and is read by a member of the public over a third-party network. Keeping it apart
 * makes one property auditable at a glance: **nothing outbound is ever interpolated from
 * customer data.** The only substitution any of these takes is the centre's own business name
 * and a file count.
 *
 * Both languages go out together in one message. A citizen at a counter in Sitapur may read
 * either, the operator's locale is not theirs, and asking a stranger to pick a language before
 * they can send a photo is exactly the friction this feature exists to remove.
 */

/** Trimmed hard: a business name is operator-supplied text going to a third party. */
function safeCentreName(name: string): string {
  const cleaned = name.replace(/[\r\n]+/g, ' ').trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

export function welcomeMessage(centreName: string): string {
  const centre = safeCentreName(centreName);
  return [
    `नमस्ते! ${centre} में आपका स्वागत है।`,
    'कृपया अपने दस्तावेज़ भेजें — आधार, मार्कशीट, फोटो, हस्ताक्षर।',
    'हर दस्तावेज़ की एक साफ़ फोटो भेजें। भेजने के बाद DONE लिखें।',
    '',
    `Welcome to ${centre}.`,
    'Please send your documents — Aadhaar, marksheet, photo, signature.',
    'Send one clear photo of each. Type DONE when you have finished.',
  ].join('\n');
}

export function receivedMessage(count: number): string {
  return [
    `✅ ${count} दस्तावेज़ प्राप्त हुए। और भेजें, या समाप्त होने पर DONE लिखें।`,
    `✅ ${count} document(s) received. Send more, or type DONE when finished.`,
  ].join('\n');
}

export function doneMessage(): string {
  return [
    'धन्यवाद! आपके दस्तावेज़ ऑपरेटर को मिल गए हैं। कृपया काउंटर पर संपर्क करें।',
    'Thank you. Your documents have reached the operator. Please see them at the counter.',
  ].join('\n');
}

/**
 * The reply to an unrecognised or expired code.
 *
 * Says the code did not work without saying why, and never confirms whether a code exists.
 * This endpoint is reachable by anyone with the bot's number, so a message that distinguished
 * "no such code" from "that code has expired" would be a way to enumerate live sessions at
 * every centre on the platform.
 */
export function unknownCodeMessage(): string {
  return [
    'यह कोड काम नहीं कर रहा। कृपया काउंटर पर दिखाए गए QR को दोबारा स्कैन करें।',
    'That code did not work. Please scan the QR shown at the counter again.',
  ].join('\n');
}

/** Sent when a file arrives from somebody with no live session — a stale chat, usually. */
export function noSessionMessage(): string {
  return [
    'कृपया पहले काउंटर पर लगे QR कोड को स्कैन करें, फिर दस्तावेज़ भेजें।',
    'Please scan the QR code at the counter first, then send your documents.',
  ].join('\n');
}

/** Sent when a file could not be accepted — wrong format, too large, or the session is full. */
export function rejectedFileMessage(): string {
  return [
    'यह फ़ाइल स्वीकार नहीं हुई। कृपया JPG, PNG या PDF में 15 MB से कम भेजें।',
    'That file was not accepted. Please send a JPG, PNG or PDF under 15 MB.',
  ].join('\n');
}
