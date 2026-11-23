/**
 * The bridge to the on-phone PDF renderer (`lib/scan/pdf-pages.ts`): what the native module
 * reports is validated, its error codes become typed errors (so Upload can ask for a password,
 * or explain that this phone cannot open locked PDFs), the password is passed through only when
 * one was typed, and page counts stay within the session's limit. The native module is mocked;
 * the files are fake URIs and the password is made up.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakePdfPages = {
  supportsPasswords: () => boolean;
  render: (uri: string, password: string | null, maxPages: number) => Promise<unknown>;
};

let nativeModule: FakePdfPages | null = null;
const requested: string[] = [];

vi.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => {
    requested.push(name);
    return nativeModule;
  },
}));

const {
  isPdfImportAvailable,
  parseRenderedPdf,
  PDF_PAGES_MODULE,
  PdfImportUnavailableError,
  PdfLockedError,
  PdfLockedUnsupportedError,
  PdfUnreadableError,
  renderPdfPages,
  supportsPdfPasswords,
} = await import('../lib/scan/pdf-pages');
const { MULTI_PAGE_LIMIT } = await import('../lib/scan/scan-session');

const page = (uri: string) => ({ uri, width: 1654, height: 2339 });
const coded = (code: string) => Object.assign(new Error('native'), { code });

beforeEach(() => {
  nativeModule = null;
  requested.length = 0;
});

describe('parseRenderedPdf', () => {
  it('returns the pages as file URIs with the PDF page count', () => {
    expect(
      parseRenderedPdf({
        pageCount: 3,
        pages: [page('file:///data/cache/pdf-import/1.jpg'), page('/data/cache/pdf-import/2.jpg')],
      }),
    ).toEqual({
      pageCount: 3,
      pages: [
        page('file:///data/cache/pdf-import/1.jpg'),
        page('file:///data/cache/pdf-import/2.jpg'),
      ],
    });
  });

  it('refuses a malformed result', () => {
    expect(() => parseRenderedPdf(null)).toThrow();
    expect(() => parseRenderedPdf({ pageCount: 1, pages: [] })).toThrow();
    expect(() => parseRenderedPdf({ pageCount: 0, pages: [page('file:///c/1.jpg')] })).toThrow();
    expect(() =>
      parseRenderedPdf({ pageCount: 1, pages: [page('file:///c/1.jpg'), page('file:///c/2.jpg')] }),
    ).toThrow();
  });

  it('refuses a page outside local storage', () => {
    expect(() =>
      parseRenderedPdf({ pageCount: 1, pages: [page('content://media/external/1')] }),
    ).toThrow();
  });
});

describe('availability', () => {
  it('is off without the native module (iOS, or an older build)', () => {
    expect(isPdfImportAvailable()).toBe(false);
    expect(supportsPdfPasswords()).toBe(false);
    expect(requested).toContain(PDF_PAGES_MODULE);
  });

  it('reports whether locked PDFs can be opened, and survives the module throwing', () => {
    nativeModule = { supportsPasswords: () => true, render: vi.fn() };
    expect(isPdfImportAvailable()).toBe(true);
    expect(supportsPdfPasswords()).toBe(true);

    nativeModule = {
      supportsPasswords: () => {
        throw new Error('boom');
      },
      render: vi.fn(),
    };
    expect(supportsPdfPasswords()).toBe(false);
  });
});

describe('renderPdfPages', () => {
  it('throws PdfImportUnavailableError without the native module', async () => {
    await expect(renderPdfPages('file:///c/a.pdf', { maxPages: 1 })).rejects.toBeInstanceOf(
      PdfImportUnavailableError,
    );
  });

  it('passes the password only when one was typed', async () => {
    const render = vi.fn(async (_uri: string, _password: string | null, _maxPages: number) => ({
      pageCount: 1,
      pages: [page('file:///c/1.jpg')],
    }));
    nativeModule = { supportsPasswords: () => true, render };

    await renderPdfPages('file:///c/a.pdf', { maxPages: 4 });
    await renderPdfPages('file:///c/a.pdf', { maxPages: 4, password: '' });
    await renderPdfPages('file:///c/a.pdf', { maxPages: 4, password: 'TEST1990' });
    expect(render.mock.calls).toEqual([
      ['file:///c/a.pdf', null, 4],
      ['file:///c/a.pdf', null, 4],
      ['file:///c/a.pdf', 'TEST1990', 4],
    ]);
  });

  it('keeps the page count between one and the session limit', async () => {
    const render = vi.fn(async (_uri: string, _password: string | null, _maxPages: number) => ({
      pageCount: 1,
      pages: [page('file:///c/1.jpg')],
    }));
    nativeModule = { supportsPasswords: () => true, render };

    await renderPdfPages('file:///c/a.pdf', { maxPages: 0 });
    await renderPdfPages('file:///c/a.pdf', { maxPages: 500 });
    await renderPdfPages('file:///c/a.pdf', { maxPages: 2.7 });
    expect(render.mock.calls.map((call) => call[2])).toEqual([1, MULTI_PAGE_LIMIT, 2]);
  });

  it.each([
    ['ERR_PDF_LOCKED', PdfLockedError],
    ['ERR_PDF_LOCKED_UNSUPPORTED', PdfLockedUnsupportedError],
    ['ERR_PDF_READ', PdfUnreadableError],
    ['SOMETHING_ELSE', PdfUnreadableError],
  ])('turns %s into its typed error', async (code, ErrorType) => {
    nativeModule = {
      supportsPasswords: () => true,
      render: async () => {
        throw coded(code);
      },
    };
    await expect(renderPdfPages('file:///c/a.pdf', { maxPages: 1 })).rejects.toBeInstanceOf(
      ErrorType,
    );
  });

  it('never puts the password in an error', async () => {
    nativeModule = {
      supportsPasswords: () => true,
      render: async () => {
        throw coded('ERR_PDF_LOCKED');
      },
    };
    const error = await renderPdfPages('file:///c/a.pdf', {
      maxPages: 1,
      password: 'TEST1990',
    }).catch((caught: unknown) => caught);
    expect(String((error as Error).message)).not.toContain('TEST1990');
    expect(JSON.stringify(error)).not.toContain('TEST1990');
  });
});
