import 'server-only';

import { auditSensitivityFor, redact, type AuditAction } from '@assistigo/core';
import type { Json } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { logger } from '../api/logger';

/**
 * Writes a platform-level audit entry.
 *
 * The tenant writer in lib/api/audit.ts needs a `RequestContext`, which carries an organization;
 * a platform act has none. These rows land in the same `audit_logs` table with
 * `organization_id = null` and `actor_type = 'support'`, so the internal trail and the tenant
 * trail are one immutable log rather than two that have to be correlated later.
 *
 * Metadata is redacted here rather than at the call site, same as the tenant path. In practice
 * platform metadata is slugs, ids and role names — but the panel is exactly where somebody will
 * one day be tempted to log "which tenant, which customer", and the redactor is what stops that
 * reaching disk.
 */
export async function writePlatformAuditLog(
  supabase: AssistigoSupabaseClient,
  input: {
    actorUserId: string;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: null,
    actor_user_id: input.actorUserId,
    actor_type: 'support',
    action: input.action,
    entity_type: input.entityType,
    // Queue rows, scraper sources and catalogue rows all have uuid ids; a non-uuid entity (a
    // slug, say) has no column to go in, so it belongs in metadata instead.
    entity_id: input.entityId ?? null,
    sensitivity: auditSensitivityFor(input.action),
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    metadata: (redact(input.metadata ?? {}) ?? {}) as Json,
  });

  if (error) {
    // Best-effort at the transport level, as on the tenant path: losing the audit line is better
    // than failing the employee's action. A persistent failure shows up as an error-rate alert.
    logger.error('platform.audit_write_failed', {
      action: input.action,
      entityType: input.entityType,
      dbError: error.message,
    });
  }
}
