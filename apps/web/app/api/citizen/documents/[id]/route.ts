import { z } from 'zod';
import { vaultDocumentUpdateSchema } from '@assistigo/core';
import { handler, noContent, ok, parseBody } from '@/lib/api/response';
import { resolveCitizen } from '@/lib/citizen/context';
import { deleteVaultDocument, touchDevice, updateVaultDocument } from '@/lib/citizen/documents';

const idSchema = z.string().uuid();

/** PATCH /api/citizen/documents/:id — type and title. */
export const PATCH = handler(
  'api.citizen.documents.update',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    await touchDevice(context, request);
    const id = idSchema.parse((await ctx.params).id);
    const patch = await parseBody(request, vaultDocumentUpdateSchema);
    return ok({ document: await updateVaultDocument(context, id, patch) });
  },
);

/** DELETE /api/citizen/documents/:id — hidden at once; encrypted bytes removed. */
export const DELETE = handler(
  'api.citizen.documents.delete',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveCitizen(request);
    await touchDevice(context, request);
    const id = idSchema.parse((await ctx.params).id);
    await deleteVaultDocument(context, id);
    return noContent();
  },
);
