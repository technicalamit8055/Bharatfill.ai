/**
 * QR checks in the operator's browser (`@assistigo/document-tools/browser/qr`): the same checks
 * the citizen app runs (`../qr`), on the operator's own copy of the file, so the dashboard never
 * has to trust a phone's claim that a document is genuine.
 *
 * An image is decoded at its natural size; a PDF has its first pages drawn at 300 dpi, enough
 * for the small, dense Secure QR on an e-Aadhaar. Everything happens in this tab: the file is
 * not uploaded anywhere, and what the code says is returned to the caller to show, not stored.
 */

import { checkPageImage, type GrayImage, type QrCheck, strongestCheck } from '../qr';
import { context2d, createCanvas, decodeImage } from './image';
import { renderPdfPage, loadPdf } from './pdf';

/** Pages of a PDF searched: an Aadhaar's code is on its first or second page. */
const PDF_PAGE_LIMIT = 2;
const PDF_DPI = 300;
/** A camera photo is drawn no larger than this on its long side. */
const MAX_IMAGE_SIDE = 4000;

function grayFromCanvas(canvas: HTMLCanvasElement): GrayImage {
  const { width, height } = canvas;
  const rgba = context2d(canvas).getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 1, j += 4) {
    // Rec. 601 luma, as jsQR itself uses.
    pixels[i] =
      ((rgba[j] ?? 255) * 77 + (rgba[j + 1] ?? 255) * 150 + (rgba[j + 2] ?? 255) * 29) >> 8;
  }
  return { width, height, pixels };
}

async function imageToGray(blob: Blob): Promise<GrayImage> {
  const image = await decodeImage(blob);
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const canvas = createCanvas(image.width * scale, image.height * scale);
    const context = context2d(canvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return grayFromCanvas(canvas);
  } finally {
    image.release();
  }
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The most telling QR check on a file (image or PDF); null when it has no readable code. A
 * locked PDF throws `PdfPasswordRequiredError` from `./pdf`, so the caller can say so.
 */
export async function checkFileQr(
  blob: Blob,
  mimeType: string,
  options: { readonly password?: string; readonly cancelled?: () => boolean } = {},
): Promise<QrCheck | null> {
  const search = {
    yieldBetween: breathe,
    ...(options.cancelled ? { cancelled: options.cancelled } : {}),
  };
  if (mimeType === 'application/pdf') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loaded = await loadPdf(bytes, options.password);
    const checks: QrCheck[] = [];
    for (
      let pageNumber = 1;
      pageNumber <= Math.min(loaded.pageCount, PDF_PAGE_LIMIT);
      pageNumber += 1
    ) {
      if (options.cancelled?.()) return null;
      const canvas = await renderPdfPage(bytes, pageNumber, {
        dpi: PDF_DPI,
        ...(options.password ? { password: options.password } : {}),
      });
      const check = await checkPageImage(grayFromCanvas(canvas), search);
      if (check) checks.push(check);
      if (check?.result === 'aadhaar_verified' || check?.result === 'aadhaar_unconfirmed') break;
    }
    return strongestCheck(checks);
  }
  if (mimeType.startsWith('image/')) {
    return checkPageImage(await imageToGray(blob), search);
  }
  return null;
}
