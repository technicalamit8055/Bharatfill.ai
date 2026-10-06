import { describe, expect, it } from 'vitest';
import {
  AUTO_FIT_MAX_SOURCE_BYTES,
  describeAutoFit,
  formatFileSize,
  planAutoFit,
  type AcceptsFile,
} from './autofit';

const KB = 1024;

/** A minimal stand-in for the box's `accept` attribute: extensions only. */
function acceptsExtensions(...extensions: string[]): AcceptsFile {
  return ({ filename }) => extensions.some((ext) => filename.toLowerCase().endsWith(ext));
}
const acceptsAnything: AcceptsFile = () => true;

describe('planAutoFit', () => {
  it('leaves a file alone when it already sits inside the window and the box accepts it', () => {
    expect(
      planAutoFit(
        { filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 35 * KB },
        { minBytes: 20 * KB, maxBytes: 50 * KB },
        acceptsExtensions('.jpg'),
      ),
    ).toEqual({ action: 'none' });
  });

  it('leaves an accepted file alone when the portal states no size at all', () => {
    expect(
      planAutoFit(
        { filename: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 3 * 1024 * KB },
        { minBytes: null, maxBytes: null },
        acceptsAnything,
      ),
    ).toEqual({ action: 'none' });
  });

  it('turns a 150 KB PNG into a 20–50 KB JPEG for a JPEG-only box (the vault photo case)', () => {
    expect(
      planAutoFit(
        { filename: 'customer-photo.png', mimeType: 'image/png', sizeBytes: 150 * KB },
        { minBytes: 20 * KB, maxBytes: 50 * KB },
        acceptsExtensions('.jpg', '.jpeg'),
      ),
    ).toEqual({
      action: 'image',
      outputMimeType: 'image/jpeg',
      filename: 'customer-photo.jpg',
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
      converted: true,
    });
  });

  it('converts a PNG even when it is inside the window, if the box will not take PNG', () => {
    const plan = planAutoFit(
      { filename: 'sign.png', mimeType: 'image/png', sizeBytes: 15 * KB },
      { minBytes: 10 * KB, maxBytes: 20 * KB },
      acceptsExtensions('.jpg'),
    );
    expect(plan).toMatchObject({ action: 'image', filename: 'sign.jpg', converted: true });
  });

  it('uses the .jpeg spelling when that is the only one the box lists', () => {
    const plan = planAutoFit(
      { filename: 'photo.webp', mimeType: 'image/webp', sizeBytes: 90 * KB },
      { maxBytes: 50 * KB },
      acceptsExtensions('.jpeg'),
    );
    expect(plan).toMatchObject({ action: 'image', filename: 'photo.jpeg' });
  });

  it('keeps a JPEG source’s own name when only its size is wrong', () => {
    const plan = planAutoFit(
      { filename: 'IMG_2041.JPG', mimeType: 'image/jpeg', sizeBytes: 11 * KB },
      { minBytes: 20 * KB, maxBytes: 50 * KB },
      acceptsExtensions('.jpg'),
    );
    expect(plan).toMatchObject({ action: 'image', filename: 'IMG_2041.JPG', converted: false });
  });

  it('compresses a 1.2 MB PDF for a 200 KB box (the Aadhaar scan case), keeping its name', () => {
    expect(
      planAutoFit(
        { filename: 'aadhaar.pdf', mimeType: 'application/pdf', sizeBytes: 1.2 * 1024 * KB },
        { maxBytes: 200 * KB },
        acceptsExtensions('.pdf'),
      ),
    ).toEqual({ action: 'pdf', filename: 'aadhaar.pdf', maxBytes: 200 * KB });
  });

  it('never turns a PDF into an image or the other way round', () => {
    expect(
      planAutoFit(
        { filename: 'aadhaar.pdf', mimeType: 'application/pdf', sizeBytes: 300 * KB },
        { maxBytes: 200 * KB },
        acceptsExtensions('.jpg'),
      ),
    ).toEqual({ action: 'cannot_fit', reason: 'type_not_accepted' });
  });

  it('refuses to pad a PDF up to a minimum', () => {
    expect(
      planAutoFit(
        { filename: 'tiny.pdf', mimeType: 'application/pdf', sizeBytes: 5 * KB },
        { minBytes: 10 * KB, maxBytes: 200 * KB },
        acceptsAnything,
      ),
    ).toEqual({ action: 'cannot_fit', reason: 'below_minimum' });
  });

  it('cannot fit an image into a box that rules JPEG out', () => {
    expect(
      planAutoFit(
        { filename: 'photo.png', mimeType: 'image/png', sizeBytes: 150 * KB },
        { maxBytes: 50 * KB },
        acceptsExtensions('.png'),
      ),
    ).toEqual({ action: 'cannot_fit', reason: 'jpeg_not_accepted' });
  });

  it('does not try to decode a type a canvas cannot read', () => {
    expect(
      planAutoFit(
        { filename: 'photo.heic', mimeType: 'image/heic', sizeBytes: 2 * 1024 * KB },
        { maxBytes: 50 * KB },
        acceptsAnything,
      ),
    ).toEqual({ action: 'cannot_fit', reason: 'unsupported_type' });
  });

  it('sends a source past the size ceiling to Document Tools Studio instead', () => {
    expect(
      planAutoFit(
        { filename: 'huge.jpg', mimeType: 'image/jpeg', sizeBytes: AUTO_FIT_MAX_SOURCE_BYTES + 1 },
        { maxBytes: 50 * KB },
        acceptsAnything,
      ),
    ).toEqual({ action: 'cannot_fit', reason: 'source_too_large' });
  });

  it('treats a zero or negative bound as unstated rather than as a real limit', () => {
    expect(
      planAutoFit(
        { filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 80 * KB },
        { minBytes: 0, maxBytes: -1 },
        acceptsAnything,
      ),
    ).toEqual({ action: 'none' });
  });
});

describe('describeAutoFit', () => {
  it('leads with rasterisation, because it is the change that can cost legibility', () => {
    const description = describeAutoFit({
      fromBytes: 1.2 * 1024 * KB,
      toBytes: 186 * KB,
      converted: false,
      scale: null,
      padded: false,
      rasterised: true,
      dpi: 100,
    });
    expect(description.headline).toBe('1.2 MB → 186 KB');
    expect(description.changes[0]).toMatch(/images at 100 DPI/);
  });

  it('names a format change, a resolution drop and padding, and nothing it did not do', () => {
    const description = describeAutoFit({
      fromBytes: 150 * KB,
      toBytes: 48 * KB,
      converted: true,
      scale: 0.7,
      padded: true,
      rasterised: false,
      dpi: null,
    });
    expect(description.changes).toEqual([
      'Converted to JPEG.',
      'Resolution reduced to 70%.',
      'Padded to reach the minimum size — the picture is unchanged.',
    ]);
  });

  it('says nothing changed beyond the size when only quality moved', () => {
    expect(
      describeAutoFit({
        fromBytes: 90 * KB,
        toBytes: 45 * KB,
        converted: false,
        scale: 1,
        padded: false,
        rasterised: false,
        dpi: null,
      }).changes,
    ).toEqual([]);
  });
});

describe('formatFileSize', () => {
  it('reads like a portal notice', () => {
    expect(formatFileSize(186 * KB)).toBe('186 KB');
    expect(formatFileSize(1.2 * 1024 * KB)).toBe('1.2 MB');
    expect(formatFileSize(10)).toBe('1 KB');
  });
});
