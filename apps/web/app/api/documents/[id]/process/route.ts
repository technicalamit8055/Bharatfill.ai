import { z } from 'zod';
import { extractionModeSchema } from '@assistigo/ai';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { processDocument } from '@/lib/documents/process';
import {
  loadOwnAppCustomerUpload,
  processAppCustomerUpload,
} from '@/lib/documents/app-customer-upload';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const idSchema = z.string().uuid();

/**
 * The body is optional: three callers post to this route, and "read it however you normally
 * would" is a legitimate thing for any of them to say.
 *
 * `extractionMode` stays `optional` rather than defaulting, because absent and `auto` are not
 * the same instruction. Absent means "do not change how this document is read"; `auto` is a
 * choice, and a choice may overwrite the method already queued (see `claim_document_job`).
 *
 * `storeOnly` is the upload forms saying "keep the file, read nothing" (§12.4): always for a
 * Photograph or Signature, and for any typed document the operator ticked "Just save — don't
 * read" for. The server refuses it for a document still without a type.
 */
const bodySchema = z.object({
  extractionMode: extractionModeSchema.optional(),
  storeOnly: z.boolean().optional(),
});

/**
 * POST /api/documents/:id/process
 *
 * Confirms an upload, then queues and runs extraction — or files a photo or signature as
 * `stored` without reading it (§17.4; docs/AI_PIPELINE.md §10). Either way the magic bytes are
 * checked first; see `processDocument`.
 */
export const POST = handler(
  'api.documents.process',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.upload');

    const id = idSchema.parse((await ctx.params).id);
    const options = bodySchema.parse(await readBody(request));

    // An upload this operator made for a BharatDoc app customer (0047) lives in the app
    // organization, out of reach of the ordinary path's organization filter.
    const admin = createSupabaseAdminClient();
    const appUpload = await loadOwnAppCustomerUpload(context, admin, id);
    if (appUpload) return ok(await processAppCustomerUpload(context, admin, appUpload, options));

    return ok(await processDocument(context, id, options));
  },
);

/** An absent, empty or non-JSON body means "no options", not a bad request. */
async function readBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return {};
  }
}
