import { z } from 'zod';
import { vaultDocumentConfirmSchema } from '@assistigo/core';
import { handler, ok, parseBody } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { confirmUpload, touchDevice } from '@/lib/citizen/documents';

const idSchema = z.string().uuid();

/**
 * POST /api/citizen/documents/:id/confirm — the phone has PUT the encrypted bytes; the server
 * checks their length and SHA-256 and marks the document ready. A mismatch removes the upload.
 */
export const POST = handler(
  'api.citizen.documents.confirm',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    await touchDevice(context, request);
    const id = idSchema.parse((await ctx.params).id);
    const { sha256 } = await parseBody(request, vaultDocumentConfirmSchema);
    return ok({ document: await confirmUpload(context, id, sha256) });
  },
);
