/**
 * The capture session's page editing: Retake replaces a page in place, filter changes reuse the
 * filter previews while crop and rotation changes redo them, and every temporary file a page
 * drops is handed back for deletion. OpenCV, the vault and `expo-crypto` are mocked; the photos
 * are fake file URIs, not real documents.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionPage } from '../lib/scan/capture-session';
import type { Quad } from '../lib/scan/geometry';

const discarded: string[] = [];
let renders = 0;
/** What the mocked quality check reports for the next photos analysed. */
let nextIssues: readonly string[] | null = null;
/** The sides handed to the mocked ID-card layout, per save; and whether it should fail. */
const composed: string[][] = [];
let composeFails = false;
const renderedPresets: string[] = [];
/** Per photo analysed, whether the page was searched for (`findPage`). */
const searchedForPage: boolean[] = [];

vi.mock('expo-crypto', () => {
  let next = 0;
  return {
    randomUUID: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
  };
});

vi.mock('../lib/vault/vault-storage', () => ({
  discardIncoming: (uris: readonly string[]) => discarded.push(...uris),
  saveDocument: vi.fn(),
}));

vi.mock('../lib/scan/document-vision', () => ({
  composeIdCardSheet: async (sides: readonly { uri: string }[]) => {
    if (composeFails) throw new Error('compose failed');
    composed.push(sides.map((side) => side.uri));
    return { uri: 'file:///cache/sheet.jpg', width: 2480, height: 3508 };
  },
  analysePhoto: async (_uri: string, options: { findPage?: boolean } = {}) => {
    searchedForPage.push(options.findPage ?? true);
    return {
      quality: nextIssues
        ? { sharpness: 0.1, sharpnessJudged: true, paperLevel: 200, glare: 0, issues: nextIssues }
        : null,
      size: { width: 100, height: 140 },
      detected: true,
      quad: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 140 },
        { x: 0, y: 140 },
      ],
    };
  },
  renderPage: async (
    _photo: string,
    _quad: unknown,
    filter: string,
    options: { rotation?: number; previews?: boolean; preset?: string } = {},
  ) => {
    renders += 1;
    renderedPresets.push(options.preset ?? 'document');
    const n = renders;
    return {
      uri: `file:///cache/page-${n}-${filter}.jpg`,
      width: 100,
      height: 140,
      ...(options.previews
        ? {
            previews: {
              magic: `file:///cache/preview-${n}-magic.jpg`,
              original: `file:///cache/preview-${n}-original.jpg`,
              grayscale: `file:///cache/preview-${n}-grayscale.jpg`,
              blackWhite: `file:///cache/preview-${n}-blackWhite.jpg`,
            },
          }
        : {}),
    };
  },
}));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const session = await import('../lib/scan/capture-session');
const { MULTI_PAGE_LIMIT } = await import('../lib/scan/scan-session');

async function settle(): Promise<void> {
  for (const page of session.getSession().pages) await session.processPage(page.id);
}

const vault = await import('../lib/vault/vault-storage');

beforeEach(() => {
  session.discardSession();
  discarded.length = 0;
  composed.length = 0;
  renderedPresets.length = 0;
  searchedForPage.length = 0;
  composeFails = false;
  nextIssues = null;
  vi.mocked(vault.saveDocument).mockReset();
  vi.mocked(vault.saveDocument).mockResolvedValue('saved-id');
});

