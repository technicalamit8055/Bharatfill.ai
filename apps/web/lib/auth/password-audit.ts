import 'server-only';

import { auditSensitivityFor } from '@assistigo/core';
import { logger } from '../api/logger';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * Records `auth.password_changed` for a user who has just replaced their password.
 *
 * A password belongs to the person, not to a centre, but the audit trail is per organization
 * (`audit_logs.organization_id`, and the insert policy requires membership), so one row is written
 * into each centre the user is an active member of — an owner reviewing their trail sees it.
 *
 * Best-effort, like `writeAuditLog`: the password is already changed, and failing the request
 * over a lost audit line would leave the person believing it was not. Failures are logged loudly.
 * Nothing about the password itself is recorded.
 */
export async function recordPasswordChange(
  supabase: AssistigoSupabaseClient,
  input: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    method: 'recovery';
  },
): Promise<void> {
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', input.userId)
    .eq('status', 'active');

  if (membershipError) {
    logger.error('audit.write_failed', {
      action: 'auth.password_changed',
      dbError: membershipError.message,
    });
    return;
  }

  const rows = (memberships ?? []).map((member) => ({
    organization_id: member.organization_id,
    actor_user_id: input.userId,
    actor_type: 'user' as const,
    action: 'auth.password_changed' as const,
    entity_type: 'user',
    entity_id: input.userId,
    sensitivity: auditSensitivityFor('auth.password_changed'),
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    metadata: { method: input.method },
  }));

  // A user with no centre yet has nowhere to write: `audit_logs` inserts are gated on membership.
  if (rows.length === 0) return;

  const { error } = await supabase.from('audit_logs').insert(rows);
  if (error) {
    logger.error('audit.write_failed', {
      action: 'auth.password_changed',
      dbError: error.message,
    });
  }
}
