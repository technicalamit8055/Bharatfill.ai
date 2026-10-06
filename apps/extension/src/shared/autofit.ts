/**
 * The auto-fit contract (docs/EXTENSION.md §6c).
 *
 * Two hops, two schemas:
 *
 *   side panel ⇄ background   `PREPARE_AUTO_FIT` / `DISCARD_AUTO_FIT` in `messages.ts`, answered
 *                             with an `AutoFitResult` — a summary, a preview URL and a token.
 *                             Never bytes: the panel holds no document bytes, before or after.
 *   background ⇄ offscreen    the `offscreenRequestSchema` below. The only hop that carries
 *                             bytes, and only from the worker, which is the sole sender the
 *                             offscreen document answers.
 *
 * The fitted bytes stay in the offscreen document, keyed by token, until the fill takes them or
 * the operator discards them. They are never written to storage, never uploaded, and never put
 * on the customer's profile: the product owner chose not to retain auto-fitted copies.
 */

import { z } from 'zod';
import { MAX_ATTACHMENT_BASE64_LENGTH } from '@assistigo/form-engine/types';
import { AUTO_FIT_MAX_SOURCE_BYTES } from '@assistigo/document-tools/autofit';

export const AUTO_FIT_FAILURES = [
  'unsupported_type',
  'source_too_large',
  'type_not_accepted',
  'jpeg_not_accepted',
  'below_minimum',
  'still_over_limit',
  'processing_failed',
] as const;
export type AutoFitFailure = (typeof AUTO_FIT_FAILURES)[number];

export const autoFitReportSchema = z.object({
  fromBytes: z.number().int().nonnegative(),
  toBytes: z.number().int().nonnegative(),
  converted: z.boolean(),
  scale: z.number().positive().max(1).nullable(),
  padded: z.boolean(),
  rasterised: z.boolean(),
  dpi: z.number().int().positive().nullable(),
});

export const autoFitResultSchema = z.discriminatedUnion('status', [
  /** The real download already fits — attach the original as before. */
  z.object({ status: z.literal('already_fits') }),
  z.object({
    status: z.literal('fitted'),
    token: z.string().uuid(),
    filename: z.string().max(300),
    mimeType: z.string().max(120),
    /** A `blob:` URL owned by the offscreen document. Same extension origin as the panel. */
    previewUrl: z.string().startsWith('blob:').max(300),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    report: autoFitReportSchema,
  }),
  z.object({ status: z.literal('cannot_fit'), reason: z.enum(AUTO_FIT_FAILURES) }),
]);
export type AutoFitResult = z.infer<typeof autoFitResultSchema>;

/** What to turn the source into — `AutoFitPlan` minus the `none`/`cannot_fit` arms. */
export const autoFitJobSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('image'),
    outputMimeType: z.literal('image/jpeg'),
    filename: z.string().max(300),
    minBytes: z.number().int().positive().optional(),
    maxBytes: z.number().int().positive().optional(),
    converted: z.boolean(),
  }),
  z.object({
    action: z.literal('pdf'),
    filename: z.string().max(300),
    maxBytes: z.number().int().positive(),
  }),
]);
export type AutoFitJob = z.infer<typeof autoFitJobSchema>;

/** Base64 of the largest source the worker will hand over. */
const MAX_SOURCE_BASE64_LENGTH = Math.ceil(AUTO_FIT_MAX_SOURCE_BYTES / 3) * 4 + 4;

export const OFFSCREEN_TARGET = 'assistigo-offscreen' as const;

export const offscreenRequestSchema = z.discriminatedUnion('type', [
  z.object({
    target: z.literal(OFFSCREEN_TARGET),
    type: z.literal('AUTO_FIT_RUN'),
    job: autoFitJobSchema,
    sourceMimeType: z.string().max(120),
    dataBase64: z.string().max(MAX_SOURCE_BASE64_LENGTH),
  }),
  /** Hands the fitted bytes over for the fill and forgets them. One use per token. */
  z.object({
    target: z.literal(OFFSCREEN_TARGET),
    type: z.literal('AUTO_FIT_TAKE'),
    token: z.string().uuid(),
  }),
  z.object({
    target: z.literal(OFFSCREEN_TARGET),
    type: z.literal('AUTO_FIT_DISCARD'),
    token: z.string().uuid(),
  }),
]);
export type OffscreenRequest = z.infer<typeof offscreenRequestSchema>;

export const takenFitSchema = z.object({
  filename: z.string().max(300),
  mimeType: z.string().max(120),
  dataBase64: z.string().max(MAX_ATTACHMENT_BASE64_LENGTH),
});
export type TakenFit = z.infer<typeof takenFitSchema>;
