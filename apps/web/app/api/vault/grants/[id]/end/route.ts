import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, noContent } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { endGrant } from '@/lib/vault/operator';

const idSchema = z.string().uuid();

/** POST /api/vault/grants/:id/end — the operator is done ("Done"); access ends at once. */
export const POST = handler(
  'api.vault.grants.end',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'vault.access');
    const id = idSchema.parse((await ctx.params).id);
    await endGrant(operatorVaultContext(context), id);
    return noContent();
  },
);
