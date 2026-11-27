/**
 * Checks the QR codes on a document's pages on the phone, before the citizen keeps or shares it:
 * an Aadhaar Secure QR's UIDAI signature, the official link on an e-District or DigiLocker
 * certificate (`@assistigo/document-tools/qr` says what each result means).
 *
 * Pages are decoded to greyscale by OpenCV (native), then searched for codes in JS. Nothing
 * leaves the phone, nothing is logged, and the code's contents live only in the returned check:
 * callers show them and store `summariseQrCheck`'s summary alone.
 *
 * It takes a few seconds on a full page, on the JS thread, so it yields between passes and
 * stops as soon as the caller says the screen has gone.
 */

import { File } from 'expo-file-system';
import {
  checkPageImage,
  type GrayImage,
  type QrCheck,
  strongestCheck,
} from '@assistigo/document-tools/qr';
import { ColorConversionCodes, DataTypes, Mat, OpenCV } from 'react-native-fast-opencv';

/** Pages searched at most: an Aadhaar's code is on its first or second page. */
export const QR_PAGE_LIMIT = 4;

/** A page to search: a file in the app's cache, or a page's base64 already in memory. */
export type QrPageSource =
  | { readonly kind: 'file'; readonly uri: string }
  | { readonly kind: 'base64'; readonly read: () => Promise<string> };

function releaseQuietly(mat: Mat | null): void {
  try {
    mat?.release();
  } catch {
    // Already released.
  }
}

/** A JPEG or PNG, as base64, decoded to one byte a pixel; null when it cannot be decoded. */
export function grayFromBase64(base64: string): GrayImage | null {
  let image: Mat | null = null;
  let gray: Mat | null = null;
  try {
    image = Mat.createFromBase64(base64);
    if (image.rows === 0 || image.cols === 0) return null;
    const channels = image.toBuffer('uint8').channels;
    if (channels === 1) {
      const buffer = image.toBuffer('uint8');
      return { width: buffer.cols, height: buffer.rows, pixels: buffer.buffer };
    }
    gray = Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.cvtColor(
      image,
      gray,
      channels === 4 ? ColorConversionCodes.COLOR_BGRA2GRAY : ColorConversionCodes.COLOR_BGR2GRAY,
    );
    const buffer = gray.toBuffer('uint8');
    return { width: buffer.cols, height: buffer.rows, pixels: buffer.buffer };
  } catch {
    return null;
  } finally {
    releaseQuietly(gray);
    releaseQuietly(image);
  }
}

/** Strips a `data:image/...;base64,` prefix. */
export function base64Of(dataUriOrBase64: string): string {
  const comma = dataUriOrBase64.indexOf(',');
  return dataUriOrBase64.startsWith('data:') && comma >= 0
    ? dataUriOrBase64.slice(comma + 1)
    : dataUriOrBase64;
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function readSource(source: QrPageSource): Promise<string> {
  return source.kind === 'file' ? new File(source.uri).base64() : base64Of(await source.read());
}

/**
 * The most telling QR check across the first pages; null when none has a readable code (or the
 * search was cancelled). Stops at the first page with an Aadhaar Secure QR.
 */
export async function checkDocumentPages(
  pages: readonly QrPageSource[],
  options: { readonly cancelled?: () => boolean } = {},
): Promise<QrCheck | null> {
  const checks: QrCheck[] = [];
  for (const source of pages.slice(0, QR_PAGE_LIMIT)) {
    if (options.cancelled?.()) return null;
    let image: GrayImage | null;
    try {
      image = grayFromBase64(await readSource(source));
    } catch {
      image = null;
    }
    if (!image) continue;
    await breathe();
    const check = await checkPageImage(image, {
      yieldBetween: breathe,
      ...(options.cancelled ? { cancelled: options.cancelled } : {}),
    });
    if (options.cancelled?.()) return null;
    if (!check) continue;
    checks.push(check);
    if (check.result === 'aadhaar_verified' || check.result === 'aadhaar_unconfirmed') break;
  }
  return strongestCheck(checks);
}
