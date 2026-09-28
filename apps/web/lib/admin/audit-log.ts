import 'server-only';

import { z } from 'zod';
import {
  AUDIT_ACTION_BY_NAME,
  AUDIT_SENSITIVITY,
  isAuditAction,
  type AuditSensitivity,
} from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { AuditLogRow, Json } from '../supabase/database.types';
import { logger } from '../api/logger';

/**
 * The platform audit trail, for `/admin/audit` and the activity panels.
 *
 * PLATFORM rows only — `organization_id is null`, the ones `writePlatformAuditLog()` writes. A
 * tenant's own trail records what its operators did to its customers; reading that is exactly
 * what a support access grant exists to gate (§19.9), so no filter here can reach it.
 *
 * Metadata was redacted before it was written (lib/admin/audit.ts). Actors are resolved against
 * the staff roster only: an account that is not staff (a refused console sign-in, say) is shown
 * by id, never looked up in the auth schema.
 */

export const AUDIT_PAGE_SIZE = 50;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Query-string filters, parsed leniently: a bad value is dropped rather than failing the page. */
export const auditFiltersSchema = z.object({
  action: z
    .string()
    .refine((value) => isAuditAction(value))
    .optional()
    .catch(undefined),
  sensitivity: z.enum(AUDIT_SENSITIVITY).optional().catch(undefined),
  actor: z.string().uuid().optional().catch(undefined),
  entity: z.string().uuid().optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export type AuditEntryView = {
  id: string;
  createdAt: string;
  action: string;
  description: string;
  sensitivity: AuditSensitivity;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  /** The staff member's address from the roster, or null for a non-staff or deleted account. */
  actorEmail: string | null;
  actorType: AuditLogRow['actor_type'];
  ipAddress: string | null;
  metadata: Json;
};

/** The deployment's day boundary. Staff read times in IST, so a date filter means an IST day. */
const IST_OFFSET = '+05:30';

function nextDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** userId → email for everyone on the staff roster, active or not. A roster is tens of rows. */
export async function loadRosterDirectory(
  supabase: AssistigoSupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('platform_admins').select('user_id, email');
  if (error) {
    logger.error('platform.roster_directory_failed', { code: error.code });
    return new Map();
  }
  return new Map(
    ((data ?? []) as { user_id: string; email: string }[]).map((row) => [row.user_id, row.email]),
  );
}

export async function loadPlatformAuditLog(
  supabase: AssistigoSupabaseClient,
  filters: Omit<AuditFilters, 'page'> & { page?: number },
  options: { pageSize?: number; directory?: Map<string, string> } = {},
): Promise<{ entries: AuditEntryView[]; total: number; failed: boolean }> {
  const pageSize = options.pageSize ?? AUDIT_PAGE_SIZE;
  const page = filters.page ?? 1;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .is('organization_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters.action) query = query.eq('action', filters.action);
  if (filters.sensitivity) query = query.eq('sensitivity', filters.sensitivity);
  if (filters.actor) query = query.eq('actor_user_id', filters.actor);
  if (filters.entity) query = query.eq('entity_id', filters.entity);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00${IST_OFFSET}`);
  if (filters.to) query = query.lt('created_at', `${nextDay(filters.to)}T00:00:00${IST_OFFSET}`);

  const [{ data, error, count }, directory] = await Promise.all([
    query,
    options.directory ? Promise.resolve(options.directory) : loadRosterDirectory(supabase),
  ]);

  if (error) {
    // A page number past the end (an edited URL, or rows that aged out of a filter) is an empty
    // page, not a failure.
    if (error.code === 'PGRST103') return { entries: [], total: offset, failed: false };
    logger.error('platform.audit_read_failed', { code: error.code, dbError: error.message });
    return { entries: [], total: 0, failed: true };
  }

  const entries = ((data ?? []) as AuditLogRow[]).map<AuditEntryView>((row) => ({
    id: row.id,
    createdAt: row.created_at,
    action: row.action,
    description: AUDIT_ACTION_BY_NAME.get(row.action)?.description ?? row.action,
    sensitivity: row.sensitivity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_user_id ? (directory.get(row.actor_user_id) ?? null) : null,
    actorType: row.actor_type,
    ipAddress: row.ip_address,
    metadata: row.metadata,
  }));

  return { entries, total: count ?? entries.length, failed: false };
}

/** The platform actions, for the filter menu: every `platform.*` entry in the catalogue. */
export function platformAuditActions(): { action: string; description: string }[] {
  return [...AUDIT_ACTION_BY_NAME.values()]
    .filter((definition) => definition.action.startsWith('platform.'))
    .map((definition) => ({ action: definition.action, description: definition.description }));
}
