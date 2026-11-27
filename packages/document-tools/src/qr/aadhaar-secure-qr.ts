/**
 * Aadhaar Secure QR — the large QR on every Aadhaar letter, e-Aadhaar PDF and PVC card printed
 * since 2019. UIDAI signs its contents, so a valid signature means the name, date of birth,
 * gender and address in it are exactly what UIDAI issued: a card whose printed text was edited
 * still carries the original QR, and a QR that was edited no longer verifies.
 *
 * The layout, as UIDAI's reference readers decode it:
 *
 * 1. The QR holds one long decimal number. As a big-endian integer, its bytes are a GZIP stream.
 * 2. Inflated, the data is text fields separated by byte 255, then the photo (JPEG 2000), then
 *    optional SHA-256 hashes of the email and mobile number (32 bytes each), then a 256-byte
 *    RSA signature (SHA256withRSA) over everything before it.
 * 3. Newer codes start with a version marker ("V2", "V3", ...) and end their text with the last
 *    four digits of the mobile number. Older ones start straight at the email/mobile indicator.
 *
 * The signature is checked against every key in `uidai-keys.ts`; the layout only decides which
 * fields are shown, so a field list that turns out different in some version can never make a
 * forged code verify.
 *
 * What comes out is PII (name, address, date of birth). Callers keep it in memory to show the
 * citizen or operator, and persist only `summariseQrCheck`'s summary. Nothing here logs.
 */

import { decompressSync } from 'fflate';

import { verifyRsaSha256 } from './crypto';
import { UIDAI_KEYS, type UidaiKey } from './uidai-keys';

const DELIMITER = 255;
const SIGNATURE_LENGTH = 256;
const HASH_LENGTH = 32;
/** Real codes are a few thousand digits; anything far larger is not one. */
const MAX_DIGITS = 20_000;
/** A Secure QR inflates to a few kilobytes; refuse anything that balloons. */
const MAX_INFLATED_BYTES = 256 * 1024;

