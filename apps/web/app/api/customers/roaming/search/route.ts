import { roamingSearchQuerySchema } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseQuery } from '@/lib/api/response';
import { searchRoamingCustomers } from '@/lib/roaming/service';

/**
 * GET /api/customers/roaming/search?mobile=...
 *
 * Platform-wide lookup for the counter workflow: "Aapka registered mobile number kya hai?"
 * (docs/EXTENSION.md-style dashboard/extension shared endpoint). Returns masked cards only — see
 * `RoamingCustomerCard` in packages/core/src/roaming/types.ts for exactly what that means.
 */
export const GET = handler('api.customers.roaming.search', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'customer.roaming_link');

  const query = parseQuery(request, roamingSearchQuerySchema);
  const customers = await searchRoamingCustomers(context, query.mobile);

  return ok({ customers });
});
