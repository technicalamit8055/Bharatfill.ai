/**
 * PDF operations.
 * Master spec §13.2 — "Compress PDF. Split pages. Merge PDFs/images. Convert image to PDF.
 * Reorder pages. Generate portal-ready derivative."
 *
 * Two libraries, each doing the thing it is actually good at:
 *
 *   - `pdf-lib` rewrites the document structure. Merging, reordering, rotating and deleting pages
 *     are all lossless with it: the page objects are copied across, so a text certificate stays
 *     selectable text and a signed marksheet keeps its resolution.
 *   - `pdf.js` renders. It is needed for page thumbnails, and for the one operation that cannot
 *     be structural — hitting a hard KB cap on a scanned PDF, which means rasterising the pages
 *     at a lower resolution and rebuilding.
 *
 * Both run in the browser. A customer's certificate is never uploaded to be compressed.
 */

import { PDFDocument, degrees } from 'pdf-lib';
import type * as PdfJs from 'pdfjs-dist';
import {
  MAX_PROBES,
  estimateInitialScale,
  type OutputMimeType,
} from '../index';
import { canvasToBlob, createCanvas, context2d, blobBytes, decodeImage } from './image';

// ---------------------------------------------------------------------------
// pdf.js loading
// ---------------------------------------------------------------------------

type PdfJsModule = typeof PdfJs;
let pdfjsPromise: Promise<PdfJsModule> | null = null;

/**
 * Loads pdf.js and points it at its worker.
 *
 * Imported lazily and memoised: the library plus its worker is over a megabyte, and an operator
 * who only ever merges PDFs (which is `pdf-lib`'s job) should never pay for it. `new URL(…,
 * import.meta.url)` is what lets the bundler emit the worker as an asset rather than us copying
 * a versioned file into `public/` and having it drift out of step with the package.
 */
async function loadPdfjs(): Promise<PdfJsModule> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
    return pdfjs;
  })();
  return pdfjsPromise;
}

/** Thrown when a PDF is encrypted and the password given was wrong or missing. */
export class PdfPasswordRequiredError extends Error {
  readonly code = 'PDF_PASSWORD_REQUIRED';
  constructor(readonly wrongPassword: boolean) {
    super(wrongPassword ? 'pdf_password_incorrect' : 'pdf_password_required');
    this.name = 'PdfPasswordRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type PdfPageInfo = {
  /** 1-based, as an operator counts pages. */
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  /** Rotation already baked into the source document. */
  rotation: number;
};

export type LoadedPdf = {
  pageCount: number;
  pages: PdfPageInfo[];
  /** True when the file was encrypted and a password was needed to open it. */
  wasEncrypted: boolean;
};

/**
 * Opens a PDF and reports its pages.
 *
 * `password` handles the e-Aadhaar case: UIDAI issues the download encrypted with the holder's
 * own password (first four letters of the name in capitals plus the birth year), and an operator
 * cannot do anything with the file until it is open. The password is used here, in the browser,
 * and is never sent anywhere or stored.
 */
export async function loadPdf(bytes: Uint8Array, password?: string): Promise<LoadedPdf> {
  const pdfjs = await loadPdfjs();
  try {
    const document = await pdfjs.getDocument({
      // pdf.js transfers and then detaches the buffer it is given, so it gets a copy — the
      // caller's bytes stay usable for the structural pass afterwards.
      data: bytes.slice(),
      password,
      isEvalSupported: false,
    }).promise;

    const pages: PdfPageInfo[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        rotation: page.rotate,
      });
    }
    await document.destroy();
    return { pageCount: pages.length, pages, wasEncrypted: Boolean(password) };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new PdfPasswordRequiredError(password !== undefined && password !== '');
    }
    throw error;
  }
}

/**
 * Renders one page to a canvas at a given DPI.
 *
 * PDF user space is 72 units to the inch, so the scale is simply `dpi / 72`. 150 DPI is legible
 * for a certificate thumbnail; 300 is what a print needs.
 */
export async function renderPdfPage(
  bytes: Uint8Array,
  pageNumber: number,
  options: { dpi?: number; password?: string } = {},
): Promise<HTMLCanvasElement> {
  const { dpi = 150, password } = options;
  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
  }).promise;
  try {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = context2d(canvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  } finally {
    await document.destroy();
  }
}

