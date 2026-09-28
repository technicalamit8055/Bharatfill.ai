import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOOL_PREFERENCES, type ToolPreferences } from '@assistigo/document-tools';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { readToolPreferences, writeToolPreferences } from './preferences';

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('SecurityError');
  };
  return { ...memoryStorage(), getItem: fail, setItem: fail };
}

const custom: ToolPreferences = {
  grid: { sheetCode: 'a4', photoSize: 'stamp', count: 16, cutMarks: false, dpi: 450 },
  card: { copies: 1 },
  pdf: { allowRasterise: false },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document-tool preferences storage', () => {
  it('starts from the built-in defaults when nothing is saved', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    expect(readToolPreferences()).toEqual(DEFAULT_TOOL_PREFERENCES);
  });

  it('reads back what was written', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    expect(writeToolPreferences(custom)).toBe(true);
    expect(readToolPreferences()).toEqual(custom);
  });

  it('survives a corrupt stored value', () => {
    const storage = memoryStorage();
    storage.setItem('assistigo.documentTools.preferences.v1', '{not json');
    vi.stubGlobal('window', { localStorage: storage });
    expect(readToolPreferences()).toEqual(DEFAULT_TOOL_PREFERENCES);
  });

  it('falls back instead of throwing when the browser blocks storage', () => {
    vi.stubGlobal('window', { localStorage: throwingStorage() });
    expect(readToolPreferences()).toEqual(DEFAULT_TOOL_PREFERENCES);
    expect(writeToolPreferences(custom)).toBe(false);
  });
});

const PAGE_KEYS = [
  'navLabel',
  'title',
  'subtitle',
  'languageHint',
  'gridTitle',
  'gridHint',
  'gridCountHint',
  'cardTitle',
  'pdfTitle',
  'storageNote',
  'saved',
  'saveFailed',
  'reset',
] as const;

describe('My preferences copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a non-empty %s string for every key', (_locale, messages) => {
    const section = messages.settings.preferences as Record<string, unknown>;
    const missing = PAGE_KEYS.filter((key) => {
      const value = section[key];
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });
});
