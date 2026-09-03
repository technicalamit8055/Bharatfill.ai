import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { discardDropSession } from '@/lib/document-drop/service';

const idSchema = z.string().uuid();

/**
 * DELETE /api/document-drop/sessions/:id — discard intake nobody is going to claim.
 *
 * A wrong number, a test scan, or a citizen who changed their mind. Deleting rather than letting
 * it expire is the privacy-preserving choice: identity documents sitting in a staging bucket for
 * two more hours serve nobody (§12.7).
 *
 * `document.delete` — owners and managers — because this destroys files an operator may still
 * be waiting on, and the two-hour expiry already handles the ordinary case with no action.
 */
export const DELETE = handler(
  'api.document_drop.discard',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.delete');

    const sessionId = idSchema.parse((await ctx.params).id);
    const result = await discardDropSession(context, sessionId);

    return ok(result);
  },
);