/** Small previews for the page grid. One document open for the whole set, not one per page. */
export async function renderPdfThumbnails(
  bytes: Uint8Array,
  options: { maxEdgePx?: number; password?: string; limit?: number } = {},
): Promise<{ pageNumber: number; dataUrl: string; widthPx: number; heightPx: number }[]> {
  const { maxEdgePx = 220, password, limit = 60 } = options;
  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
  }).promise;

  try {
    const out: { pageNumber: number; dataUrl: string; widthPx: number; heightPx: number }[] = [];
    const count = Math.min(document.numPages, limit);
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = maxEdgePx / Math.max(natural.width, natural.height);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = context2d(canvas);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      out.push({
        pageNumber,
        // A data URL rather than an object URL: thumbnails outlive the function and nothing
        // would revoke the object URLs.
        dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        widthPx: canvas.width,
        heightPx: canvas.height,
      });
    }
    return out;
  } finally {
    await document.destroy();
  }
}

// ---------------------------------------------------------------------------
// Structural operations (lossless)
// ---------------------------------------------------------------------------

/** One page of the output, naming where it came from. */
export type PageRef = {
  /** Index into the `sources` array passed alongside. */
  sourceIndex: number;
  /** 1-based page number within that source. */
  pageNumber: number;
  /** Extra rotation to apply, in degrees clockwise. Added to whatever the page already has. */
  rotate?: number;
};

/**
 * Builds one PDF from an ordered list of pages drawn from several sources.
 *
 * This single function is merge, split, reorder, delete and rotate at once, because from the
 * document's point of view they are all the same operation: "these pages, in this order". The UI
 * presents them separately; the engine does not need to.
 */
