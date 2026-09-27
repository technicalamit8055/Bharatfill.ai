import { SCHEME_LOGO_PATH_PATTERN, type SchemeImageKind } from '@assistigo/core';

/**
 * Checks for a scheme image upload — logo, banner or illustration.
 *
 * Pure functions, kept apart from the Server Action so the rules can be tested without a bucket.
 */

/**
 * The largest file accepted for each image kind. The bucket's own `file_size_limit` (0028) is the
 * largest of these; the tighter per-kind limits are checked here first for a readable error.
 */
export const SCHEME_IMAGE_MAX_BYTES: Record<SchemeImageKind, number> = {
  logo: 256 * 1024,
  illustration: 512 * 1024,
  banner: 1024 * 1024,
};

export const SCHEME_LOGO_MAX_BYTES = SCHEME_IMAGE_MAX_BYTES.logo;

export type SchemeLogoType = { ext: 'png' | 'jpg' | 'webp'; mimeType: string };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * The file's real type, read from its first bytes, or `null` if it is not an image we accept.
 *
 * The browser's `File.type` is whatever the client says it is, so it decides nothing. Sniffing
 * is also what keeps SVG out: an SVG is an XML document that can carry script, and a file renamed
 * `logo.png` with `<svg>` inside has no PNG signature to match.
 */
export function sniffSchemeLogoType(bytes: Uint8Array): SchemeLogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: 'png', mimeType: 'image/png' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  }
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ext: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

/**
 * A fresh object path for a scheme image of any kind: `<slug>/<uuid>.<ext>`.
 *
 * Built on the server from the row's own slug, never taken from the request. A new uuid per
 * upload means a replaced logo gets a new URL, so no browser keeps showing the old one from cache.
 */
export function buildSchemeLogoPath(slug: string, ext: SchemeLogoType['ext']): string {
  const path = `${slug}/${crypto.randomUUID()}.${ext}`;
  // A slug that passed the catalogue's own check always yields a valid path; this guards the
  // day somebody calls it with something else.
  if (!SCHEME_LOGO_PATH_PATTERN.test(path)) throw new Error('scheme logo path out of shape');
  return path;
}

export type SchemeImageCheck =
  | { ok: true; type: SchemeLogoType }
  | {
      ok: false;
      error:
        | 'admin.schemes.logoMissing'
        | `admin.schemes.${SchemeImageKind}TooLarge`
        | 'admin.schemes.logoWrongType';
    };

/** Everything that decides whether an upload is accepted, in the order a person would fix it. */
export function checkSchemeImage(kind: SchemeImageKind, bytes: Uint8Array): SchemeImageCheck {
  if (bytes.length === 0) return { ok: false, error: 'admin.schemes.logoMissing' };
  if (bytes.length > SCHEME_IMAGE_MAX_BYTES[kind]) {
    return { ok: false, error: `admin.schemes.${kind}TooLarge` };
  }
  const type = sniffSchemeLogoType(bytes);
  if (!type) return { ok: false, error: 'admin.schemes.logoWrongType' };
  return { ok: true, type };
}

export function checkSchemeLogo(bytes: Uint8Array): SchemeImageCheck {
  return checkSchemeImage('logo', bytes);
}
