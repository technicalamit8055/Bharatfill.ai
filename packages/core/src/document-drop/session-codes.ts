/**
 * Drop codes and the deep links built from them.
 * Master spec §9.1.
 *
 * A drop code is read off a screen or a laminated tent card by somebody standing in a queue, so
 * it is short and typo-resistant before it is anything else. Everything here is pure — the
 * randomness is injected — which is what makes the format testable rather than merely plausible.
 */

/**
 * Digits 2–9. Zero and one are the two characters people confuse with letters when reading a
 * code off a standee at arm's length, and dropping them costs only a fifth of the keyspace.
 */
const CODE_DIGITS = '23456789';

/** Session codes are prefixed so an inbound message is recognisable as one at a glance. */
export const DROP_CODE_PREFIX = 'DROP';

const DROP_CODE_PATTERN = /^DROP-[2-9]{4}$/;

/**
 * Three initials and a three-digit sequence — the exact shape `generateCounterCode` issues.
 *
 * Strict on purpose. A looser pattern like `[A-Z0-9]{4,12}` would match "NAMASTE", and the first
 * citizen to open the chat with a greeting would have it read as a request to open a session at
 * some other centre. The column's check constraint in 0022 is wider than this because it guards
 * storage; this guards what an inbound stranger's message is allowed to mean.
 */
const COUNTER_CODE_PATTERN = /^[A-Z]{3}[0-9]{3}$/;

/** Any code the resolver will look up — a session code or a permanent counter code. */
export const ANY_DROP_CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;

function pick(random: () => number, alphabet: string): string {
  const index = Math.floor(random() * alphabet.length);
  return alphabet[Math.min(Math.max(index, 0), alphabet.length - 1)] ?? alphabet[0] ?? '2';
}

/**
 * A code for one desk session, e.g. `DROP-7429`.
 *
 * Four digits is 4,096 combinations, which would be far too few for a permanent identifier and
 * is ample for one that has to be unique only among live sessions across the platform. The
 * caller retries on collision — see `createDropSession`.
 */
export function generateDropSessionCode(random: () => number = Math.random): string {
  let digits = '';
  for (let index = 0; index < 4; index += 1) digits += pick(random, CODE_DIGITS);
  return `${DROP_CODE_PREFIX}-${digits}`;
}

export function isDropSessionCode(value: string): boolean {
  return DROP_CODE_PATTERN.test(value);
}

/**
 * A permanent code for a printed standee, e.g. `KSK829`.
 *
 * Initials plus a per-tenant sequence: the initials make it recognisable as *this* centre's card
 * when two lie on the same counter, and the sequence is what actually makes it unique. Centres
 * with a one-word or non-Latin name fall back to a padded `CSC` block rather than producing a
 * one-character code.
 */
export function generateCounterCode(organizationName: string, organizationSeq: number): string {
  const initials = organizationName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .filter((letter) => letter !== '')
    .slice(0, 3)
    .join('')
    .toUpperCase();

  const prefix = initials.length >= 2 ? initials : 'CSC';
  // Modulo keeps the code six characters wide however long a tenant has been on the platform;
  // uniqueness is guaranteed by the unique constraint and a retry, not by this number.
  const suffix = String(Math.abs(Math.trunc(organizationSeq)) % 1000).padStart(3, '0');
  return `${prefix}${suffix}`;
}

export function isCounterDropCode(value: string): boolean {
  return COUNTER_CODE_PATTERN.test(value);
}

/** Uppercases and strips the punctuation a phone keyboard adds, so lookups agree on one form. */
export function normalizeDropCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!ANY_DROP_CODE_PATTERN.test(cleaned)) return null;
  return cleaned;
}

/**
 * Finds the drop code in an inbound message.
 *
 * Handles what people and clients actually send: `START DROP-7429`, the Telegram `/start
 * DROP-7429` the deep link produces, `/start@centre_bot DROP-7429` from a group, or the bare
 * code from somebody who typed it themselves. Returns null for ordinary chatter, which is the
 * signal to treat the message as a file for an already-bound session.
 */
export function parseDropCommand(text: string | null | undefined): string | null {
  if (!text) return null;

  const trimmed = text.trim();
  const withoutCommand = trimmed
    .replace(/^\/?start(?:@[\w_]+)?\s*/i, '')
    .replace(/^start\s+/i, '')
    .trim();

  const candidate = withoutCommand === '' ? trimmed : withoutCommand;
  const token = candidate.split(/\s+/)[0];
  if (!token) return null;

  const normalized = normalizeDropCode(token);
  if (!normalized) return null;
  return isDropSessionCode(normalized) || isCounterDropCode(normalized) ? normalized : null;
}

/** True when the citizen says they are finished, in either language. */
export function isDoneCommand(text: string | null | undefined): boolean {
  if (!text) return false;
  const value = text.trim().toLowerCase();
  return ['done', 'finish', 'finished', 'ok done', 'हो गया', 'समाप्त', 'पूरा'].includes(value);
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

/**
 * `wa.me` rather than the `api.whatsapp.com` form: it is the link Meta documents for click-to-
 * chat, it opens the installed app instead of a web interstitial on both mobile platforms, and
 * it survives being encoded into a QR without a query-string the scanner mangles.
 */
export function buildWhatsAppDropLink(botNumber: string, code: string): string {
  const digits = botNumber.replace(/\D+/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(`START ${code}`)}`;
}

export function buildTelegramDropLink(botUsername: string, code: string): string {
  const handle = botUsername.replace(/^@/, '');
  // Telegram's start payload allows A–Z, a–z, 0–9, `_` and `-`, so a drop code passes as-is.
  return `https://t.me/${handle}?start=${encodeURIComponent(code)}`;
}

export function buildWebDropLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, '')}/drop/${encodeURIComponent(code)}`;
}
