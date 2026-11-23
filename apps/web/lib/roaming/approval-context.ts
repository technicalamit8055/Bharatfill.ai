import 'server-only';

import { writeAuditLog } from '../api/audit';
import type { RequestContext } from '../api/context';
import type { CitizenContext } from '../citizen/context';
import { createSupabaseAdminClient } from '../supabase/server';
import type { CitizenApprovalContext, OperatorApprovalContext } from './app-approval';

/**
 * The app-approval services' dependencies from a resolved request. The bookmark check runs on
 * the operator's own JWT (as `service.ts` does); every other query is scoped by ids taken from
 * the verified session, never from the body.
 */
export function operatorApprovalContext(context: RequestContext): OperatorApprovalContext {
  return {
    db: createSupabaseAdminClient(),
    organizationId: context.organization.id,
    centreName: context.organization.name,
    operatorId: context.userId,
    now: () => new Date(),
    isLinked: async (customerId) => {
      // A link, or this centre's own record the citizen locked (0046).
      const { data, error } = await context.supabase.rpc('can_request_customer_access', {
        p_customer_id: customerId,
      });
      if (error) throw error;
      return data === true;
    },
    audit: (entry) => writeAuditLog(context, entry),
  };
}

export function citizenApprovalContext(context: CitizenContext): CitizenApprovalContext {
  return {
    db: context.admin,
    citizenId: context.citizenId,
    phone: context.phone,
    now: () => new Date(),
  };
}
