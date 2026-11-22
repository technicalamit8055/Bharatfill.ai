/**
 * Guards the public changelog: every key the page renders resolves in both catalogues, no copy
 * sits unused, releases stay newest first with real dates, and entries never interpolate.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import {
  CHANGELOG,
  CHANGELOG_AREAS,
  CHANGELOG_PLACEHOLDERS,
  CHANGELOG_TAGS,
  EMPTY_FILTER,
  buildChangelogView,
  changelogCopyKeys,
  countItems,
  facetCounts,
  filterChangelog,
  formatChangelogDate,
  highlightParts,
  parseChangelogFilter,
  serializeChangelogFilter,
} from './changelog';
import { createTranslator } from '../i18n';

const PREFIX = 'landing.changelog';

function lookup(dictionary: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );
}

describe('changelog', () => {
  it('has unique release keys, and unique item keys within each release', () => {
    const keys = CHANGELOG.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { key, items } of CHANGELOG) {
      const itemKeys = items.map((item) => item.key);
      expect(new Set(itemKeys).size, key).toBe(itemKeys.length);
      expect(items.length, key).toBeGreaterThan(0);
    }
  });

  it('uses keys that are safe as copy-path segments and URL anchors', () => {
    for (const { key, items } of CHANGELOG) {
      expect(key).toMatch(/^[a-z][a-zA-Z]*$/);
      for (const item of items) expect(item.key).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  it('lists real calendar dates, newest first', () => {
    for (const { key, date } of CHANGELOG) {
      expect(date, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), key).toBe(date);
    }
    const dates = CHANGELOG.map(({ date }) => date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('only uses known tags and areas', () => {
    for (const { items } of CHANGELOG) {
      for (const item of items) {
        expect(CHANGELOG_TAGS).toContain(item.tag);
        expect(CHANGELOG_AREAS).toContain(item.area);
      }
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s, interpolating only where expected', (_l, dictionary) => {
    for (const key of changelogCopyKeys()) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
      const names = [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(names, key).toEqual([...(CHANGELOG_PLACEHOLDERS[key] ?? [])].sort());
    }
  });

  it('leaves no copy in the catalogues that the page does not render', () => {
    const rendered = new Set(changelogCopyKeys());
    for (const dictionary of [en, hi]) {
      const leaves: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
        } else leaves.push(path);
      };
      walk(lookup(dictionary, PREFIX), PREFIX);
      expect(leaves.filter((key) => !rendered.has(key))).toEqual([]);
    }
  });

  it('formats a date as the same calendar day in both locales', () => {
    expect(formatChangelogDate('2026-11-07', 'en')).toBe('7 November 2026');
    expect(formatChangelogDate('2026-11-07', 'hi')).toMatch(/^7 \S+ 2026$/);
  });
});

describe('changelog explorer logic', () => {
  const view = buildChangelogView(createTranslator('en'), 'en');
  const total = countItems(view);

  it('shows everything with no filter', () => {
    expect(countItems(filterChangelog(view, EMPTY_FILTER))).toBe(total);
  });

  it('filters by area and tag, and drops releases left empty', () => {
    const result = filterChangelog(view, { ...EMPTY_FILTER, areas: ['citizenApp'], tags: ['new'] });
    expect(result.length).toBeGreaterThan(0);
    for (const release of result) {
      expect(release.items.length).toBeGreaterThan(0);
      for (const item of release.items) {
        expect(item.area).toBe('citizenApp');
        expect(item.tag).toBe('new');
      }
    }
  });

  it('matches item text case-insensitively, ignoring extra spaces', () => {
    const result = filterChangelog(view, { ...EMPTY_FILTER, query: '  ssc   EDUCATION ' });
    expect(result.map(({ key }) => key)).toEqual(['smartUploads']);
    expect(result[0]?.items.map(({ key }) => key)).toEqual(['sscEducation']);
  });

  it('keeps every item of a release whose title matches', () => {
    const release = view.find(({ key }) => key === 'smartUploads');
    const result = filterChangelog(view, { ...EMPTY_FILTER, query: 'smarter document uploads' });
    expect(result[0]?.items.length).toBe(release?.items.length);
  });

  it('searches Hindi copy too', () => {
    const hindi = buildChangelogView(createTranslator('hi'), 'hi');
    expect(
      countItems(filterChangelog(hindi, { ...EMPTY_FILTER, query: 'स्कैनर' })),
    ).toBeGreaterThan(0);
  });

  it('counts each facet against the query and the other facet', () => {
    const counts = facetCounts(view, { ...EMPTY_FILTER, tags: ['fixed'] });
    const fixed = filterChangelog(view, { ...EMPTY_FILTER, tags: ['fixed'] });
    expect(Object.values(counts.areas).reduce((a, b) => a + b, 0)).toBe(countItems(fixed));
    // The tag counts ignore the tag filter itself, so they still add up to everything.
    expect(Object.values(counts.tags).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('round-trips filters through the URL and drops unknown values', () => {
    const filter = {
      query: 'upload',
      areas: ['extension', 'dashboard'] as const,
      tags: ['new'] as const,
    };
    const search = serializeChangelogFilter({
      ...filter,
      areas: [...filter.areas],
      tags: [...filter.tags],
    });
    expect(search).toBe('q=upload&area=dashboard%2Cextension&tag=new');
    expect(parseChangelogFilter(new URLSearchParams(search))).toEqual({
      query: 'upload',
      areas: ['dashboard', 'extension'],
      tags: ['new'],
    });
    expect(
      parseChangelogFilter(new URLSearchParams('area=dashboard,admin,<script>&tag=secret')),
    ).toEqual({ query: '', areas: ['dashboard'], tags: [] });
    expect(serializeChangelogFilter(EMPTY_FILTER)).toBe('');
    expect(parseChangelogFilter(new URLSearchParams(`q=${'x'.repeat(500)}`)).query).toHaveLength(
      80,
    );
  });

  it('marks every occurrence of the query, keeping the original casing', () => {
    expect(highlightParts('Upload, then upload again', 'UPLOAD')).toEqual([
      { text: 'Upload', match: true },
      { text: ', then ', match: false },
      { text: 'upload', match: true },
      { text: ' again', match: false },
    ]);
    expect(highlightParts('No match here', 'scanner')).toEqual([
      { text: 'No match here', match: false },
    ]);
    expect(highlightParts('Anything', '   ')).toEqual([{ text: 'Anything', match: false }]);
  });
});