const TEXT_FIELDS = [
  'emailMobileIndicator',
  'referenceId',
  'name',
  'dateOfBirth',
  'gender',
  'careOf',
  'district',
  'landmark',
  'house',
  'location',
  'pincode',
  'postOffice',
  'state',
  'street',
  'subDistrict',
  'vtc',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export type AadhaarSecureQrData = {
  /** "V2", "V3", ... ; null for the first (2019) layout. */
  readonly version: string | null;
  /** The last four digits of the Aadhaar number, the only part the code carries. */
  readonly aadhaarLast4: string;
  /** When UIDAI generated this code (`YYYY-MM-DD`), from the reference id; null if unreadable. */
  readonly generatedOn: string | null;
  readonly name: string;
  /** As printed: `DD-MM-YYYY`, or a year alone. */
  readonly dateOfBirth: string;
  /** M, F or T. */
  readonly gender: string;
  readonly careOf: string;
  /** The address, its parts joined in the usual order, empty parts left out. */
  readonly address: string;
  readonly pincode: string;
  readonly state: string;
  readonly district: string;
  readonly hasEmail: boolean;
  readonly hasMobile: boolean;
  /** Present on versioned codes. */
  readonly mobileLast4: string | null;
};

export type AadhaarSecureQrResult = {
  readonly data: AadhaarSecureQrData;
  /** The UIDAI key that verified the signature; null when no known key does. */
  readonly signedBy: UidaiKey | null;
};

/** Whether `text` looks like a Secure QR payload: nothing but a long decimal number. */
export function looksLikeSecureQr(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 200 && trimmed.length <= MAX_DIGITS && /^\d+$/.test(trimmed);
}

/** The bytes of a big decimal number, big-endian, without leading zeros. */
export function decimalToBytes(decimal: string): Uint8Array {
  let hex = BigInt(decimal).toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** UTF-8 when the bytes are valid UTF-8, ISO-8859-1 otherwise; control characters dropped. */
export function decodeText(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  let valid = true;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    let code = b0;
    let extra = 0;
    if (b0 >= 0xf0 && b0 <= 0xf4) {
      code = b0 & 0x07;
      extra = 3;
    } else if (b0 >= 0xe0) {
      code = b0 & 0x0f;
      extra = 2;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      code = b0 & 0x1f;
      extra = 1;
    } else if (b0 >= 0x80) {
      valid = false;
      break;
    }
    if (i + extra >= bytes.length && extra > 0) {
      valid = false;
      break;
    }
    for (let k = 1; k <= extra; k += 1) {
      const next = bytes[i + k] ?? 0;
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (next & 0x3f);
    }
    if (!valid) break;
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  if (!valid) out = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  // eslint-disable-next-line no-control-regex
  return out.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function delimiterPositions(bytes: Uint8Array, end: number, wanted: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < end && positions.length < wanted; i += 1) {
    if (bytes[i] === DELIMITER) positions.push(i);
  }
  return positions;
}

/** `YYYYMMDDhhmmss...` after the four digits, as a date; null when it is not one. */
function generatedOnFrom(referenceId: string): string | null {
  const match = /^\d{4}(\d{4})(\d{2})(\d{2})/.exec(referenceId);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = `${year}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

/** The inflated payload of a Secure QR's decimal text; null when it is not one. */
export function inflateSecureQr(text: string): Uint8Array | null {
  if (!looksLikeSecureQr(text)) return null;
  try {
    const inflated = decompressSync(decimalToBytes(text.trim()));
    if (inflated.length <= SIGNATURE_LENGTH || inflated.length > MAX_INFLATED_BYTES) return null;
    return inflated;
  } catch {
    return null;
  }
}

/** Reads the text fields; null when the layout does not hold together. */
export function parseSecureQrFields(inflated: Uint8Array): AadhaarSecureQrData | null {
  const signedEnd = inflated.length - SIGNATURE_LENGTH;
  const first = delimiterPositions(inflated, signedEnd, 1)[0];
  if (first === undefined) return null;
  const marker = decodeText(inflated.slice(0, first));
  const versioned = /^V\d{1,2}$/.test(marker);
  const fieldCount = TEXT_FIELDS.length + (versioned ? 2 : 0);
  const positions = delimiterPositions(inflated, signedEnd, fieldCount);
  if (positions.length < fieldCount) return null;

  const raw: string[] = [];
  let start = 0;
  for (const position of positions) {
    raw.push(decodeText(inflated.slice(start, position)));
    start = position + 1;
  }
  const values = versioned ? raw.slice(1, 1 + TEXT_FIELDS.length) : raw;
  const field = (name: TextField): string => values[TEXT_FIELDS.indexOf(name)] ?? '';

  const indicator = field('emailMobileIndicator');
  const referenceId = field('referenceId');
  const name = field('name');
  if (!/^[0-3]$/.test(indicator) || !/^\d{4}\d{8,}$/.test(referenceId) || name.length === 0) {
    return null;
  }
  const flags = Number(indicator);
  const mobileLast4 = versioned ? (raw[fieldCount - 1] ?? '') : '';

  const address = [
    field('house'),
    field('street'),
    field('landmark'),
    field('location'),
    field('vtc'),
    field('postOffice'),
    field('subDistrict'),
    field('district'),
    field('state'),
    field('pincode'),
  ]
    .filter((part) => part.length > 0)
    .join(', ');

  return {
    version: versioned ? marker : null,
    aadhaarLast4: referenceId.slice(0, 4),
    generatedOn: generatedOnFrom(referenceId),
    name,
    dateOfBirth: field('dateOfBirth'),
    gender: field('gender'),
    careOf: field('careOf'),
    address,
    pincode: field('pincode'),
    state: field('state'),
    district: field('district'),
    hasEmail: flags === 1 || flags === 3,
    hasMobile: flags === 2 || flags === 3,
    mobileLast4: /^\d{4}$/.test(mobileLast4) ? mobileLast4 : null,
  };
}

/** The UIDAI key whose signature the payload carries; null when none of `keys` matches. */
export function secureQrSigner(
  inflated: Uint8Array,
  keys: readonly UidaiKey[] = UIDAI_KEYS,
): UidaiKey | null {
  if (inflated.length <= SIGNATURE_LENGTH + HASH_LENGTH) return null;
  const signedEnd = inflated.length - SIGNATURE_LENGTH;
  const message = inflated.subarray(0, signedEnd);
  const signature = inflated.subarray(signedEnd);
  return keys.find((key) => verifyRsaSha256(key, message, signature)) ?? null;
}

/**
 * Reads and verifies a Secure QR from the QR's text. Null when the text is not a Secure QR at
 * all (another kind of code, or a number that does not inflate to the layout above).
 */
export function readAadhaarSecureQr(
  text: string,
  keys: readonly UidaiKey[] = UIDAI_KEYS,
): AadhaarSecureQrResult | null {
  const inflated = inflateSecureQr(text);
  if (!inflated) return null;
  const data = parseSecureQrFields(inflated);
  if (!data) return null;
  return { data, signedBy: secureQrSigner(inflated, keys) };
}
