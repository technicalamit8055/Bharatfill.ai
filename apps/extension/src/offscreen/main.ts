/**
 * Offscreen document: where auto-fit actually runs (docs/EXTENSION.md §6c).
 *
 * The service worker cannot do this itself — it has no `document`, so no canvas to decode a
 * photo onto and no way to let pdf.js render a page. This page has both and nothing else: no
 * UI, no network access of its own, no API token. It answers exactly one sender, the worker,
 * and does three things:
 *
 *   AUTO_FIT_RUN      bytes in → the same `encodeToWindow` / `compressPdf` Document Tools
 *                     Studio uses → a summary, a `blob:` preview URL and a token out.
 *   AUTO_FIT_TAKE     token in → the fitted bytes out, for the fill. Then they are gone.
 *   AUTO_FIT_DISCARD  token in → gone.
 *
 * Held copies live in memory only, for at most `HOLD_MS`, and never more than `MAX_HELD` at a
 * time. Nothing is written to storage and nothing leaves this page except back to the worker.
 * Errors are never logged or forwarded: the input is a customer's identity document (§19.6).
 */

import {
  decodeImage,
  encodeToWindow,
  renderImage,
  renderIntoFrame,
} from '@assistigo/document-tools/browser/image';
import { compressPdf } from '@assistigo/document-tools/browser/pdf';
import { MAX_ATTACHMENT_BYTES } from '@assistigo/form-engine/types';
import {
  OFFSCREEN_TARGET,
  offscreenRequestSchema,
  type AutoFitJob,
  type AutoFitResult,
  type TakenFit,
} from '../shared/autofit';
import { base64ToBytes, bytesToBase64 } from '../shared/bytes';
import { fail, ok, type MessageResponse } from '../shared/messages';

/** Long enough to look at the preview and finish the rest of the form; short enough to forget. */
const HOLD_MS = 15 * 60 * 1000;
/** A portal page has a handful of upload boxes. Twenty is generous and still bounded. */
const MAX_HELD = 20;

type HeldFit = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  previewUrl: string;
  heldAt: number;
};

const held = new Map<string, HeldFit>();

function release(token: string): HeldFit | undefined {
  const fit = held.get(token);
  if (!fit) return undefined;
  held.delete(token);
  URL.revokeObjectURL(fit.previewUrl);
  return fit;
}

function sweep(now = Date.now()): void {
  for (const [token, fit] of held) {
    if (now - fit.heldAt > HOLD_MS) release(token);
  }
  // Map iteration is insertion order, so the first key is always the oldest.
  while (held.size >= MAX_HELD) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    release(oldest);
  }
}

setInterval(() => sweep(), 60 * 1000);

type Encoded = {
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
  scale: number | null;
  padded: boolean;
  rasterised: boolean;
  dpi: number | null;
  overLimit: boolean;
  resized: { widthPx: number; heightPx: number; dpi: number | null } | null;
  /** A photo whose shape is too far from the box's to fit without cropping. */
  needsCrop?: boolean;
};

async function encode(
  job: AutoFitJob,
  source: Uint8Array,
  sourceMimeType: string,
): Promise<Encoded> {
  if (job.action === 'pdf') {
    const result = await compressPdf(source, { maxBytes: job.maxBytes });
    return {
      bytes: result.bytes,
      width: null,
      height: null,
      scale: null,
      padded: false,
      rasterised: result.rasterised,
      dpi: result.dpi,
      overLimit: result.overLimit,
      resized: null,
    };
  }

  const resize = job.resize;
  const decoded = await decodeImage(new Blob([source.slice()], { type: sourceMimeType }));
  let canvas: HTMLCanvasElement | null;
  try {
    canvas = resize
      ? // The box's exact size: signature margin trimmed, centred on white, never stretched.
        renderIntoFrame(decoded, {
          width: resize.widthPx,
          height: resize.heightPx,
          subject: resize.subject,
        })
      : // Whole image, natural size, white behind any transparency: JPEG has no alpha channel.
        renderImage(decoded);
  } finally {
    decoded.release();
  }
  if (!canvas) {
    return {
      bytes: new Uint8Array(),
      width: null,
      height: null,
      scale: null,
      padded: false,
      rasterised: false,
      dpi: null,
      overLimit: false,
      resized: null,
      needsCrop: true,
    };
  }

  const result = await encodeToWindow(canvas, {
    mimeType: job.outputMimeType,
    ...(job.minBytes !== undefined ? { minBytes: job.minBytes } : {}),
    ...(job.maxBytes !== undefined ? { maxBytes: job.maxBytes } : {}),
    // A portal that checks pixels must get exactly these pixels, so only quality may move.
    ...(resize ? { fixedSize: true } : {}),
    ...(resize?.dpi ? { dpi: resize.dpi } : {}),
  });
  return {
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    scale: resize ? null : result.scale,
    padded: result.padded,
    rasterised: false,
    dpi: null,
    overLimit: result.overLimit,
    resized: resize ? { widthPx: result.width, heightPx: result.height, dpi: resize.dpi } : null,
  };
}

