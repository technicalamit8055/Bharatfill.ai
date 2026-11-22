import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  faqPageLd,
  itemListLd,
  serializeJsonLd,
  siteUrl,
  webApplicationLd,
} from './structured-data';

describe('siteUrl', () => {
  it('uses the configured origin', () => {
    expect(siteUrl('https://bharatfill.example').origin).toBe('https://bharatfill.example');
  });

  it('falls back to localhost rather than throwing on a missing or malformed value', () => {
    expect(siteUrl(undefined).origin).toBe('http://localhost:3000');
    expect(siteUrl('not a url').origin).toBe('http://localhost:3000');
  });

  it('builds absolute URLs against it', () => {
    expect(absoluteUrl('/tools/pdf-merge-compress', new URL('https://bharatfill.example'))).toBe(
      'https://bharatfill.example/tools/pdf-merge-compress',
    );
  });
});

describe('structured data', () => {
  it('describes a tool as a free web application', () => {
    const ld = webApplicationLd({
      name: 'PDF tools',
      description: 'Merge and compress',
      url: 'https://bharatfill.example/tools/pdf-merge-compress',
      inLanguage: 'en',
    });
    expect(ld['@type']).toBe('WebApplication');
    expect(ld.isAccessibleForFree).toBe(true);
    expect(ld.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'INR' });
  });

  it('numbers list items from one', () => {
    const ld = itemListLd([
      { name: 'A', url: 'https://x.test/a' },
      { name: 'B', url: 'https://x.test/b' },
    ]);
    expect((ld.itemListElement as { position: number }[]).map((item) => item.position)).toEqual([
      1, 2,
    ]);
  });

  it('pairs each FAQ question with its answer', () => {
    const ld = faqPageLd([{ question: 'Free?', answer: 'Yes.' }]);
    expect(ld.mainEntity).toEqual([
      { '@type': 'Question', name: 'Free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
    ]);
  });

  it('cannot be used to close the script tag it is written into', () => {
    const out = serializeJsonLd(faqPageLd([{ question: '</script><script>x()', answer: 'a' }]));
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).mainEntity[0].name).toBe('</script><script>x()');
  });
});
