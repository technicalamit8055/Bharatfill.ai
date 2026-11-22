import 'server-only';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { DocumentToolId } from './hub';
import { looksSignedIn, publicTool, publicToolCopyKey, PUBLIC_TOOLS_HREF } from './public-tools';
import type { getTranslations } from '@/lib/i18n/server';

type Translate = Awaited<ReturnType<typeof getTranslations>>['t'];

/** Display hint only — see `looksSignedIn`. Reads cookie names, never their values. */
export async function visitorLooksSignedIn(): Promise<boolean> {
  const store = await cookies();
  return looksSignedIn(store.getAll().map((cookie) => cookie.name));
}

function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: 'website', siteName: 'Bharatfill' },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
  };
}

export function publicHubMetadata(t: Translate): Metadata {
  return pageMetadata(
    t('publicTools.meta.title'),
    t('publicTools.meta.description'),
    PUBLIC_TOOLS_HREF,
  );
}

export function publicToolMetadata(t: Translate, id: DocumentToolId): Metadata {
  return pageMetadata(
    t(publicToolCopyKey(id, 'metaTitle')),
    t(publicToolCopyKey(id, 'metaDescription')),
    publicTool(id).href,
  );
}
