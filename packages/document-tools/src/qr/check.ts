/**
 * What a QR code on a document proves, for the citizen before they keep or share it and for the
 * operator before they take it in.
 *
 * - `aadhaar_verified` — an Aadhaar Secure QR whose signature matches a UIDAI key: its contents
 *   are what UIDAI issued. The one result that is proof by itself.
 * - `aadhaar_unconfirmed` — a Secure QR whose signature matches no key this app has. It may be
 *   edited, or signed with a key UIDAI published after this build: never call it fake.
 * - `aadhaar_unsigned` — the pre-2019 Aadhaar QR (`PrintLetterBarcodeData` XML). Not signed, so
 *   anyone could have made it; it proves nothing.
 * - `official_link` — a link to a government site (`*.gov.in`, `*.nic.in`), as e-District
 *   certificates, DigiLocker-issued documents and many state certificates carry. Opening it shows
 *   the issuer's own record; the QR itself is not signed, so the check is the page, not the code.
 * - `other_link` — a link to anywhere else. A real certificate does not send you to a private
 *   site to check it: worth a warning.
 * - `pan_text` — a PAN card's QR with readable text. Not signed in a way this app can check:
 *   the Income Tax Department's own PAN QR reader is the authority.
 * - `unrecognised` — a code, but none of the above (most newer PAN cards: their QR can only be
 *   read by the department's reader).
 *
 * Everything in the `details` is PII for display only. `summariseQrCheck` gives the part that may
 * be stored; no full URL, no number, no name ever reaches storage or a log.
 */

import type { DocumentType } from '@assistigo/core';

import { type AadhaarSecureQrData, readAadhaarSecureQr } from './aadhaar-secure-qr';
import { UIDAI_KEYS, type UidaiKey } from './uidai-keys';

export const QR_CHECK_RESULTS = [
  'aadhaar_verified',
  'aadhaar_unconfirmed',
  'aadhaar_unsigned',
  'official_link',
  'other_link',
  'pan_text',
  'unrecognised',
] as const;
export type QrCheckResult = (typeof QR_CHECK_RESULTS)[number];

/** Details shown next to the result, all optional; a person's details, never stored. */
export type QrPersonDetails = {
  readonly name?: string;
  readonly dateOfBirth?: string;
  readonly gender?: string;
  readonly careOf?: string;
  readonly address?: string;
  /** Last four digits of the Aadhaar number. */
  readonly aadhaarLast4?: string;
  /** A PAN with its middle digits hidden: `ABCDE••••F`. */
  readonly panMasked?: string;
};

export type QrCheck =
  | {
      readonly result: 'aadhaar_verified' | 'aadhaar_unconfirmed';
      readonly details: QrPersonDetails;
      readonly secureQr: AadhaarSecureQrData;
      /** The certificate whose key verified it; absent when unconfirmed. */
      readonly signedBy?: Pick<UidaiKey, 'file' | 'commonName'>;
    }
  | { readonly result: 'aadhaar_unsigned'; readonly details: QrPersonDetails }
  | {
      readonly result: 'official_link' | 'other_link';
      /** Lower-case host, shown so the reader can judge it. Not personal. */
      readonly host: string;
      /** The whole link, for an Open button only: it often names a certificate. */
      readonly url: string;
    }
  | { readonly result: 'pan_text'; readonly details: QrPersonDetails }
  | { readonly result: 'unrecognised' };

/** Government domains whose pages are the issuer's own (NIC hosts state and central sites). */
const OFFICIAL_SUFFIXES = ['gov.in', 'nic.in'] as const;

/** Whether `host` is a government site: exactly a suffix above, or a sub-domain of one. */
export function isOfficialHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(lower) || lower.includes('..') || lower.startsWith('.')) return false;
  if (lower.split('.').some((label) => label.startsWith('xn--'))) return false;
  return OFFICIAL_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

export type QrLink = { readonly url: string; readonly host: string };

/**
 * The first web link in a QR's text, with its host. Parsed by hand: React Native's `URL` has no
 * `hostname`. A link with a user name (`https://gov.in@evil.example`), an IP address or a
 * non-ASCII host is never treated as official — those are the lookalike tricks.
 */
