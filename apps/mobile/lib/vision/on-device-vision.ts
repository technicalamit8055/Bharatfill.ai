/**
 * Google's on-device ML Kit models (through Google Play services), bridged from the local native
 * module in `modules/on-device-vision`:
 *
 * - `readPageText` — the text printed on a page, read once in English and once in Devanagari,
 *   for filing a document and searching the vault by its contents (`lib/ocr`).
 * - `cutOutPortrait` — the faces in a photo and a mask of the person, for a studio passport
 *   photo (`lib/scan/studio-photo.ts`).
 *
 * Android only; everything runs on the phone and nothing is uploaded. Without the native module,
 * without Play services, or before its models are installed, every call rejects with
 * `OnDeviceVisionUnavailableError` and the callers carry on without it: a document is filed by
 * hand, and a passport photo keeps its own background.
 */

import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

import { toFileUri } from '../scan/scan-session';

/** Name the native module registers (`OnDeviceVisionModule.kt`). */
export const ON_DEVICE_VISION_MODULE = 'BharatfillOnDeviceVision';

/** `[left, top, right, bottom]`, in the image's pixels. */
export type Box = readonly [number, number, number, number];

export type TextLine = { readonly text: string; readonly box: Box };

/** A page's text as each model read it; null for a model that could not run. */
export type PageText = {
  readonly width: number;
  readonly height: number;
  readonly latin: readonly TextLine[] | null;
  readonly devanagari: readonly TextLine[] | null;
};

export type PortraitCutout = {
  /** A greyscale PNG in the app's cache, the photo's size: white is the person. Delete it after. */
  readonly maskUri: string;
  readonly width: number;
  readonly height: number;
  readonly faces: readonly Box[];
};

/** The models cannot run here: no native module, no Play services, or not installed yet. */
export class OnDeviceVisionUnavailableError extends Error {
  constructor() {
    super('On-device vision is not available on this phone.');
    this.name = 'OnDeviceVisionUnavailableError';
  }
}

/** The photo has no person in it to cut out. */
export class NoPersonFoundError extends Error {
  constructor() {
    super('No person was found in the photo.');
    this.name = 'NoPersonFoundError';
  }
}

type NativeVision = {
  isAvailable(): boolean;
  readText(input: { uri?: string; base64?: string }): Promise<unknown>;
  cutOutPortrait(uri: string): Promise<unknown>;
};

const boxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const linesSchema = z
  .array(z.object({ text: z.string().max(2000), box: boxSchema }))
  .max(5000)
  .nullable();

const pageTextSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  latin: linesSchema,
  devanagari: linesSchema,
});

const cutoutSchema = z.object({
  maskUri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  faces: z.array(boxSchema).max(50),
});

/** What the native module reported for `readText`. Throws when the shape is wrong. */
export function parsePageText(raw: unknown): PageText {
  return pageTextSchema.parse(raw);
}

/**
 * What the native module reported for `cutOutPortrait`. Throws when the shape is wrong, or when
 * the mask is anywhere but a local file: the caller reads and deletes it.
 */
export function parsePortraitCutout(raw: unknown): PortraitCutout {
  const cutout = cutoutSchema.parse(raw);
  const maskUri = toFileUri(cutout.maskUri);
  if (!maskUri.startsWith('file://')) throw new Error('The mask is outside the app.');
  return { ...cutout, maskUri };
}

function nativeVision(): NativeVision | null {
  try {
    return requireOptionalNativeModule<NativeVision>(ON_DEVICE_VISION_MODULE);
  } catch {
    return null;
  }
}

/** Whether this phone can run the on-device models at all (it may still be installing them). */
export function isOnDeviceVisionAvailable(): boolean {
  const vision = nativeVision();
  if (!vision) return false;
  try {
    return vision.isAvailable();
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function translated(error: unknown): Error {
  const code = errorCode(error);
  if (code === 'ERR_VISION_UNAVAILABLE') return new OnDeviceVisionUnavailableError();
  if (code === 'ERR_VISION_NO_PERSON') return new NoPersonFoundError();
  return error instanceof Error ? error : new Error('On-device vision failed.');
}

/**
 * Reads the text on one page: a local image file (`uri`), or a decrypted vault page held only in
 * memory (`base64`), which never touches the disk.
 */
export async function readPageText(
  input: { readonly uri: string } | { readonly base64: string },
): Promise<PageText> {
  const vision = nativeVision();
  if (!vision || !isOnDeviceVisionAvailable()) throw new OnDeviceVisionUnavailableError();
  let raw: unknown;
  try {
    raw = await vision.readText('uri' in input ? { uri: input.uri } : { base64: input.base64 });
  } catch (error) {
    throw translated(error);
  }
  return parsePageText(raw);
}

/** Finds the faces and the person in an upright photo in the app's cache. */
export async function cutOutPortrait(uri: string): Promise<PortraitCutout> {
  const vision = nativeVision();
  if (!vision || !isOnDeviceVisionAvailable()) throw new OnDeviceVisionUnavailableError();
  let raw: unknown;
  try {
    raw = await vision.cutOutPortrait(uri);
  } catch (error) {
    throw translated(error);
  }
  return parsePortraitCutout(raw);
}