export async function assemblePdf(
  sources: readonly Uint8Array[],
  pages: readonly PageRef[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<number, PDFDocument>();

  for (const ref of pages) {
    let source = loaded.get(ref.sourceIndex);
    if (!source) {
      const bytes = sources[ref.sourceIndex];
      if (!bytes) continue;
      // `ignoreEncryption` covers a PDF with an empty owner password — common on portal
      // downloads, which set print restrictions rather than a real password.
      source = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
      loaded.set(ref.sourceIndex, source);
    }
    const [copied] = await out.copyPages(source, [ref.pageNumber - 1]);
    if (!copied) continue;
    if (ref.rotate) {
      copied.setRotation(degrees((copied.getRotation().angle + ref.rotate) % 360));
    }
    out.addPage(copied);
  }

  return out.save({ useObjectStreams: true });
}

/** Page count without rendering anything. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
  return document.getPageCount();
}

// ---------------------------------------------------------------------------
// Images to PDF
// ---------------------------------------------------------------------------

/** ISO A4 in PDF points (72 per inch). */
export const A4_POINTS = { width: 595.28, height: 841.89 };

export type ImagePagesOptions = {
  /** `a4` puts each image on a full page; `fit` sizes the page to the image. */
  pageSize?: 'a4' | 'fit';
  /** Margin in points, when the page size is fixed. */
  marginPt?: number;
  /** Rotate an A4 page to landscape when the image is wider than it is tall. */
  autoOrient?: boolean;
};

/**
 * Turns photographed or scanned pages into one PDF — the commonest request at the counter, since
 * portals take a certificate as a single PDF and a customer arrives with three phone photos.
 *
 * Images are embedded, not re-encoded, so a JPEG the operator already compressed to a portal's
 * limit is not silently made worse. PNGs are embedded as PNG.
 */
export async function imagesToPdf(
  images: readonly { bytes: Uint8Array; mimeType: OutputMimeType }[],
  options: ImagePagesOptions = {},
): Promise<Uint8Array> {
  const { pageSize = 'a4', marginPt = 24, autoOrient = true } = options;
  const document = await PDFDocument.create();

  for (const image of images) {
    const embedded =
      image.mimeType === 'image/png'
        ? await document.embedPng(image.bytes.slice())
        : await document.embedJpg(image.bytes.slice());

    if (pageSize === 'fit') {
      const page = document.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      continue;
    }

    const landscape = autoOrient && embedded.width > embedded.height;
    const pageWidth = landscape ? A4_POINTS.height : A4_POINTS.width;
    const pageHeight = landscape ? A4_POINTS.width : A4_POINTS.height;
    const page = document.addPage([pageWidth, pageHeight]);

    const available = { width: pageWidth - marginPt * 2, height: pageHeight - marginPt * 2 };
    const scale = Math.min(available.width / embedded.width, available.height / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;

    page.drawImage(embedded, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
  }

  return document.save({ useObjectStreams: true });
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

export type PdfCompressionResult = {
  bytes: Uint8Array;
  /** DPI the pages were rasterised at, or `null` when the structural pass was enough. */
  dpi: number | null;
  jpegQuality: number | null;
  overLimit: boolean;
  /** True when text was flattened into images and is no longer selectable. */
  rasterised: boolean;
};

/** Rasterisation ladder, coarse to fine. 96 DPI is still readable print; below 72 is not. */
const DPI_LADDER = [200, 150, 120, 100, 84, 72] as const;
const JPEG_LADDER = [0.82, 0.7, 0.58, 0.45] as const;

/**
 * Compresses a PDF to a target size.
 *
 * The cheap pass first: `pdf-lib` re-saving with object streams often gets a portal-exported PDF
 * under a 200 KB cap on its own, and it keeps the text selectable. Only if that is not enough are
 * the pages rasterised, walking DPI down and then JPEG quality down.
 *
 * Rasterising is destructive — a text certificate becomes a picture of a certificate — so it is
 * reported in the result and named in the recipe. It is also the only thing that will get a 3 MB
 * phone scan under 100 KB, which is a real limit on real state portals.
 */
export async function compressPdf(
  bytes: Uint8Array,
  options: { maxBytes: number; password?: string; allowRasterise?: boolean },
): Promise<PdfCompressionResult> {
  const { maxBytes, password, allowRasterise = true } = options;

  const restructured = await (async () => {
    try {
      const document = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
      return await document.save({ useObjectStreams: true });
    } catch {
      return bytes;
    }
  })();

  const smallestStructural = restructured.length <= bytes.length ? restructured : bytes;
  if (smallestStructural.length <= maxBytes) {
    return {
      bytes: smallestStructural,
      dpi: null,
      jpegQuality: null,
      overLimit: false,
      rasterised: false,
    };
  }

  if (!allowRasterise) {
    return {
      bytes: smallestStructural,
      dpi: null,
      jpegQuality: null,
      overLimit: true,
      rasterised: false,
    };
  }

  // Start the DPI ladder near where the size ratio suggests, rather than always at 200.
  const opening = estimateInitialScale(smallestStructural.length, maxBytes);
  const startIndex = DPI_LADDER.findIndex((dpi) => dpi <= 200 * opening);
  let best: { bytes: Uint8Array; dpi: number; quality: number } | null = null;
  let attempts = 0;

  for (let index = Math.max(0, startIndex); index < DPI_LADDER.length; index += 1) {
    const dpi = DPI_LADDER[index] as number;
    for (const quality of JPEG_LADDER) {
      if (attempts >= MAX_PROBES) break;
      attempts += 1;
      const candidate = await rasterisePdf(smallestStructural, { dpi, quality, password });
      if (candidate.length <= maxBytes) {
        // First fit at the highest DPI wins: quality loss is what the operator notices.
        return { bytes: candidate, dpi, jpegQuality: quality, overLimit: false, rasterised: true };
      }
      if (!best || candidate.length < best.bytes.length) {
        best = { bytes: candidate, dpi, quality };
      }
    }
    if (attempts >= MAX_PROBES) break;
  }

  if (best) {
    return {
      bytes: best.bytes,
      dpi: best.dpi,
      jpegQuality: best.quality,
      overLimit: true,
      rasterised: true,
    };
  }

  return {
    bytes: smallestStructural,
    dpi: null,
    jpegQuality: null,
    overLimit: true,
    rasterised: false,
  };
}

/**
 * Renders every page to a JPEG and rebuilds the PDF from those images.
 *
 * Page boxes are preserved in points, so an A4 certificate stays A4 and prints at the right size
 * however far the DPI was dropped.
 */
export async function rasterisePdf(
  bytes: Uint8Array,
  options: { dpi: number; quality: number; password?: string },
): Promise<Uint8Array> {
  const { dpi, quality, password } = options;
  const pdfjs = await loadPdfjs();
  const source = await pdfjs.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
  }).promise;

  try {
    const out = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const pointSize = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: dpi / 72 });

      const canvas = createCanvas(viewport.width, viewport.height);
      const context = context2d(canvas);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const embedded = await out.embedJpg(
        await blobBytes(await canvasToBlob(canvas, 'image/jpeg', quality)),
      );
      const pdfPage = out.addPage([pointSize.width, pointSize.height]);
      pdfPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: pointSize.width,
        height: pointSize.height,
      });
    }
    return out.save({ useObjectStreams: true });
  } finally {
    await source.destroy();
  }
}

