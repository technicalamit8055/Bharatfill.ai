import { z } from 'zod';
import { handler, ok } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { createDownloadUrl, touchDevice } from '@/lib/citizen/documents';

const idSchema = z.string().uuid();

/**
 * GET /api/citizen/documents/:id/file — a short-lived link to the encrypted bytes of one of the
 * citizen's own documents, for the phone to pull in a file a centre added (migration 0047).
 */
export const GET = handler(
  'api.citizen.documents.file',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    await touchDevice(context, request);
    const id = idSchema.parse((await ctx.params).id);
    return ok(await createDownloadUrl(context, id));
  },
);
