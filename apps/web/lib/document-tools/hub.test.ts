import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import {
  BANNER_BENEFIT_KEYS,
  DOCUMENT_TOOL_CARDS,
  HUB_COPY_KEYS,
  PDF_ACTION_KEYS,
} from './hub';

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

const ALL_KEYS = [
  ...HUB_COPY_KEYS,
  ...BANNER_BENEFIT_KEYS,
  ...PDF_ACTION_KEYS,
  ...DOCUMENT_TOOL_CARDS.flatMap((card) => [card.titleKey, card.descriptionKey, ...card.tagKeys]),
];

describe('document tools hub copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a non-empty %s string for every key', (_locale, messages) => {
    const missing = ALL_KEYS.filter((key) => {
      const value = lookup(messages, key);
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('keeps the {tool} placeholder in the open-tool label', () => {
    expect(lookup(en, 'documentTools.hub.openTool')).toContain('{tool}');
    expect(lookup(hi, 'documentTools.hub.openTool')).toContain('{tool}');
  });
});

describe('document tool cards', () => {
  it('lists each tool once, linking inside the hub', () => {
    const hrefs = DOCUMENT_TOOL_CARDS.map((card) => card.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith('/document-tools/')).toBe(true);
  });
});
