import { roamingLinkInputSchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { linkRoamingCustomer } from '@/lib/roaming/service';

/**
 * POST /api/customers/roaming/link
 *
 * Bookmarks a customer found on the network into this centre's roaming list. Grants no access to
 * the record on its own (migration 0024 header note 1) — it only makes the masked card and the
 * "Request OTP" action reachable by id afterwards.
 */
export const POST = handler('api.customers.roaming.link', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'customer.roaming_link');

  const input = await parseBody(request, roamingLinkInputSchema);
  const card = await linkRoamingCustomer(context, input);

  return created({ customer: card });
});
