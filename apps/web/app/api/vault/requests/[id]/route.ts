import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { operatorVaultContext } from '@/lib/vault/context';
import { requestStatus } from '@/lib/vault/operator';

const idSchema = z.string().uuid();

/** GET /api/vault/requests/:id — poll until the citizen approves, denies, or it expires. */
export const GET = handler(
  'api.vault.requests.get',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'vault.access');
    const id = idSchema.parse((await ctx.params).id);
    return ok(await requestStatus(operatorVaultContext(context), id), {
      headers: { 'cache-control': 'no-store' },
    });
  },
);
