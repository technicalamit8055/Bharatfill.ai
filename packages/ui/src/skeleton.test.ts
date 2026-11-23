import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingRegion, Skeleton, SkeletonText } from './skeleton';

describe('Skeleton', () => {
  it('is decorative and drops its sweep for reduced motion', () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { className: 'h-4 w-10' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('motion-reduce:before:hidden');
    expect(html).toContain('before:animate-shimmer');
    expect(html).toContain('h-4 w-10');
  });

  it('uses the dark-first slate steps in the console tone', () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { tone: 'console' }));
    expect(html).toContain('bg-slate-800/70');
    expect(html).not.toContain('bg-slate-200/70');
  });

  it('lets a caller override the fill colour', () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { className: 'bg-brand-100/80' }));
    expect(html).toContain('bg-brand-100/80');
    expect(html).not.toContain('bg-slate-200/70');
  });

  it('draws one bar per line', () => {
    const html = renderToStaticMarkup(createElement(SkeletonText, { lines: 3 }));
    expect(html.match(/before:animate-shimmer/g)).toHaveLength(3);
  });
});

describe('LoadingRegion', () => {
  it('announces the label once and hides the placeholders from assistive tech', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingRegion, {
        label: 'लोड हो रहा है…',
        className: 'space-y-6',
        children: createElement(Skeleton),
      }),
    );
    expect(html).toMatch(/^<div role="status" aria-live="polite" aria-busy="true">/);
    expect(html).toContain('<span class="sr-only">लोड हो रहा है…</span>');
    expect(html).toContain('<div aria-hidden="true" class="space-y-6">');
  });
});