async function run(
  job: AutoFitJob,
  sourceMimeType: string,
  dataBase64: string,
): Promise<AutoFitResult> {
  const source = base64ToBytes(dataBase64);
  const encoded = await encode(job, source, sourceMimeType);
  if (encoded.needsCrop) return { status: 'cannot_fit', reason: 'needs_crop' };

  // Over the limit is reported, never attached: a portal that refuses the upload after the
  // operator confirmed it is worse than being told now.
  if (encoded.overLimit) return { status: 'cannot_fit', reason: 'still_over_limit' };
  if (encoded.bytes.length > MAX_ATTACHMENT_BYTES) {
    return { status: 'cannot_fit', reason: 'source_too_large' };
  }

  const mimeType = job.action === 'pdf' ? 'application/pdf' : job.outputMimeType;
  sweep();
  const token = crypto.randomUUID();
  const previewUrl = URL.createObjectURL(new Blob([encoded.bytes.slice()], { type: mimeType }));
  held.set(token, {
    bytes: encoded.bytes,
    filename: job.filename,
    mimeType,
    previewUrl,
    heldAt: Date.now(),
  });

  return {
    status: 'fitted',
    token,
    filename: job.filename,
    mimeType,
    previewUrl,
    width: encoded.width,
    height: encoded.height,
    report: {
      fromBytes: source.length,
      toBytes: encoded.bytes.length,
      converted: job.action === 'image' && job.converted,
      scale: encoded.scale,
      padded: encoded.padded,
      rasterised: encoded.rasterised,
      dpi: encoded.dpi,
      resized: encoded.resized,
    },
  };
}

/**
 * Only the worker may ask. The side panel shares this extension origin and its messages arrive
 * here too — it is ignored outright, so the "panel never holds document bytes" rule
 * (docs/EXTENSION.md §6a) holds even against a panel bug that sends `AUTO_FIT_TAKE`.
 */
function fromWorker(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.tab === undefined &&
    sender.url === chrome.runtime.getURL('background.js')
  );
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  // Everything else on the runtime bus belongs to the worker; leave it unanswered here.
  if (
    raw === null ||
    typeof raw !== 'object' ||
    (raw as { target?: unknown }).target !== OFFSCREEN_TARGET
  ) {
    return undefined;
  }
  if (!fromWorker(sender)) {
    sendResponse(fail('invalid_sender'));
    return undefined;
  }

  const parsed = offscreenRequestSchema.safeParse(raw);
  if (!parsed.success) {
    sendResponse(fail('invalid_message'));
    return undefined;
  }
  const request = parsed.data;

  const handle = async (): Promise<MessageResponse<AutoFitResult | TakenFit | null>> => {
    switch (request.type) {
      case 'AUTO_FIT_RUN':
        try {
          return ok(await run(request.job, request.sourceMimeType, request.dataBase64));
        } catch {
          // Deliberately not inspected or logged: a decode error can quote the document (§19.6).
          return ok({ status: 'cannot_fit', reason: 'processing_failed' });
        }
      case 'AUTO_FIT_TAKE': {
        const fit = release(request.token);
        if (!fit) return fail('fit_expired');
        return ok({
          filename: fit.filename,
          mimeType: fit.mimeType,
          dataBase64: bytesToBase64(fit.bytes),
        });
      }
      case 'AUTO_FIT_DISCARD':
        release(request.token);
        return ok(null);
    }
  };

  handle()
    .then(sendResponse)
    .catch(() => sendResponse(fail('offscreen_failed')));
  return true;
});