describe('platform scanner pages', () => {
  it('are not searched for a page again and start on the Original filter', async () => {
    session.addPhotos(['file:///cache/cam.jpg'], 'camera');
    session.addPhotos(['file:///cache/ml-1.jpg', 'file:///cache/ml-2.jpg'], 'platform');
    await settle();

    const pages = session.getSession().pages;
    expect(searchedForPage).toEqual([true, false, false]);
    expect(pages.map((page) => [page.source, page.filter])).toEqual([
      ['camera', 'magic'],
      ['platform', 'original'],
      ['platform', 'original'],
    ]);
    expect(pages.every((page) => page.status === 'ready')).toBe(true);
  });

  it('keep the filter the citizen picks', async () => {
    const [id] = session.addPhotos(['file:///cache/ml.jpg'], 'platform');
    await settle();
    session.setPageFilter(id as string, 'grayscale');
    await settle();
    expect(session.getSession().pages[0]?.filter).toBe('grayscale');
  });

  it('replace a page on retake, moving it to Original', async () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    session.startRetake(id as string);
    session.addPhotos(['file:///cache/ml.jpg'], 'platform');
    await settle();
    expect(session.getSession().pages[0]).toMatchObject({
      id,
      source: 'platform',
      filter: 'original',
      photoUri: 'file:///cache/ml.jpg',
    });
    expect(searchedForPage).toEqual([true, false]);
    expect(discarded).toContain('file:///cache/a.jpg');
  });

  it('save as a scanner document', async () => {
    session.addPhotos(['file:///cache/ml.jpg'], 'platform');
    await session.saveSession();
    expect(vi.mocked(vault.saveDocument).mock.calls[0]?.[1]).toBe('scanner');
  });
});

describe('retake', () => {
  it('replaces the marked page in place, keeping its filter', async () => {
    const [first, second, third] = session.addPhotos(
      ['file:///cache/a.jpg', 'file:///cache/b.jpg', 'file:///cache/c.jpg'],
      'camera',
    );
    await settle();
    session.setPageFilter(second as string, 'grayscale');
    session.rotatePage(second as string);
    await settle();

    session.startRetake(second as string);
    expect(session.getSession().retakeId).toBe(second);

    const replaced = session.addPhotos(['file:///cache/b2.jpg'], 'camera');
    expect(replaced).toEqual([second]);

    const { pages, retakeId } = session.getSession();
    expect(retakeId).toBeNull();
    expect(pages.map((page) => page.id)).toEqual([first, second, third]);
    expect(pages[1]).toMatchObject({
      photoUri: 'file:///cache/b2.jpg',
      filter: 'grayscale',
      rotation: 0,
      rendered: null,
      previews: null,
    });
    // The old photo, its processed page and its previews all go.
    expect(discarded).toContain('file:///cache/b.jpg');
    expect(discarded.filter((uri) => uri.includes('preview-')).length).toBeGreaterThan(0);

    await settle();
    expect(session.getSession().pages[1]?.status).toBe('ready');
  });

  it('takes only one photo and drops the rest', () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    session.startRetake(id as string);
    session.addPhotos(['file:///cache/x.jpg', 'file:///cache/y.jpg'], 'gallery');
    expect(session.getSession().pages).toHaveLength(1);
    expect(discarded).toContain('file:///cache/y.jpg');
  });

  it('lets a retake through at the page limit, since nothing is added', () => {
    const uris = Array.from({ length: MULTI_PAGE_LIMIT }, (_, i) => `file:///cache/${i}.jpg`);
    const ids = session.addPhotos(uris, 'camera');
    expect(session.canAddPages()).toBe(false);
    session.startRetake(ids[3] as string);
    expect(session.canAddPages()).toBe(true);
    expect(session.canAddPages(2)).toBe(false);
  });

  it('adds normally again once a retake is cancelled or its page deleted', () => {
    const [a, b] = session.addPhotos(['file:///cache/a.jpg', 'file:///cache/b.jpg'], 'camera');
    session.startRetake(a as string);
    session.cancelRetake();
    session.addPhotos(['file:///cache/c.jpg'], 'camera');
    expect(session.getSession().pages).toHaveLength(3);

    session.startRetake(b as string);
    session.removePage(b as string);
    expect(session.getSession().retakeId).toBeNull();
  });

  it('ignores a retake of a page that does not exist', () => {
    session.startRetake('00000000-0000-4000-8000-999999999999');
    expect(session.getSession().retakeId).toBeNull();
  });
});

