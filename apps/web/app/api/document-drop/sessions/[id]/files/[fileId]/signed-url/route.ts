import { z } from 'zod';
import { SIGNED_URL_TTL_SECONDS } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { signDropFile } from '@/lib/document-drop/service';

const idSchema = z.string().uuid();

/**
 * POST /api/document-drop/sessions/:id/files/:fileId/signed-url
 *
 * The only way to reach a staged file's bytes, and the counterpart of
 * `/api/documents/:id/signed-url` for intake that has not become a document yet (§9.1, §19.3).
 *
 * `document.download` rather than `document.view`, which is what the queue listing itself needs:
 * seeing that somebody is waiting at the counter and reading their Aadhaar are not the same
 * permission. POST rather than GET for the same reason as the document route — issuing a
 * credential is not a safe, cacheable read — and the audit row is written by the service.
 */
export const POST = handler(
  'api.document_drop.file_signed_url',
  async (request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.download');

    const params = await ctx.params;
    const sessionId = idSchema.parse(params.id);
    const fileId = idSchema.parse(params.fileId);

    const file = await signDropFile(context, sessionId, fileId);

    return ok({ ...file, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  },
);
