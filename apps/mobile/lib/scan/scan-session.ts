/**
 * Pure rules for a scanning session: the page and capture modes the scanner can run in, turning
 * native file paths into URIs, and which image files are the app's own temporary copies to
 * delete once a page is sealed into the vault (or thrown away).
 */

import { z } from 'zod';

export const SCAN_PAGE_MODES = ['single', 'multi'] as const;
export type ScanPageMode = (typeof SCAN_PAGE_MODES)[number];

/** Auto: the shutter fires by itself once the page has been held steady. Manual: tap to shoot. */
export const CAPTURE_MODES = ['auto', 'manual'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

/** Multi-page mode stops here, so a booklet cannot fill the phone by accident. */
export const MULTI_PAGE_LIMIT = 24;

/** The mode in a `?mode=` route param; anything unrecognised falls back to a single page. */
export function parseScanPageMode(value: unknown): ScanPageMode {
  const parsed = z.enum(SCAN_PAGE_MODES).safeParse(Array.isArray(value) ? value[0] : value);
  return parsed.success ? parsed.data : 'single';
}

/** Native modules report plain paths; the file system and `<Image>` want `file://` URIs. */
export function toFileUri(pathOrUri: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUri)) return pathOrUri;
  const path = pathOrUri.replace(/\\/g, '/');
  return path.startsWith('/') ? `file://${path}` : `file:///${path}`;
}

export type AppDirectories = {
  /** `Paths.cache.uri`: camera photos on Android, image-picker copies, processed pages. */
  readonly cacheUri: string;
  /** The app's `tmp` folder: camera photos on iOS. */
  readonly tempUri?: string;
};

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function isInside(uri: string, directory: string): boolean {
  const root = withSlash(directory);
  return uri.startsWith(root) && uri.length > root.length;
}

/**
 * Whether an image is a temporary copy the app owns, safe to delete once it is sealed or
 * discarded: anything inside the app's cache or tmp folder. A file anywhere else — above all a
 * photo in the citizen's gallery — is never deleted.
 */
export function isDisposableScanFile(uri: string, dirs: AppDirectories): boolean {
  if (uri.includes('/../') || uri.endsWith('/..')) return false;
  return isInside(uri, dirs.cacheUri) || (dirs.tempUri ? isInside(uri, dirs.tempUri) : false);
}