describe('filter previews', () => {
  it('are kept when only the filter changes, and redone on rotation', async () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    const firstPreviews = session.getSession().pages[0]?.previews;
    expect(firstPreviews).not.toBeNull();

    session.setPageFilter(id as string, 'blackWhite');
    await settle();
    expect(session.getSession().pages[0]?.previews).toBe(firstPreviews);

    session.rotatePage(id as string);
    await settle();
    const page = session.getSession().pages[0];
    expect(page?.rotation).toBe(90);
    expect(page?.previews).not.toBe(firstPreviews);
    expect(discarded).toEqual(expect.arrayContaining(Object.values(firstPreviews ?? {})));
  });

  it('are deleted with their page and with the session', async () => {
    const [a] = session.addPhotos(['file:///cache/a.jpg', 'file:///cache/b.jpg'], 'camera');
    await settle();
    const previews = Object.values(session.getSession().pages[0]?.previews ?? {});
    session.removePage(a as string);
    expect(discarded).toEqual(expect.arrayContaining(previews));

    const rest = Object.values(session.getSession().pages[0]?.previews ?? {});
    session.discardSession();
    expect(discarded).toEqual(expect.arrayContaining(rest));
  });
});

describe('crop editor result', () => {
  const tilted: Quad = [
    { x: 10, y: 12 },
    { x: 90, y: 8 },
    { x: 94, y: 130 },
    { x: 6, y: 134 },
  ];

  it('applies corners, quarter turns and straightening in one processing pass', async () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    const before = renders;

    session.setPageCrop(id as string, { quad: tilted, rotation: 270, straighten: -4.5 });
    expect(session.getSession().pages[0]?.status).toBe('pending');
    await settle();

    expect(renders).toBe(before + 1);
    expect(session.getSession().pages[0]).toMatchObject({
      quad: tilted,
      rotation: 270,
      straighten: -4.5,
      status: 'ready',
    });
  });

  it('redoes nothing when Done changed nothing', async () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    const page = session.getSession().pages[0];
    const before = renders;

    // Equal but not the same object: the editor rebuilds the quad.
    const same = (page?.quad ?? tilted).map((p) => ({ ...p })) as unknown as Quad;
    session.setPageCrop(id as string, { quad: same, rotation: 0, straighten: 0 });
    await settle();
    expect(renders).toBe(before);
    expect(session.getSession().pages[0]?.revision).toBe(page?.revision);
  });

  it('starts a retaken page upright and unstraightened', async () => {
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    session.setPageCrop(id as string, { quad: tilted, rotation: 90, straighten: 12 });
    session.startRetake(id as string);
    session.addPhotos(['file:///cache/a2.jpg'], 'camera');
    expect(session.getSession().pages[0]).toMatchObject({
      rotation: 0,
      straighten: 0,
      quad: null,
    });
  });
});

describe('presets', () => {
  it('starts an ordinary document session', () => {
    expect(session.getSession().preset).toBe('document');
  });

  it('starting a session for a preset throws away the one in progress', () => {
    session.addPhotos(['file:///cache/a.jpg'], 'camera');
    session.startSession('id_card');
    expect(session.getSession()).toMatchObject({ pages: [], retakeId: null, preset: 'id_card' });
    expect(discarded).toContain('file:///cache/a.jpg');
  });

  it('takes a front and a back for an ID card, and no more', () => {
    session.startSession('id_card');
    const ids = session.addPhotos(
      ['file:///cache/front.jpg', 'file:///cache/back.jpg', 'file:///cache/extra.jpg'],
      'gallery',
    );
    expect(ids).toHaveLength(2);
    expect(discarded).toContain('file:///cache/extra.jpg');
    expect(session.canAddPages()).toBe(false);

    // A retake still fits: it replaces a side.
    session.startRetake(ids[1] as string);
    expect(session.canAddPages()).toBe(true);
    expect(session.addPhotos(['file:///cache/back2.jpg'], 'camera')).toEqual([ids[1]]);
  });

  it('takes one photo for a passport photo or a signature', () => {
    for (const preset of ['photo', 'signature'] as const) {
      session.startSession(preset);
      expect(
        session.addPhotos(['file:///cache/a.jpg', 'file:///cache/b.jpg'], 'gallery'),
      ).toHaveLength(1);
      expect(session.canAddPages()).toBe(false);
    }
  });

  it('starts each preset on its own filter, and processes pages for it', async () => {
    session.startSession('photo');
    session.addPhotos(['file:///cache/face.jpg'], 'camera');
    expect(session.getSession().pages[0]?.filter).toBe('original');
    await settle();
    expect(renderedPresets).toEqual(['photo']);

    session.startSession('signature');
    session.addPhotos(['file:///cache/sign.jpg'], 'camera');
    expect(session.getSession().pages[0]?.filter).toBe('magic');
  });

  it('goes back to an ordinary document once the session is discarded', () => {
    session.startSession('signature');
    session.discardSession();
    expect(session.getSession().preset).toBe('document');
  });
});

