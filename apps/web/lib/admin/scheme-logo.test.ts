import { describe, expect, it } from 'vitest';
import { SCHEME_LOGO_PATH_PATTERN } from '@assistigo/core';
import {
  SCHEME_IMAGE_MAX_BYTES,
  SCHEME_LOGO_MAX_BYTES,
  buildSchemeLogoPath,
  checkSchemeImage,
  checkSchemeLogo,
  sniffSchemeLogoType,
} from './scheme-logo';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const text = (value: string) => new TextEncoder().encode(value);

describe('sniffSchemeLogoType', () => {
  it('recognises PNG, JPEG and WebP by their bytes', () => {
    expect(sniffSchemeLogoType(new Uint8Array(PNG))?.ext).toBe('png');
    expect(sniffSchemeLogoType(new Uint8Array(JPEG))?.ext).toBe('jpg');
    expect(sniffSchemeLogoType(new Uint8Array(WEBP))?.ext).toBe('webp');
  });

  /** SVG is a document that can carry script; a logo has no need to be one. */
  it('refuses SVG, whatever the file is called', () => {
    expect(sniffSchemeLogoType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffSchemeLogoType(text('<?xml version="1.0"?><svg/>'))).toBeNull();
  });

  it('refuses other formats and truncated signatures', () => {
    expect(sniffSchemeLogoType(new Uint8Array(GIF))).toBeNull();
    expect(sniffSchemeLogoType(text('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffSchemeLogoType(new Uint8Array(PNG.slice(0, 4)))).toBeNull();
    // RIFF alone is also WAV and AVI.
    expect(sniffSchemeLogoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBeNull();
    expect(sniffSchemeLogoType(new Uint8Array())).toBeNull();
  });
});

describe('checkSchemeLogo', () => {
  it('accepts a small image', () => {
    expect(checkSchemeLogo(new Uint8Array(PNG))).toEqual({
      ok: true,
      type: { ext: 'png', mimeType: 'image/png' },
    });
  });

  it('asks for a file when there is none', () => {
    expect(checkSchemeLogo(new Uint8Array())).toEqual({
      ok: false,
      error: 'admin.schemes.logoMissing',
    });
  });

  it('refuses anything over the bucket limit, before looking at the type', () => {
    const big = new Uint8Array(SCHEME_LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(checkSchemeLogo(big)).toEqual({ ok: false, error: 'admin.schemes.logoTooLarge' });

    const atLimit = new Uint8Array(SCHEME_LOGO_MAX_BYTES);
    atLimit.set(PNG);
    expect(checkSchemeLogo(atLimit).ok).toBe(true);
  });

  it('names the wrong type', () => {
    expect(checkSchemeLogo(new Uint8Array(GIF))).toEqual({
      ok: false,
      error: 'admin.schemes.logoWrongType',
    });
  });
});

describe('checkSchemeImage', () => {
  const sized = (bytes: number) => {
    const file = new Uint8Array(bytes);
    file.set(JPEG);
    return file;
  };

  it('gives a banner room a logo does not get', () => {
    expect(checkSchemeImage('banner', sized(800 * 1024)).ok).toBe(true);
    expect(checkSchemeImage('logo', sized(800 * 1024))).toEqual({
      ok: false,
      error: 'admin.schemes.logoTooLarge',
    });
  });

  it('names the kind whose limit was crossed', () => {
    expect(checkSchemeImage('banner', sized(SCHEME_IMAGE_MAX_BYTES.banner + 1))).toEqual({
      ok: false,
      error: 'admin.schemes.bannerTooLarge',
    });
    expect(
      checkSchemeImage('illustration', sized(SCHEME_IMAGE_MAX_BYTES.illustration + 1)),
    ).toEqual({ ok: false, error: 'admin.schemes.illustrationTooLarge' });
  });

  /** The bucket (0028) is 1 MB; no kind may promise more than storage will accept. */
  it('never allows more than the bucket limit', () => {
    for (const limit of Object.values(SCHEME_IMAGE_MAX_BYTES)) {
      expect(limit).toBeLessThanOrEqual(1024 * 1024);
    }
  });

  it('refuses SVG as a banner too', () => {
    expect(
      checkSchemeImage(
        'banner',
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toEqual({ ok: false, error: 'admin.schemes.logoWrongType' });
  });
});

describe('buildSchemeLogoPath', () => {
  it('files the logo under the slug with a fresh id, in the shape the database accepts', () => {
    const first = buildSchemeLogoPath('ssc-cgl', 'png');
    const second = buildSchemeLogoPath('ssc-cgl', 'png');

    expect(first).toMatch(SCHEME_LOGO_PATH_PATTERN);
    expect(first.startsWith('ssc-cgl/')).toBe(true);
    expect(first.endsWith('.png')).toBe(true);
    // A replaced logo must get a new URL, or browsers keep the old one from cache.
    expect(first).not.toBe(second);
  });

  it('refuses a slug that would escape its folder', () => {
    expect(() => buildSchemeLogoPath('../customer-documents', 'png')).toThrow();
    expect(() => buildSchemeLogoPath('a/b', 'jpg')).toThrow();
  });
});
