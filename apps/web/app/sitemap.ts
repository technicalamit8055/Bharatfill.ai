import type { MetadataRoute } from 'next';
import { PUBLIC_TOOLS, PUBLIC_TOOLS_HREF } from '@/lib/document-tools/public-tools';
import { absoluteUrl } from '@/lib/document-tools/structured-data';

/**
 * Public pages only. Everything behind sign-in is left out — it would only redirect a crawler to
 * the sign-in form.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl(PUBLIC_TOOLS_HREF), changeFrequency: 'weekly', priority: 0.9 },
    ...PUBLIC_TOOLS.map((tool) => ({
      url: absoluteUrl(tool.href),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: absoluteUrl('/changelog'), changeFrequency: 'weekly', priority: 0.5 },
  ];
}
