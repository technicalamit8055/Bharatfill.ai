import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/document-tools/structured-data';

/**
 * Crawl the marketing pages and the free tools; stay out of the API and the one-time links
 * (document drop codes, invites, auth callbacks), which mean nothing out of context. The
 * dashboard needs no rule of its own — signed out, every page there redirects to sign-in.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/drop/', '/invite/', '/admin', '/staff'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
