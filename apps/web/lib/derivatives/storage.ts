import 'server-only';

import { DERIVATIVE_BUCKET, sniffMimeType, unsupportedMedia } from '@assistigo/core';
import type { OutputMimeType } from '@assistigo/document-tools';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * Prepared-file storage access.
 *
 * Mirrors `lib/documents/storage.ts` against the `prepared-files` bucket, and repeats its one
 * non-negotiable property: bytes go browser → storage directly, and the *server* decides what
 * the stored object really is before a row is written (docs/SECURITY.md §4).
 */

export async function createSignedDerivativeUploadUrl(
  supabase: AssistigoSupabaseClient,
  storagePath: string,
): Promise<{ url: string; token: string }> {
  const { data, error } = await supabase.storage
    .from(DERIVATIVE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) throw error;
  return { url: data.signedUrl, token: data.token };
}

/**
 * Confirms the uploaded object is the file the request claims it is.
 *
 * A signed upload URL grants the holder one PUT to one path with a content-type of their
 * choosing. Trusting that would let an operator's browser — or anything that got hold of the URL
 * — park arbitrary bytes in a bucket the whole organization can read, labelled `image/jpeg`. So
 * the object is fetched back and its first bytes are sniffed.
 *
 * A full download is affordable here in a way it would not be for a source document: a derivative
 * is a portal-ready file, capped at `MAX_DERIVATIVE_BYTES`, and typically tens of kilobytes.
 * Sniffing a range would be cheaper but the storage client exposes no range read, and guessing
 * from the declared size is not verification.
 *
 * PDFs are checked by magic bytes only. `sniffMimeType` covers `%PDF`, which is the property that
 * matters — that the object is not an HTML page waiting to be served from our own bucket.
 */
export async function verifyDerivativeObject(
  supabase: AssistigoSupabaseClient,
  storagePath: string,
  declared: OutputMimeType,
  declaredSizeBytes: number,
): Promise<{ sizeBytes: number }> {
  const { data, error } = await supabase.storage.from(DERIVATIVE_BUCKET).download(storagePath);
  if (error) throw error;

  const bytes = new Uint8Array(await data.arrayBuffer());
  const actual = sniffMimeType(bytes);
  if (actual === null || actual !== declared) {
    throw unsupportedMedia('errors.file_type_mismatch');
  }

  // The size is re-read rather than trusted, so the storage entitlement is metered against what
  // was really stored. A tolerance would just be a hole in the meter.
  if (bytes.length !== declaredSizeBytes) {
    throw unsupportedMedia('errors.file_size_mismatch');
  }

  return { sizeBytes: bytes.length };
}

/** Removes an object, swallowing "already gone" — the goal state is "no bytes". */
export async function removeDerivativeObject(
  supabase: AssistigoSupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error } = await supabase.storage.from(DERIVATIVE_BUCKET).remove([storagePath]);
  if (error) throw error;
}
