import { NextResponse } from 'next/server';
import { SCHEME_LOGO_BUCKET, isSchemeLogoPath } from '@assistigo/core';
import { logger } from '@/lib/api/logger';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

const notFound = () => new NextResponse(null, { status: 404 });

/**
 * GET /scheme-logos/<slug>/<uuid>.<ext> — one scheme logo, for a signed-in user.
 *
 * The bucket is private (docs/SECURITY.md: no public bucket), so this route is the only way a
 * logo reaches a browser. Outside /api on purpose: every /api response is `no-store`, and a logo
 * whose path changes on every upload is exactly the thing that should be cached for good.
 *
 * Any signed-in user may read any logo. They are reference imagery with no personal data, and
 * the same picture is shown to every centre; scoping them per organization would protect nothing.
 * The path is checked against the one shape the upload action builds before anything is read, so
 * this cannot be walked into another bucket or folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const objectPath = path.join('/');
  if (!isSchemeLogoPath(objectPath)) return notFound();

  const userClient = await createSupabaseServerClient();
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return new NextResponse(null, { status: 401 });

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(SCHEME_LOGO_BUCKET)
    .download(objectPath);

  if (error || !data) {
    // The path is a slug and a random id — reference data, safe to log, and the only way to find
    // a row pointing at an object that is gone.
    logger.warn('schemes.logo_missing', { path: objectPath });
    return notFound();
  }

  const ext = objectPath.slice(objectPath.lastIndexOf('.') + 1);

  return new NextResponse(data, {
    headers: {
      'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      // Each upload gets a new path, so a given URL's bytes never change.
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Belt and braces: even if something other than an image were ever stored, opening it
      // directly could run nothing.
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
