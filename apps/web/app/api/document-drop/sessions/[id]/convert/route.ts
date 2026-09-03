import { z } from 'zod';
import {
  checkCustomerLimit,
  checkUsageEntitlement,
  convertDropSessionSchema,
  entitlementExceeded,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok } from '@/lib/api/response';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import { convertDropSession } from '@/lib/document-drop/service';

const idSchema = z.string().uuid();

/**
 * POST /api/document-drop/sessions/:id/convert — the one-click intake (§9.1).
 *
 * Creates or links the customer, promotes every staged file into `documents`, and queues
 * extraction. The heavy lifting, and the reasoning about ordering and races, is in
 * `convertDropSession`.
 *
 * Two permissions are checked because this one action does two things a role can be allowed
 * separately: it brings documents into the organization, and — unless the operator picked an
 * existing profile — it creates a customer.
 */
export const POST = handler(
  'api.document_drop.convert',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.upload');

    const sessionId = idSchema.parse((await ctx.params).id);
    const input = convertDropSessionSchema.parse(await readBody(request));

    if (!input.customerId) requirePermission(context, 'customer.create');

    // Plan limits are checked here rather than inside the service so the operator is told
    // before anything is claimed, and so the service stays usable from a background context.
    const entitlements = await loadEntitlementContext(context);

    if (!input.customerId) {
      const customers = checkCustomerLimit(entitlements);
      if (!customers.allowed) throw entitlementExceeded(customers.reason);
    }

    const extraction = checkUsageEntitlement(entitlements, 'ai_extraction');
    if (!extraction.allowed) throw entitlementExceeded(extraction.reason);

    const result = await convertDropSession(context, sessionId, input);

    return ok({
      customerId: result.customerId,
      documentIds: result.documentIds,
      failedFileIds: result.failedFileIds,
      queuedExtractions: result.queuedExtractions,
      status: 'processing',
    });
  },
);

/** An absent or empty body means "create a new profile", which is the common case. */
async function readBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return {};
  }
}