describe('photo quality', () => {
  it('reports what the check found, until the warning is dismissed', async () => {
    nextIssues = ['blurry'];
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    const page = () => session.getSession().pages[0] as SessionPage;
    expect(session.pageQualityIssues(page())).toEqual(['blurry']);

    session.dismissQualityWarning(id as string);
    expect(session.pageQualityIssues(page())).toEqual([]);
    // Dismissing changes nothing about the page itself.
    expect(page().status).toBe('ready');
  });

  it('has nothing to report before the photo is measured, or for a good photo', async () => {
    session.addPhotos(['file:///cache/a.jpg'], 'camera');
    expect(session.pageQualityIssues(session.getSession().pages[0] as SessionPage)).toEqual([]);
    await settle();
    expect(session.pageQualityIssues(session.getSession().pages[0] as SessionPage)).toEqual([]);
  });

  it('does not judge a passport photo for blur, only for light', async () => {
    session.startSession('photo');
    nextIssues = ['blurry', 'glare'];
    session.addPhotos(['file:///cache/face.jpg'], 'camera');
    await settle();
    expect(session.pageQualityIssues(session.getSession().pages[0] as SessionPage)).toEqual([
      'glare',
    ]);
  });

  it('shows the warning again for a retaken photo', async () => {
    nextIssues = ['dark'];
    const [id] = session.addPhotos(['file:///cache/a.jpg'], 'camera');
    await settle();
    session.dismissQualityWarning(id as string);
    session.startRetake(id as string);
    session.addPhotos(['file:///cache/a2.jpg'], 'camera');
    await settle();
    expect(session.pageQualityIssues(session.getSession().pages[0] as SessionPage)).toEqual([
      'dark',
    ]);
  });
});

describe('saving an ID card', () => {
  async function scanCard(): Promise<void> {
    session.startSession('id_card');
    session.addPhotos(['file:///cache/front.jpg', 'file:///cache/back.jpg'], 'camera');
    await settle();
  }

  it('lays both sides on one page, saves that page and deletes the sheet', async () => {
    await scanCard();
    const sides = session.getSession().pages.map((page) => page.rendered?.uri);
    await session.saveSession({ title: 'Card' });

    expect(composed).toEqual([sides]);
    expect(vault.saveDocument).toHaveBeenCalledWith(
      [{ uri: 'file:///cache/sheet.jpg', mimeType: 'image/jpeg' }],
      'scanner',
      { title: 'Card' },
    );
    expect(discarded).toContain('file:///cache/sheet.jpg');
    expect(session.getSession()).toMatchObject({ pages: [], preset: 'document' });
  });

  it('saves the sides as they are when the sheet cannot be drawn', async () => {
    await scanCard();
    composeFails = true;
    const sides = session.getSession().pages.map((page) => page.rendered?.uri);
    await session.saveSession();
    expect(vault.saveDocument).toHaveBeenCalledWith(
      sides.map((uri) => ({ uri, mimeType: 'image/jpeg' })),
      'scanner',
      {},
    );
  });

  it('still deletes the sheet when sealing fails', async () => {
    await scanCard();
    vi.mocked(vault.saveDocument).mockRejectedValueOnce(new Error('disk full'));
    await expect(session.saveSession()).rejects.toThrow('disk full');
    expect(discarded).toContain('file:///cache/sheet.jpg');
    // The scan is kept, so the citizen can try again.
    expect(session.getSession().pages).toHaveLength(2);
  });

  it('saves an ordinary document page by page, with no sheet', async () => {
    session.addPhotos(['file:///cache/a.jpg', 'file:///cache/b.jpg'], 'camera');
    await settle();
    await session.saveSession();
    expect(composed).toEqual([]);
    expect(vi.mocked(vault.saveDocument).mock.calls[0]?.[0]).toHaveLength(2);
  });
});
