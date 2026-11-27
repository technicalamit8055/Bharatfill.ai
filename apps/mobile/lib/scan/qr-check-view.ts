/**
 * How a QR check reads on screen (Save Document and Document Details): its tone, its wording and
 * the details from the code that the citizen can hold against the printed card.
 *
 * The wording never says more than the check proves. Only a verified Secure QR is called
 * genuine; a link is "official" and the page it opens is the proof; a code that does not verify
 * is "not confirmed", never "fake", because UIDAI may have signed it with a newer key.
 *
 * Pure, so it is unit tested; copy is under `qrCheck.*` in both languages.
 */

import type { DocumentType } from '@assistigo/core';
import type { QrCheck, QrCheckResult } from '@assistigo/document-tools/qr';

export type QrCheckTone = 'success' | 'info' | 'warning' | 'neutral';

export type QrDetailRow = { readonly labelKey: string; readonly value: string };

export type QrCheckView = {
  readonly tone: QrCheckTone;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly values: Readonly<Record<string, string>>;
  /** From a live check only; a stored one keeps no details. */
  readonly rows: readonly QrDetailRow[];
  /** The link to open, from a live check of a link. */
  readonly url: string | null;
};

export const QR_TONES: Record<QrCheckResult, QrCheckTone> = {
  aadhaar_verified: 'success',
  aadhaar_unconfirmed: 'warning',
  aadhaar_unsigned: 'neutral',
  official_link: 'info',
  other_link: 'warning',
  pan_text: 'neutral',
  unrecognised: 'neutral',
};

/** `XXXX XXXX 1234`, the way Aadhaar's masked form prints it. */
export function maskedAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

function bodyKeyFor(result: QrCheckResult, documentType: DocumentType | null | undefined): string {
  if (result === 'unrecognised' && documentType === 'pan') return 'qrCheck.body.unrecognisedPan';
  return `qrCheck.body.${result}`;
}

/** The view of a check just run, with the code's details. */
export function liveQrCheckView(check: QrCheck, documentType?: DocumentType | null): QrCheckView {
  const rows: QrDetailRow[] = [];
  let url: string | null = null;
  let host = '';
  if (check.result === 'official_link' || check.result === 'other_link') {
    url = check.url;
    host = check.host;
  } else if ('details' in check) {
    const d = check.details;
    if (d.name) rows.push({ labelKey: 'qrCheck.fields.name', value: d.name });
    if (d.dateOfBirth) rows.push({ labelKey: 'qrCheck.fields.dateOfBirth', value: d.dateOfBirth });
    if (d.gender) rows.push({ labelKey: 'qrCheck.fields.gender', value: d.gender });
    if (d.careOf) rows.push({ labelKey: 'qrCheck.fields.careOf', value: d.careOf });
    if (d.address) rows.push({ labelKey: 'qrCheck.fields.address', value: d.address });
    if (d.aadhaarLast4) {
      rows.push({ labelKey: 'qrCheck.fields.aadhaar', value: maskedAadhaar(d.aadhaarLast4) });
    }
    if (d.panMasked) rows.push({ labelKey: 'qrCheck.fields.pan', value: d.panMasked });
  }
  return {
    tone: QR_TONES[check.result],
    titleKey: `qrCheck.title.${check.result}`,
    bodyKey: bodyKeyFor(check.result, documentType),
    values: { host },
    rows,
    url,
  };
}

/** The view of a check stored with a document: the result and when, no details. */
export function storedQrCheckView(
  stored: { readonly result: QrCheckResult; readonly host?: string | undefined },
  documentType?: DocumentType | null,
): QrCheckView {
  return {
    tone: QR_TONES[stored.result],
    titleKey: `qrCheck.title.${stored.result}`,
    bodyKey: bodyKeyFor(stored.result, documentType),
    values: { host: stored.host ?? '' },
    rows: [],
    url: null,
  };
}

/** Every copy key the views can use, for the copy test. */
export function qrCheckCopyKeys(): string[] {
  const results: readonly QrCheckResult[] = Object.keys(QR_TONES) as QrCheckResult[];
  return [
    ...results.flatMap((result) => [`qrCheck.title.${result}`, `qrCheck.body.${result}`]),
    'qrCheck.body.unrecognisedPan',
    'qrCheck.fields.name',
    'qrCheck.fields.dateOfBirth',
    'qrCheck.fields.gender',
    'qrCheck.fields.careOf',
    'qrCheck.fields.address',
    'qrCheck.fields.aadhaar',
    'qrCheck.fields.pan',
  ];
}

/** Document types that carry an official QR: Aadhaar, PAN, and e-District certificates. */
export const QR_DOCUMENT_TYPES: readonly DocumentType[] = [
  'aadhaar_like',
  'pan',
  'caste_certificate',
  'income_certificate',
  'residence_certificate',
];

/**
 * Whether Save Document checks for a QR by itself. The search runs on the JS thread, so it is
 * kept to documents likely to carry an official code: a PDF (DigiLocker, e-Aadhaar, e-District),
 * an ID card scan, or a type known to carry one. Anything else offers "Check QR code" instead.
 */
export function shouldAutoCheckQr(input: {
  readonly pageSources: readonly string[];
  readonly preset: string;
  readonly documentType: DocumentType | null;
}): boolean {
  if (input.pageSources.includes('pdf')) return true;
  if (input.preset === 'id_card') return true;
  return input.documentType !== null && QR_DOCUMENT_TYPES.includes(input.documentType);
}
