/**
 * Official QR checks for identity documents and certificates (`@assistigo/document-tools/qr`).
 *
 * A subpath of its own so the phone loads it without the PDF tooling in the main barrel. Pure
 * TypeScript: the citizen app and the operator dashboard run the same checks, each on its own
 * copy of the document, so neither has to trust the other's claim that a document is genuine.
 */

export {
  type AadhaarSecureQrData,
  type AadhaarSecureQrResult,
  decimalToBytes,
  looksLikeSecureQr,
  readAadhaarSecureQr,
} from './aadhaar-secure-qr';
export {
  checkQrText,
  findLink,
  isOfficialHost,
  namesMatch,
  QR_CHECK_RESULTS,
  type QrCheck,
  type QrCheckResult,
  type QrCheckSummary,
  type QrLink,
  type QrPersonDetails,
  strongestCheck,
  suggestedDocumentType,
  summariseQrCheck,
} from './check';
export { findQrCodes, type FindQrOptions, type GrayImage, scanRegions } from './decode-image';
export { UIDAI_KEYS, type UidaiKey } from './uidai-keys';

import { looksLikeSecureQr } from './aadhaar-secure-qr';
import { checkQrText, type QrCheck, strongestCheck } from './check';
import { findQrCodes, type FindQrOptions, type GrayImage } from './decode-image';

/**
 * Finds the codes on one page image and checks them; the most telling result, or null when the
 * page has no readable QR. Stops searching once it holds a Secure QR.
 */
export async function checkPageImage(
  image: GrayImage,
  options: Omit<FindQrOptions, 'isEnough'> = {},
): Promise<QrCheck | null> {
  const texts = await findQrCodes(image, { ...options, isEnough: looksLikeSecureQr });
  return strongestCheck(texts.map((text) => checkQrText(text)));
}
