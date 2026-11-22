import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { safeNext } from '../auth/redirects';
import { DOCUMENT_TOOL_CARDS } from './hub';
import { PDF_BUNDLE_HREF } from './pdf-bundle';
import {
  PUBLIC_TOOLS,
  PUBLIC_TOOLS_COPY_KEYS,
  PUBLIC_TOOLS_HREF,
  PUBLIC_TOOL_COPY_FIELDS,
  accountFeatureHref,
  looksSignedIn,
  publicTool,
  publicToolCopyKey,
} from './public-tools';

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
  ...PUBLIC_TOOLS_COPY_KEYS,
  ...PUBLIC_TOOLS.flatMap((tool) =>
    PUBLIC_TOOL_COPY_FIELDS.map((field) => publicToolCopyKey(tool.id, field)),
  ),
];

describe('public document tools catalogue', () => {
  it('gives every dashboard tool exactly one public page', () => {
    expect(PUBLIC_TOOLS.map((tool) => tool.id)).toEqual(DOCUMENT_TOOL_CARDS.map((card) => card.id));
    const slugs = PUBLIC_TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps public pages under /tools with search-friendly slugs, and app links in the dashboard', () => {
    for (const tool of PUBLIC_TOOLS) {
      expect(tool.slug).toMatch(/^[a-z]+(-[a-z]+)+$/);
      expect(tool.href).toBe(`${PUBLIC_TOOLS_HREF}/${tool.slug}`);
      expect(tool.appHref.startsWith('/document-tools/')).toBe(true);
    }
    expect(publicTool('pdfStudio').appHref).toBe('/document-tools/pdf-studio');
  });

  it('never offers the PDF bundle publicly — it reads stored customer documents', () => {
    expect(PUBLIC_TOOLS.some((tool) => tool.appHref === PDF_BUNDLE_HREF)).toBe(false);
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a non-empty %s string for every key a public page reads', (_locale, messages) => {
    const missing = ALL_KEYS.filter((key) => {
      const value = lookup(messages, key);
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('keeps search titles and descriptions to a length a results page shows', () => {
    for (const messages of [en, hi]) {
      for (const tool of PUBLIC_TOOLS) {
        const title = lookup(messages, publicToolCopyKey(tool.id, 'metaTitle'));
        const description = lookup(messages, publicToolCopyKey(tool.id, 'metaDescription'));
        expect(String(title).length).toBeLessThanOrEqual(70);
        expect(String(description).length).toBeLessThanOrEqual(170);
      }
    }
  });
});

describe('accountFeatureHref', () => {
  it('sends a guest to sign-in with a same-origin return path', () => {
    const href = accountFeatureHref('/document-tools/pdf-bundle', false);
    const url = new URL(href, 'https://example.test');
    expect(url.pathname).toBe('/sign-in');
    const next = url.searchParams.get('next');
    expect(next).toBe('/document-tools/pdf-bundle');
    expect(safeNext(next)).toBe('/document-tools/pdf-bundle');
  });

  it('sends someone who looks signed in straight to the dashboard tool', () => {
    expect(accountFeatureHref('/document-tools/photo-signature', true)).toBe(
      '/document-tools/photo-signature',
    );
  });
});

describe('looksSignedIn', () => {
  it('recognises the Supabase session cookie, whole or chunked', () => {
    expect(looksSignedIn(['assistigo_locale', 'sb-abcdefgh-auth-token'])).toBe(true);
    expect(looksSignedIn(['sb-127-auth-token.0', 'sb-127-auth-token.1'])).toBe(true);
  });

  it('ignores every other cookie, including the PKCE verifier', () => {
    expect(looksSignedIn([])).toBe(false);
    expect(looksSignedIn(['assistigo_locale'])).toBe(false);
    expect(looksSignedIn(['sb-abcdefgh-auth-token-code-verifier'])).toBe(false);
  });
});
