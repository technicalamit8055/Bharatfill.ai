/**
 * The bridge to the phone's on-device models (`lib/vision/on-device-vision.ts`): what the native
 * module reports is validated, a mask outside local storage is refused, and a missing module,
 * missing Play services or a model not installed yet becomes `OnDeviceVisionUnavailableError`
 * so callers carry on without it. The native module is mocked; nothing here is a real image.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeVision = {
  isAvailable: () => boolean;
  readText: (input: { uri?: string; base64?: string }) => Promise<unknown>;
  cutOutPortrait: (uri: string) => Promise<unknown>;
};

let nativeModule: FakeVision | null = null;

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => nativeModule,
}));

const {
  cutOutPortrait,
  isOnDeviceVisionAvailable,
  NoPersonFoundError,
  OnDeviceVisionUnavailableError,
  parsePageText,
  parsePortraitCutout,
  readPageText,
} = await import('../lib/vision/on-device-vision');

const line = (text: string) => ({ text, box: [0, 0, 100, 20] });

function coded(code: string): Error {
  return Object.assign(new Error('native'), { code });
}

beforeEach(() => {
  nativeModule = null;
});

describe('parsePageText', () => {
  it('accepts both readings, or a missing one', () => {
    expect(
      parsePageText({ width: 10, height: 20, latin: [line('Roll No')], devanagari: null }),
    ).toEqual({ width: 10, height: 20, latin: [line('Roll No')], devanagari: null });
  });

  it('refuses a malformed result', () => {
    expect(() => parsePageText(null)).toThrow();
    expect(() => parsePageText({ width: 0, height: 20, latin: [], devanagari: [] })).toThrow();
    expect(() =>
      parsePageText({ width: 10, height: 20, latin: [{ text: 'x' }], devanagari: null }),
    ).toThrow();
  });
});

describe('parsePortraitCutout', () => {
  const cutout = { width: 800, height: 1000, faces: [[100, 120, 300, 380]] };

  it('turns the mask into a file URI', () => {
    expect(parsePortraitCutout({ ...cutout, maskUri: '/data/cache/mask.png' }).maskUri).toBe(
      'file:///data/cache/mask.png',
    );
  });

  it('refuses a mask outside the app', () => {
    expect(() =>
      parsePortraitCutout({ ...cutout, maskUri: 'content://somewhere/mask.png' }),
    ).toThrow();
  });
});

describe('availability', () => {
  it('is unavailable without the native module, or when it says so', () => {
    expect(isOnDeviceVisionAvailable()).toBe(false);
    nativeModule = {
      isAvailable: () => false,
      readText: vi.fn(),
      cutOutPortrait: vi.fn(),
    };
    expect(isOnDeviceVisionAvailable()).toBe(false);
  });

  it('rejects calls with OnDeviceVisionUnavailableError when unavailable', async () => {
    await expect(readPageText({ uri: 'file:///cache/page.jpg' })).rejects.toBeInstanceOf(
      OnDeviceVisionUnavailableError,
    );
    await expect(cutOutPortrait('file:///cache/photo.jpg')).rejects.toBeInstanceOf(
      OnDeviceVisionUnavailableError,
    );
  });
});

describe('calls', () => {
  it('reads a decrypted page from memory, never a file', async () => {
    const readText = vi.fn(async () => ({ width: 1, height: 1, latin: [], devanagari: [] }));
    nativeModule = { isAvailable: () => true, readText, cutOutPortrait: vi.fn() };
    await readPageText({ base64: 'AAAA' });
    expect(readText).toHaveBeenCalledWith({ base64: 'AAAA' });
  });

  it('maps native error codes to the errors callers handle', async () => {
    nativeModule = {
      isAvailable: () => true,
      readText: async () => {
        throw coded('ERR_VISION_UNAVAILABLE');
      },
      cutOutPortrait: async () => {
        throw coded('ERR_VISION_NO_PERSON');
      },
    };
    await expect(readPageText({ uri: 'file:///cache/a.jpg' })).rejects.toBeInstanceOf(
      OnDeviceVisionUnavailableError,
    );
    await expect(cutOutPortrait('file:///cache/a.jpg')).rejects.toBeInstanceOf(NoPersonFoundError);
  });

  it('passes other failures through', async () => {
    nativeModule = {
      isAvailable: () => true,
      readText: async () => {
        throw coded('ERR_VISION_READ');
      },
      cutOutPortrait: vi.fn(),
    };
    await expect(readPageText({ uri: 'file:///cache/a.jpg' })).rejects.toThrow('native');
  });
});
