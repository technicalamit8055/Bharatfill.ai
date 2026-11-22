import { z } from 'zod';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, noContent, ok } from '@/lib/api/response';
import { appApprovalStatus, cancelAppApproval } from '@/lib/roaming/app-approval';
import { operatorApprovalContext } from '@/lib/roaming/approval-context';

const paramsSchema = z.object({ id: z.string().uuid(), requestId: z.string().uuid() });

/**
 * GET /api/customers/:id/roaming/app-request/:requestId — poll until the citizen approves,
 * denies or the request runs out. On approval the answer carries the live session.
 */
export const GET = handler(
  'api.customers.roaming.app_request_status',
  async (request, ctx: { params: Promise<{ id: string; requestId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const { id, requestId } = paramsSchema.parse(await ctx.params);
    const view = await appApprovalStatus(operatorApprovalContext(context), id, requestId);

    return ok(view, { headers: { 'cache-control': 'no-store' } });
  },
);

/** DELETE — the operator stopped waiting; the citizen can no longer approve this request. */
export const DELETE = handler(
  'api.customers.roaming.app_request_cancel',
  async (request, ctx: { params: Promise<{ id: string; requestId: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'customer.roaming_authenticate');

    const { id, requestId } = paramsSchema.parse(await ctx.params);
    await cancelAppApproval(operatorApprovalContext(context), id, requestId);

    return noContent();
  },
);
