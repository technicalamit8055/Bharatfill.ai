import type { DerivativeRecipe, OutputMimeType } from '@assistigo/document-tools';

/**
 * Client side of the prepared-file flow.
 *
 * Deliberately mirrors the document upload in `documents/upload/upload-form.tsx`: reserve, PUT
 * the bytes straight to storage, then tell the server to verify them and write the row. Bytes
 * never pass through a route handler — a Netlify function has a few megabytes of request budget
 * and a 300 DPI A4 photo sheet does not respect it.
 */

export type SaveDerivativeInput = {
  bytes: Uint8Array;
  mimeType: OutputMimeType;
  filename: string;
  widthPx?: number | null;
  heightPx?: number | null;
  customerId?: string | null;
  sourceDocumentId?: string | null;
  recipe: DerivativeRecipe;
};

export type SaveDerivativeResult =
  | { ok: true; id: string; filename: string; sizeBytes: number }
  | { ok: false; messageKey: string };

type IntentResponse = {
  derivativeId: string;
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
};

const TOOL_TO_DB_TOOL_TYPE = {
  photo_signature: 'photo',
  passport_grid: 'photo',
  pvc_card: 'photo',
  pdf_studio: 'pdf',
} as const;

function messageKeyFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { messageKey?: unknown } }).error;
    if (error && typeof error.messageKey === 'string') return error.messageKey;
  }
  return fallback;
}

/**
 * Saves a prepared file against the organization, optionally linked to a customer and the source
 * document it came from (§13.3 — "tool outputs can be attached to customer or application").
 *
 * Returns a message key rather than throwing: every call site is a button an operator pressed,
 * and every failure has to become a sentence in their own language rather than a console error.
 */
export async function saveDerivative(
  input: SaveDerivativeInput,
): Promise<SaveDerivativeResult> {
  const toolType = TOOL_TO_DB_TOOL_TYPE[input.recipe.tool];
  const sizeBytes = input.bytes.byteLength;

  const intentResponse = await fetch('/api/derivatives/upload-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      toolType,
      mimeType: input.mimeType,
      sizeBytes,
      filename: input.filename,
      customerId: input.customerId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
    }),
  });

  const intentJson: unknown = await intentResponse.json().catch(() => null);
  if (!intentResponse.ok || !intentJson || !('data' in (intentJson as object))) {
    return { ok: false, messageKey: messageKeyFrom(intentJson, 'errors.internal') };
  }
  const intent = (intentJson as { data: IntentResponse }).data;

  // `bytes.slice()` rather than the view: a Uint8Array over a larger buffer would upload the
  // whole buffer, and the server re-reads the object's real length before it will accept it.
  const uploadResponse = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': input.mimeType },
    body: new Blob([input.bytes.slice()], { type: input.mimeType }),
  });
  if (!uploadResponse.ok) return { ok: false, messageKey: 'errors.upload_incomplete' };

  const createResponse = await fetch('/api/derivatives', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      derivativeId: intent.derivativeId,
      toolType,
      mimeType: input.mimeType,
      sizeBytes,
      filename: input.filename,
      widthPx: input.widthPx ?? null,
      heightPx: input.heightPx ?? null,
      customerId: input.customerId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      presetCode: input.recipe.presetCode,
      recipe: input.recipe,
    }),
  });

  const createJson: unknown = await createResponse.json().catch(() => null);
  if (!createResponse.ok || !createJson || !('data' in (createJson as object))) {
    return { ok: false, messageKey: messageKeyFrom(createJson, 'errors.internal') };
  }

  const created = (createJson as { data: { id: string; filename: string; sizeBytes: number } })
    .data;
  return { ok: true, id: created.id, filename: created.filename, sizeBytes: created.sizeBytes };
}

/**
 * Hands the file to the operator's own machine.
 *
 * The commonest ending for a prepared file: the portal upload dialog is already open in the next
 * tab, and the operator wants the file in Downloads, not in the CRM. Saving to the customer is
 * the extra step, not the default — an unnecessary copy of someone's photograph on a server is a
 * cost, not a feature.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously can beat the download starting in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the print dialog on a single image, for a sheet going straight to the shop printer. */
export function printImage(bytes: Uint8Array, mimeType: string, title: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mimeType }));
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return;
    view.document.title = title;
    // The image has to have laid out before printing, or the sheet comes out blank.
    const image = view.document.querySelector('img');
    const start = () => {
      view.focus();
      view.print();
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 1000);
    };
    if (image && !image.complete) image.onload = start;
    else start();
  };

  document.body.appendChild(frame);
  frame.srcdoc = `<!doctype html><html><head><style>
    @page { margin: 0 }
    html,body { margin:0; padding:0 }
    img { width:100%; height:auto; display:block }
  </style></head><body><img src="${url}" alt=""></body></html>`;
}
