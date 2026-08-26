import { z } from 'zod';
import { DERIVATIVE_TOOL_TYPES } from '@assistigo/core';
import {
  MAX_DERIVATIVE_BYTES,
  OUTPUT_MIME_TYPES,
  derivativeRecipeSchema,
  isPresetCode,
} from '@assistigo/document-tools';

/**
 * Request schemas for the prepared-file routes.
 * Master spec §17.3 — every external input is validated with Zod before use.
 *
 * A derivative is produced by our own client code, but "our own client code" is still the
 * network: the request that lands here is whatever the browser chose to send, so it is validated
 * exactly as strictly as an operator-typed form (docs/DEVELOPMENT_RULES.md §2).
 */

const toolTypeSchema = z.enum(DERIVATIVE_TOOL_TYPES);
const outputMimeSchema = z.enum(OUTPUT_MIME_TYPES, {
  errorMap: () => ({ message: 'validation.unsupported_file_type' }),
});

const sizeSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_DERIVATIVE_BYTES, { message: 'validation.file_too_large' });

/**
 * A preset code the build knows about, or null.
 *
 * Refused rather than accepted-and-ignored: a code the server does not recognise means the
 * client is a version ahead of the server, and silently storing a dangling reference would make
 * `metadata.preset` unreadable later.
 */
const presetCodeSchema = z
  .string()
  .max(80)
  .nullable()
  .refine((code) => code === null || isPresetCode(code), {
    message: 'validation.unknown_preset',
  });

export const derivativeIntentSchema = z.object({
  toolType: toolTypeSchema,
  mimeType: outputMimeSchema,
  sizeBytes: sizeSchema,
  filename: z.string().min(1).max(160),
  customerId: z.string().uuid().nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
});

export const derivativeCreateSchema = z.object({
  /** Handed out by the intent route. Also the storage path segment. */
  derivativeId: z.string().uuid(),
  toolType: toolTypeSchema,
  mimeType: outputMimeSchema,
  sizeBytes: sizeSchema,
  filename: z.string().min(1).max(160),
  widthPx: z.number().int().positive().max(20_000).nullable().optional(),
  heightPx: z.number().int().positive().max(20_000).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  presetCode: presetCodeSchema.optional(),
  recipe: derivativeRecipeSchema,
});

export const derivativeListSchema = z.object({
  customerId: z.string().uuid().optional(),
  sourceDocumentId: z.string().uuid().optional(),
  toolType: toolTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type DerivativeIntentInput = z.output<typeof derivativeIntentSchema>;
export type DerivativeCreateInput = z.output<typeof derivativeCreateSchema>;
export type DerivativeListInput = z.output<typeof derivativeListSchema>;
