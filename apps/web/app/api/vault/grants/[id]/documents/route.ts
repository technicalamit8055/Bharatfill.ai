import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { listGrantDocuments } from '@/lib/vault/operator';

const idSchema = z.string().uuid();

/** GET /api/vault/grants/:id/documents — the citizen's synced documents, for a live grant. */
export const GET = handler(
  'api.vault.grants.documents',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'vault.access');
    const id = idSchema.parse((await ctx.params).id);
    return ok(await listGrantDocuments(operatorVaultContext(context), id), {
      headers: { 'cache-control': 'no-store' },
    });
  },
);
