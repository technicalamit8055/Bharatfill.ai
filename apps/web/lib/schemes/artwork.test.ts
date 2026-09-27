import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getBuiltInScheme } from '@assistigo/core';
import { getDictionary } from '../i18n';
import { SCHEME_ARTWORK_SLUGS, resolveSchemeImages, schemeArtwork } from './artwork';

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

describe('schemeArtwork', () => {
  it('has artwork for Ayushman Bharat', () => {
    expect(schemeArtwork('ayushman-bharat-pmjay')?.banner).toBe(
      '/schemes/ayushman-hospital-banner.png',
    );
  });

  /** The banner names PM-JAY on the building, so no other scheme may borrow it. */
  it('has nothing for a scheme without its own entry', () => {
    expect(schemeArtwork('pm-kisan')).toBeNull();
    expect(schemeArtwork('')).toBeNull();
    expect(schemeArtwork('constructor')).toBeNull();
    expect(schemeArtwork('__proto__')).toBeNull();
  });

  it.each(SCHEME_ARTWORK_SLUGS)('%s is a built-in scheme', (slug) => {
    expect(getBuiltInScheme(slug)).toBeDefined();
  });

  it.each(SCHEME_ARTWORK_SLUGS)('%s points at images that ship in /public', (slug) => {
    const art = schemeArtwork(slug);
    for (const src of [art?.logo, art?.banner, art?.illustration]) {
      expect(src).toMatch(/^\/schemes\//);
      expect(existsSync(join(PUBLIC_DIR, src ?? ''))).toBe(true);
    }
  });

  /** Read each dictionary directly: the translator would quietly fall back to English. */
  it.each(SCHEME_ARTWORK_SLUGS)('%s has every string in English and Hindi', (slug) => {
    const art = schemeArtwork(slug);
    const keys = [art?.cover.eyebrowKey, art?.cover.suffixKey, ...(art?.benefitKeys ?? [])];
    for (const locale of ['en', 'hi'] as const) {
      for (const key of keys) {
        const value = (key ?? '')
          .split('.')
          .reduce<unknown>(
            (node, part) =>
              node && typeof node === 'object'
                ? (node as Record<string, unknown>)[part]
                : undefined,
            getDictionary(locale),
          );
        expect(typeof value, `${locale}: ${key}`).toBe('string');
      }
    }
  });
});

describe('resolveSchemeImages', () => {
  const BANNER = 'bihar-post-matric-scholarship/2c1b6f5e-0d6a-4b8e-9a51-3f0f4f3c9e11.jpg';
  const LOGO = 'ayushman-bharat-pmjay/0f8fad5b-d9cb-469f-a165-70867728950e.png';

  it('shows an uploaded banner on a scheme with no bundled artwork', () => {
    const images = resolveSchemeImages({ bannerPath: BANNER }, null);
    expect(images.banner).toEqual({ src: `/scheme-logos/${BANNER}`, uploaded: true });
    expect(images.logo).toBeNull();
    expect(images.illustration).toBeNull();
  });

  it('lets an upload win kind by kind, keeping the rest of the bundled artwork', () => {
    const images = resolveSchemeImages({ logoPath: LOGO }, schemeArtwork('ayushman-bharat-pmjay'));
    expect(images.logo).toEqual({ src: `/scheme-logos/${LOGO}`, uploaded: true });
    expect(images.banner).toEqual({
      src: '/schemes/ayushman-hospital-banner.png',
      uploaded: false,
    });
  });

  /** A path that is not ours must never become an image request to somebody else's host. */
  it('ignores a malformed path instead of rendering it', () => {
    const images = resolveSchemeImages({ bannerPath: 'https://example.com/banner.jpg' }, null);
    expect(images.banner).toBeNull();
  });
});
