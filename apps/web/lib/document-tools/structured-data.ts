/**
 * schema.org data for the public `/tools` pages, so a search result can show the tool as a free
 * web app and its questions as an FAQ.
 *
 * Pure builders: the page passes translated strings and absolute URLs in. Nothing here describes
 * a person or a document — only the tools and the shared FAQ.
 */

const DEFAULT_SITE_URL = 'http://localhost:3000';

/**
 * The site's origin for canonical URLs and structured data. Read straight from the environment
 * rather than `publicEnv()`, which throws on any missing public variable — a bad Supabase key
 * must not take every page's metadata down with it.
 */
export function siteUrl(raw: string | undefined = process.env.NEXT_PUBLIC_APP_URL): URL {
  try {
    return new URL(raw ?? DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function absoluteUrl(path: string, base: URL = siteUrl()): string {
  return new URL(path, base).toString();
}

type JsonLd = Record<string, unknown>;

export function webApplicationLd(input: {
  name: string;
  description: string;
  url: string;
  inLanguage: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.inLanguage,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires a modern web browser',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  };
}

export function itemListLd(items: readonly { name: string; url: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function faqPageLd(items: readonly { question: string; answer: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * Serialises for a `<script type="application/ld+json">`. `<` is escaped so no string — even
 * translated copy containing `</script>` — can close the tag early.
 */
export function serializeJsonLd(data: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
