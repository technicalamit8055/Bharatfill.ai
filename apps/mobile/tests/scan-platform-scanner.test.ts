/**
 * The bridge to Google's document scanner (`lib/scan/platform-scanner.ts`): what the native
 * module reports is validated, a cancelled scan is null, an unavailable scanner becomes
 * `PlatformScannerUnavailableError` (so the route falls back to the in-app camera), and page
 * counts stay within the scan's room. The native module is mocked; the pages are fake URIs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeScanner = {
  isAvailable: () => boolean;
  scan: (options: { maxPages: number; allowGalleryImport: boolean }) => Promise<unknown>;
};

let nativeModule: FakeScanner | null = null;
const requested: string[] = [];

vi.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => {
    requested.push(name);
    return nativeModule;
  },
}));

const {
  chooseScanEngine,
  isPlatformScannerAvailable,
  parsePlatformScan,
  PLATFORM_SCANNER_MODULE,
  PlatformScannerUnavailableError,
  platformPageRoom,
  scanWithPlatformML,
} = await import('../lib/scan/platform-scanner');
const { MULTI_PAGE_LIMIT } = await import('../lib/scan/scan-session');

const page = (uri: string) => ({ uri, width: 2480, height: 3508 });

beforeEach(() => {
  nativeModule = null;
  requested.length = 0;
});

describe('parsePlatformScan', () => {
  it('returns the pages as file URIs', () => {
    expect(
      parsePlatformScan({
        canceled: false,
        pages: [page('file:///data/cache/1.jpg'), page('/data/cache/2.jpg')],
      }),
    ).toEqual([page('file:///data/cache/1.jpg'), page('file:///data/cache/2.jpg')]);
  });

  it('is null when the scan was cancelled or came back empty', () => {
    expect(parsePlatformScan({ canceled: true, pages: [] })).toBeNull();
    expect(parsePlatformScan({ canceled: false, pages: [] })).toBeNull();
  });

  it('refuses a malformed result', () => {
    expect(() => parsePlatformScan(null)).toThrow();
    expect(() => parsePlatformScan({ canceled: false })).toThrow();
    expect(() =>
      parsePlatformScan({
        canceled: false,
        pages: [{ uri: 'file:///a.jpg', width: 0, height: 9 }],
      }),
    ).toThrow();
  });

  it('refuses a page outside local storage', () => {
    expect(() =>
      parsePlatformScan({ canceled: false, pages: [page('content://media/external/1')] }),
    ).toThrow();
  });
});

describe('platformPageRoom', () => {
  it('allows one page for a retake', () => {
    expect(platformPageRoom({ retaking: true, pageCount: 5, pageLimit: MULTI_PAGE_LIMIT })).toBe(1);
  });

  it('allows the room left under the limit', () => {
    expect(platformPageRoom({ retaking: false, pageCount: 0, pageLimit: MULTI_PAGE_LIMIT })).toBe(
      MULTI_PAGE_LIMIT,
    );
    expect(platformPageRoom({ retaking: false, pageCount: 20, pageLimit: MULTI_PAGE_LIMIT })).toBe(
      4,
    );
    expect(
      platformPageRoom({
        retaking: false,
        pageCount: MULTI_PAGE_LIMIT,
        pageLimit: MULTI_PAGE_LIMIT,
      }),
    ).toBe(0);
  });

  it('never exceeds the multi-page limit', () => {
    expect(platformPageRoom({ retaking: false, pageCount: 0, pageLimit: 100 })).toBe(
      MULTI_PAGE_LIMIT,
    );
  });
});

describe('chooseScanEngine', () => {
  it("uses Google's scanner for pages, cards and signatures when the phone has it", () => {
    for (const preset of ['document', 'id_card', 'signature'] as const) {
      expect(chooseScanEngine(preset, true)).toBe('platform');
      expect(chooseScanEngine(preset, false)).toBe('in-app');
    }
  });

  it('never scans a passport photo as a page', () => {
    expect(chooseScanEngine('photo', true)).toBe('photo');
    expect(chooseScanEngine('photo', false)).toBe('photo');
  });
});

describe('isPlatformScannerAvailable', () => {
  it('is false without the native module (iOS, a build without it)', () => {
    expect(isPlatformScannerAvailable()).toBe(false);
    expect(requested).toEqual([PLATFORM_SCANNER_MODULE]);
  });

  it('asks the native module, and treats a throw as unavailable', () => {
    nativeModule = { isAvailable: () => true, scan: vi.fn() };
    expect(isPlatformScannerAvailable()).toBe(true);
    nativeModule = {
      isAvailable: () => {
        throw new Error('boom');
      },
      scan: vi.fn(),
    };
    expect(isPlatformScannerAvailable()).toBe(false);
  });
});

describe('scanWithPlatformML', () => {
  it('rejects as unavailable without the native module', async () => {
    await expect(scanWithPlatformML()).rejects.toBeInstanceOf(PlatformScannerUnavailableError);
  });

  it('passes clamped options and returns the pages', async () => {
    const scan = vi.fn().mockResolvedValue({ canceled: false, pages: [page('/cache/1.jpg')] });
    nativeModule = { isAvailable: () => true, scan };

    await expect(scanWithPlatformML({ maxPages: 99, allowGalleryImport: true })).resolves.toEqual([
      page('file:///cache/1.jpg'),
    ]);
    expect(scan).toHaveBeenLastCalledWith({ maxPages: MULTI_PAGE_LIMIT, allowGalleryImport: true });

    await scanWithPlatformML({ maxPages: 0 });
    expect(scan).toHaveBeenLastCalledWith({ maxPages: 1, allowGalleryImport: false });
  });

  it('resolves null when the citizen backs out', async () => {
    nativeModule = {
      isAvailable: () => true,
      scan: vi.fn().mockResolvedValue({ canceled: true, pages: [] }),
    };
    await expect(scanWithPlatformML()).resolves.toBeNull();
  });

  it('turns the native unavailable code into PlatformScannerUnavailableError', async () => {
    nativeModule = {
      isAvailable: () => true,
      scan: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { code: 'ERR_SCANNER_UNAVAILABLE' })),
    };
    await expect(scanWithPlatformML()).rejects.toBeInstanceOf(PlatformScannerUnavailableError);
  });

  it('passes other failures through, for the route to report', async () => {
    const failure = Object.assign(new Error('x'), { code: 'ERR_SCAN_READ' });
    nativeModule = { isAvailable: () => true, scan: vi.fn().mockRejectedValue(failure) };
    await expect(scanWithPlatformML()).rejects.toBe(failure);
  });
});
