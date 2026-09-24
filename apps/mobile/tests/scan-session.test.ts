/**
 * The scanner's session rules: page-mode parsing, native paths to URIs, and — most importantly
 * for privacy — which temporary files are deleted and which never are.
 */

import { describe, expect, it } from 'vitest';

import { isDisposableScanFile, parseScanPageMode, toFileUri } from '../lib/scan/scan-session';

describe('parseScanPageMode', () => {
  it('reads a valid mode', () => {
    expect(parseScanPageMode('single')).toBe('single');
    expect(parseScanPageMode('multi')).toBe('multi');
    expect(parseScanPageMode(['multi', 'single'])).toBe('multi');
  });

  it('falls back to a single page for anything else', () => {
    expect(parseScanPageMode(undefined)).toBe('single');
    expect(parseScanPageMode('MULTI')).toBe('single');
    expect(parseScanPageMode('photo')).toBe('single');
    expect(parseScanPageMode(3)).toBe('single');
  });
});

describe('toFileUri', () => {
  it('turns native paths into file URIs', () => {
    expect(toFileUri('/data/user/0/app/cache/VisionCamera_1.jpg')).toBe(
      'file:///data/user/0/app/cache/VisionCamera_1.jpg',
    );
  });

  it('leaves URIs alone', () => {
    expect(toFileUri('file:///data/x.jpg')).toBe('file:///data/x.jpg');
    expect(toFileUri('content://media/external/1')).toBe('content://media/external/1');
  });
});

describe('isDisposableScanFile', () => {
  const dirs = {
    cacheUri: 'file:///data/user/0/ai.bharatfill.citizen/cache/',
    tempUri: 'file:///var/mobile/Containers/Data/Application/ABC/tmp/',
  };

  it('deletes copies in the app cache (camera photos, picker copies, processed pages)', () => {
    expect(
      isDisposableScanFile(
        'file:///data/user/0/ai.bharatfill.citizen/cache/VisionCamera_1.jpg',
        dirs,
      ),
    ).toBe(true);
    expect(
      isDisposableScanFile(
        'file:///data/user/0/ai.bharatfill.citizen/cache/ImagePicker/x.png',
        dirs,
      ),
    ).toBe(true);
  });

  it('deletes camera photos in the iOS tmp folder', () => {
    expect(
      isDisposableScanFile(
        'file:///var/mobile/Containers/Data/Application/ABC/tmp/photo.jpg',
        dirs,
      ),
    ).toBe(true);
  });

  it('works without a trailing slash and without a tmp folder', () => {
    expect(
      isDisposableScanFile('file:///app/cache/scan.jpg', { cacheUri: 'file:///app/cache' }),
    ).toBe(true);
    expect(
      isDisposableScanFile('file:///app/tmp/scan.jpg', { cacheUri: 'file:///app/cache' }),
    ).toBe(false);
  });

  it('never deletes the vault, gallery photos or anything outside the app', () => {
    expect(
      isDisposableScanFile('file:///data/user/0/ai.bharatfill.citizen/files/vault/index.enc', dirs),
    ).toBe(false);
    expect(isDisposableScanFile('file:///storage/emulated/0/DCIM/Camera/IMG_1.jpg', dirs)).toBe(
      false,
    );
    expect(isDisposableScanFile('file:///data/user/0/ai.bharatfill.citizen/cache/', dirs)).toBe(
      false,
    );
    expect(
      isDisposableScanFile('file:///data/user/0/ai.bharatfill.citizen/cache-other/a.jpg', dirs),
    ).toBe(false);
  });

  it('refuses paths that climb out of the cache', () => {
    expect(
      isDisposableScanFile(
        'file:///data/user/0/ai.bharatfill.citizen/cache/../files/vault/index.enc',
        dirs,
      ),
    ).toBe(false);
  });
});
