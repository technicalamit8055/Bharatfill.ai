import 'server-only';

import { auditSensitivityFor, redact, type AuditAction } from '@assistigo/core';
import { logger } from '../api/logger';
import type { Json } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * Records an event about a person's own account — their password, their sessions.
 *
 * Those belong to the person, not to a centre, but the audit trail is per organization
 * (`audit_logs.organization_id`, and the insert policy requires membership), so one row is written
 * into each centre the user is an active member of — an owner reviewing their trail sees it.
 *
 * Best-effort, like `writeAuditLog`: the change has already happened, and failing the request
 * over a lost audit line would leave the person believing it had not. Failures are logged loudly.
 */
export async function recordUserAuditEvent(
  supabase: AssistigoSupabaseClient,
  input: {
    userId: string;
    action: AuditAction;
    ipAddress: string | null;
    userAgent: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', input.userId)
    .eq('status', 'active');

  if (membershipError) {
    logger.error('audit.write_failed', { action: input.action, dbError: membershipError.message });
    return;
  }

  const metadata = (redact(input.metadata ?? {}) ?? {}) as Json;
  const rows = (memberships ?? []).map((member) => ({
    organization_id: member.organization_id,
    actor_user_id: input.userId,
    actor_type: 'user' as const,
    action: input.action,
    entity_type: 'user',
    entity_id: input.userId,
    sensitivity: auditSensitivityFor(input.action),
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    metadata,
  }));

  // A user with no centre yet has nowhere to write: `audit_logs` inserts are gated on membership.
  if (rows.length === 0) return;

  const { error } = await supabase.from('audit_logs').insert(rows);
  if (error) logger.error('audit.write_failed', { action: input.action, dbError: error.message });
}
