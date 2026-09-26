/**
 * The capture session's page editing: Retake replaces a page in place, filter changes reuse the
 * filter previews while crop and rotation changes redo them, and every temporary file a page
 * drops is handed back for deletion. OpenCV, the vault and `expo-crypto` are mocked; the photos
 * are fake file URIs, not real documents.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Quad } from '../lib/scan/geometry';

const discarded: string[] = [];
let renders = 0;

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
  analysePhoto: async () => ({
    size: { width: 100, height: 140 },
    detected: true,
    quad: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 140 },
      { x: 0, y: 140 },
    ],
  }),
  renderPage: async (
    _photo: string,
    _quad: unknown,
    filter: string,
    options: { rotation?: number; previews?: boolean } = {},
  ) => {
    renders += 1;
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

beforeEach(() => {
  session.discardSession();
  discarded.length = 0;
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
