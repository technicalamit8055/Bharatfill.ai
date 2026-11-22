/**
 * Google's on-device document scanner (ML Kit, through Google Play services), bridged from the
 * local native module in `modules/platform-scanner`. It finds the page with a neural model,
 * flattens it, and cleans shadows, stains and fingers off it — what the in-app OpenCV camera
 * cannot do with straight edges alone. Android only; it runs entirely on the phone and pages
 * are never uploaded.
 *
 * Ordinary document scans use it when the phone has it (`choosePlatformEngine`). The ID card,
 * photo and signature presets keep the in-app camera, whose processing is shaped for them
 * (`presets.ts`). With no Play services, on iOS, or when the scanner fails to open, the scanner
 * route falls back to the in-app camera (`app/scanner.tsx`).
 *
 * Pages come back as JPEGs in the app's cache, already cropped and flattened, and enter the
 * capture session with the `platform` source: they are not searched for a page again, and the
 * session's own clean-up deletes them like any other temporary page.
 */

import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

import type { ScanPreset } from './presets';
import { MULTI_PAGE_LIMIT, toFileUri } from './scan-session';

export interface ScanResult {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface PlatformScannerOptions {
  /** At most this many pages per scan; 1 to `MULTI_PAGE_LIMIT`. Defaults to 1. */
  readonly maxPages?: number;
  /** Lets the citizen pick photos inside Google's scanner. Defaults to false. */
  readonly allowGalleryImport?: boolean;
}

/** Name the native module registers (`PlatformScannerModule.kt`). */
export const PLATFORM_SCANNER_MODULE = 'BharatfillPlatformScanner';

type NativePlatformScanner = {
  isAvailable(): boolean;
  scan(options: { maxPages: number; allowGalleryImport: boolean }): Promise<unknown>;
};

/** The scanner cannot be used here: no native module, no Play services, or it would not open. */
export class PlatformScannerUnavailableError extends Error {
  constructor() {
    super('The document scanner is not available on this phone.');
    this.name = 'PlatformScannerUnavailableError';
  }
}

const nativePageSchema = z.object({
  uri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const nativeResultSchema = z.object({
  canceled: z.boolean(),
  pages: z.array(nativePageSchema),
});

/**
 * The scan the native module reported: its pages as `file://` URIs, or null when the citizen
 * backed out (or nothing came back). Throws when the shape is wrong — a native bug, not the
 * citizen's doing. A page outside local storage is refused: the session only reads, and only
 * ever deletes, local files.
 */
export function parsePlatformScan(raw: unknown): ScanResult[] | null {
  const result = nativeResultSchema.parse(raw);
  if (result.canceled || result.pages.length === 0) return null;
  return result.pages.map((page) => {
    const uri = toFileUri(page.uri);
    if (!uri.startsWith('file://')) throw new Error('The scanner returned a page outside the app.');
    return { uri, width: page.width, height: page.height };
  });
}

/**
 * How many pages the next platform scan may take: one for a retake (it replaces a page),
 * otherwise whatever room is left under the preset's limit. Single-page mode does not cap it:
 * Google's scanner ends every scan on its own review with Done, so one page costs no extra tap,
 * and capping it would hide its Add page button.
 */
export function platformPageRoom(scan: {
  readonly retaking: boolean;
  readonly pageCount: number;
  readonly pageLimit: number;
}): number {
  if (scan.retaking) return 1;
  return Math.max(0, Math.min(scan.pageLimit, MULTI_PAGE_LIMIT) - scan.pageCount);
}

/** Whether a scan for `preset` should use the platform scanner, when the phone has one. */
export function choosePlatformEngine(preset: ScanPreset, available: boolean): boolean {
  return available && preset === 'document';
}

function nativeScanner(): NativePlatformScanner | null {
  try {
    return requireOptionalNativeModule<NativePlatformScanner>(PLATFORM_SCANNER_MODULE);
  } catch {
    return null;
  }
}

/** Whether this phone can run Google's document scanner. */
export function isPlatformScannerAvailable(): boolean {
  const scanner = nativeScanner();
  if (!scanner) return false;
  try {
    return scanner.isAvailable();
  } catch {
    return false;
  }
}

/** Native error codes that mean "use the in-app camera instead". */
const UNAVAILABLE_CODES = new Set(['ERR_SCANNER_UNAVAILABLE']);

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/**
 * Opens Google's document scanner over the app and waits for it. Resolves with the pages
 * scanned, or null when the citizen backed out. Rejects with `PlatformScannerUnavailableError`
 * when the scanner cannot be used here, so the caller can fall back to the in-app camera.
 */
export async function scanWithPlatformML(
  options: PlatformScannerOptions = {},
): Promise<ScanResult[] | null> {
  const scanner = nativeScanner();
  if (!scanner) throw new PlatformScannerUnavailableError();
  const maxPages = Math.min(MULTI_PAGE_LIMIT, Math.max(1, Math.floor(options.maxPages ?? 1)));
  let raw: unknown;
  try {
    raw = await scanner.scan({ maxPages, allowGalleryImport: options.allowGalleryImport ?? false });
  } catch (error) {
    if (UNAVAILABLE_CODES.has(errorCode(error) ?? '')) throw new PlatformScannerUnavailableError();
    throw error;
  }
  return parsePlatformScan(raw);
}
