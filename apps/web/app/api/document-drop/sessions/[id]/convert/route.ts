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
 * Permissions are checked per thing the action actually does, because a role can be allowed one
 * and not the others: it brings documents in (`document.upload`), it may create a customer
 * (`customer.create`), and it may write into another centre's citizen file under a consent grant
 * (`customer.roaming_authenticate`). The service verifies the grant itself; this only refuses a
 * role that has no business on that path at all.
 */
export const POST = handler(
  'api.document_drop.convert',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'document.upload');

    const sessionId = idSchema.parse((await ctx.params).id);
    const input = convertDropSessionSchema.parse(await readBody(request));

    const isRoaming = input.target === 'roaming';
    // A roaming save always names an existing citizen, so it never creates a profile.
    const createsCustomer = !isRoaming && !input.customerId;

    if (createsCustomer) requirePermission(context, 'customer.create');
    if (isRoaming) requirePermission(context, 'customer.roaming_authenticate');

    // Plan limits are checked here rather than inside the service so the operator is told
    // before anything is claimed, and so the service stays usable from a background context.
    const entitlements = await loadEntitlementContext(context);

    if (createsCustomer) {
      const customers = checkCustomerLimit(entitlements);
      if (!customers.allowed) throw entitlementExceeded(customers.reason);
    }

    // Only a local save queues extraction (see `convertDropSession`), so only a local save
    // needs the quota for it. Charging a visiting centre for a job that never runs would be
    // wrong, and blocking the citizen's own document over it would be worse.
    if (!isRoaming) {
      const extraction = checkUsageEntitlement(entitlements, 'ai_extraction');
      if (!extraction.allowed) throw entitlementExceeded(extraction.reason);
    }

    const result = await convertDropSession(context, sessionId, input);

    return ok({
      customerId: result.customerId,
      documentIds: result.documentIds,
      failedFileIds: result.failedFileIds,
      queuedExtractions: result.queuedExtractions,
      sessionRemainsOpen: result.sessionRemainsOpen,
      target: result.target,
      status: result.target === 'local' ? 'processing' : 'saved',
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