/**
 * Re-saves a decrypted PDF without its password.
 *
 * The e-Aadhaar flow: pdf.js opens the encrypted file with the holder's password, the pages are
 * rasterised, and the result carries no encryption. Rasterising rather than copying page objects
 * is deliberate — `pdf-lib` cannot decrypt, so there is no lossless path here.
 */
export async function decryptPdf(
  bytes: Uint8Array,
  password: string,
  options: { dpi?: number; quality?: number } = {},
): Promise<Uint8Array> {
  // Confirm the password before doing the expensive part, so a typo fails in a tenth of a second.
  await loadPdf(bytes, password);
  return rasterisePdf(bytes, {
    dpi: options.dpi ?? 200,
    quality: options.quality ?? 0.85,
    password,
  });
}

// ---------------------------------------------------------------------------
// Bundles — several documents, in order, as one PDF under a size limit
// ---------------------------------------------------------------------------

/** One document going into a bundle. An encrypted PDF must already be decrypted. */
export type BundlePart = { bytes: Uint8Array; mimeType: string };

export type PdfBundleResult = {
  bytes: Uint8Array;
  pageCount: number;
  /** Parts that were photos or scans and became A4 pages. */
  imageParts: number;
  /** Set when compression ran, i.e. the merged file was over the target. */
  compression: PdfCompressionResult | null;
};

/**
 * Longest edge a photographed page is kept at: about 200 DPI on A4, legible on any portal
 * viewer. A 12 MP phone photo embedded at full size would cost the size budget for nothing.
 */
const BUNDLE_IMAGE_MAX_EDGE_PX = 2339;
const BUNDLE_IMAGE_QUALITY = 0.85;

async function imagePartToPdf(part: BundlePart): Promise<Uint8Array> {
  // Re-encoded through a canvas rather than embedded directly: it shrinks the photo, and it is
  // also the only way a WEBP (which pdf-lib cannot embed) gets into a PDF.
  const image = await decodeImage(new Blob([part.bytes.slice()], { type: part.mimeType }));
  try {
    const scale = Math.min(1, BUNDLE_IMAGE_MAX_EDGE_PX / Math.max(image.width, image.height));
    const canvas = createCanvas(image.width * scale, image.height * scale);
    const context = context2d(canvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const jpeg = await blobBytes(await canvasToBlob(canvas, 'image/jpeg', BUNDLE_IMAGE_QUALITY));
    return imagesToPdf([{ bytes: jpeg, mimeType: 'image/jpeg' }], { pageSize: 'a4' });
  } finally {
    image.release();
  }
}

/**
 * Builds the bundle: each part becomes PDF pages (a PDF's pages are copied losslessly, a photo
 * becomes one A4 page), the pages are concatenated in the order given, and the result is
 * compressed only if it is over `maxBytes`.
 *
 * Compressing once over the whole bundle rather than per part lets a small text certificate
 * leave room for a heavy scan, rather than each part getting an equal share it may not need.
 */
export async function buildPdfBundle(
  parts: readonly BundlePart[],
  options: { maxBytes: number | null; allowRasterise: boolean },
): Promise<PdfBundleResult> {
  const sources: Uint8Array[] = [];
  const refs: PageRef[] = [];
  let imageParts = 0;

  for (const part of parts) {
    let pdfBytes: Uint8Array;
    if (part.mimeType === 'application/pdf') {
      pdfBytes = part.bytes;
    } else {
      pdfBytes = await imagePartToPdf(part);
      imageParts += 1;
    }
    const sourceIndex = sources.length;
    sources.push(pdfBytes);
    const count = await pdfPageCount(pdfBytes);
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      refs.push({ sourceIndex, pageNumber });
    }
  }

  const assembled = await assemblePdf(sources, refs);
  if (options.maxBytes === null || assembled.byteLength <= options.maxBytes) {
    return { bytes: assembled, pageCount: refs.length, imageParts, compression: null };
  }

  const compression = await compressPdf(assembled, {
    maxBytes: options.maxBytes,
    allowRasterise: options.allowRasterise,
  });
  return { bytes: compression.bytes, pageCount: refs.length, imageParts, compression };
}
