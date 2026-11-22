import 'server-only';

import { writeAuditLog } from '../api/audit';
import type { RequestContext } from '../api/context';
import { createSupabaseAdminClient } from '../supabase/server';
import type { OperatorVaultContext } from './operator';

/**
 * The operator vault services' dependencies, from a resolved centre request. The service-role
 * client is used because citizen tables have no operator policy (design §5); every query it runs
 * is scoped by this operator's id and centre, taken from the verified session, never the body.
 */
export function operatorVaultContext(context: RequestContext): OperatorVaultContext {
  return {
    db: createSupabaseAdminClient(),
    organizationId: context.organization.id,
    centreName: context.organization.name,
    operatorId: context.userId,
    now: () => new Date(),
    audit: (entry) => writeAuditLog(context, entry),
  };
}