export function findLink(text: string): QrLink | null {
  const match = /\bhttps?:\/\/[^\s"'<>]+/i.exec(text);
  if (!match) return null;
  const url = match[0].replace(/[).,;]+$/, '');
  const authority = /^https?:\/\/([^/?#]*)/i.exec(url)?.[1] ?? '';
  if (authority.includes('@')) return { url, host: authority.toLowerCase() };
  const host = authority.replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase();
  if (host.length === 0) return null;
  return { url, host };
}

function attribute(xml: string, name: string): string | undefined {
  const value = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(xml)?.[1];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** The old XML Aadhaar QR. Its `uid` is the full number: only its last four digits come out. */
function readLegacyAadhaar(text: string): QrPersonDetails | null {
  if (!/<\s*PrintLetterBarcodeData\b/i.test(text)) return null;
  const uid = attribute(text, 'uid')?.replace(/\D/g, '');
  const name = attribute(text, 'name');
  const dob = attribute(text, 'dob') ?? attribute(text, 'yob');
  const gender = attribute(text, 'gender');
  const careOf = attribute(text, 'co');
  const address = ['house', 'street', 'lm', 'loc', 'vtc', 'po', 'subdist', 'dist', 'state', 'pc']
    .map((part) => attribute(text, part))
    .filter((part): part is string => part !== undefined)
    .join(', ');
  return {
    ...(name ? { name } : {}),
    ...(dob ? { dateOfBirth: dob } : {}),
    ...(gender ? { gender } : {}),
    ...(careOf ? { careOf } : {}),
    ...(address ? { address } : {}),
    ...(uid && uid.length >= 4 ? { aadhaarLast4: uid.slice(-4) } : {}),
  };
}

/** A PAN: five letters (the fourth names the holder type), four digits, a letter. */
const PAN_PATTERN = /\b([A-Z]{3}[ABCFGHJLPT][A-Z])(\d{4})([A-Z])\b/;

function maskPan(pan: RegExpExecArray): string {
  return `${pan[1] ?? ''}••••${pan[3] ?? ''}`;
}

/** Text after a label such as `Name:` on its own line. */
function labelled(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const value = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-]\\s*([^\\n]+)`, 'i')
      .exec(text)?.[1]
      ?.trim();
    if (value) return value;
  }
  return undefined;
}

function readPanText(text: string): QrPersonDetails | null {
  const pan = PAN_PATTERN.exec(text.toUpperCase());
  if (!pan) return null;
  const name = labelled(text, ['Name']);
  const dateOfBirth = labelled(text, ['DOB', 'Date of Birth', 'Date of Incorporation']);
  return {
    panMasked: maskPan(pan),
    ...(name ? { name } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
  };
}

function secureQrDetails(data: AadhaarSecureQrData): QrPersonDetails {
  return {
    name: data.name,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    ...(data.careOf ? { careOf: data.careOf } : {}),
    ...(data.address ? { address: data.address } : {}),
    aadhaarLast4: data.aadhaarLast4,
  };
}

/** What one QR code's text proves. `keys` is for tests; the app always uses UIDAI's. */
export function checkQrText(text: string, keys: readonly UidaiKey[] = UIDAI_KEYS): QrCheck {
  const secure = readAadhaarSecureQr(text, keys);
  if (secure) {
    return secure.signedBy
      ? {
          result: 'aadhaar_verified',
          details: secureQrDetails(secure.data),
          secureQr: secure.data,
          signedBy: { file: secure.signedBy.file, commonName: secure.signedBy.commonName },
        }
      : {
          result: 'aadhaar_unconfirmed',
          details: secureQrDetails(secure.data),
          secureQr: secure.data,
        };
  }

  const legacy = readLegacyAadhaar(text);
  if (legacy) return { result: 'aadhaar_unsigned', details: legacy };

  const link = findLink(text);
  if (link) {
    return {
      result: isOfficialHost(link.host) ? 'official_link' : 'other_link',
      host: link.host,
      url: link.url,
    };
  }

  const pan = readPanText(text);
  if (pan) return { result: 'pan_text', details: pan };

  return { result: 'unrecognised' };
}

/** How much a result says, best first: picks which of several codes on a document to show. */
const STRENGTH: Record<QrCheckResult, number> = {
  aadhaar_verified: 6,
  aadhaar_unconfirmed: 5,
  official_link: 4,
  other_link: 3,
  aadhaar_unsigned: 2,
  pan_text: 1,
  unrecognised: 0,
};

/** The most telling of several checks (an e-Aadhaar has a QR on each side); null for none. */
export function strongestCheck(checks: readonly QrCheck[]): QrCheck | null {
  let best: QrCheck | null = null;
  for (const check of checks) {
    if (!best || STRENGTH[check.result] > STRENGTH[best.result]) best = check;
  }
  return best;
}

/** What may be stored with a document: the result, when, and a link's host. Nothing personal. */
export type QrCheckSummary = {
  readonly result: QrCheckResult;
  readonly checkedAt: string;
  readonly host?: string;
};

export function summariseQrCheck(check: QrCheck, checkedAt: Date): QrCheckSummary {
  return {
    result: check.result,
    checkedAt: checkedAt.toISOString(),
    ...(check.result === 'official_link' || check.result === 'other_link'
      ? { host: check.host.slice(0, 253) }
      : {}),
  };
}

/** The document type a result points to, to suggest on Save; null when it says nothing. */
export function suggestedDocumentType(
  check: QrCheck,
): Extract<DocumentType, 'aadhaar_like' | 'pan'> | null {
  if (
    check.result === 'aadhaar_verified' ||
    check.result === 'aadhaar_unconfirmed' ||
    check.result === 'aadhaar_unsigned'
  ) {
    return 'aadhaar_like';
  }
  if (check.result === 'pan_text') return 'pan';
  return null;
}

/** Letters only, upper case, single spaces: names compared the way a person reads them. */
function comparableName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\p{L} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Whether a name typed or printed elsewhere is the one in the QR. Initials count ("R. KUMAR"
 * matches "RAMESH KUMAR"); order matters. Null when either side has no name.
 */
export function namesMatch(qrName: string | undefined, other: string | undefined): boolean | null {
  if (!qrName || !other) return null;
  const a = comparableName(qrName).split(' ').filter(Boolean);
  const b = comparableName(other).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return null;
  if (a.length !== b.length) return a.join(' ') === b.join(' ');
  return a.every((word, i) => {
    const otherWord = b[i] ?? '';
    if (word === otherWord) return true;
    if (word.length === 1) return otherWord.startsWith(word);
    if (otherWord.length === 1) return word.startsWith(otherWord);
    return false;
  });
}
