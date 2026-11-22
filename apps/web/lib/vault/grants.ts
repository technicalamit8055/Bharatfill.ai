import 'server-only';

import {
  auditSensitivityFor,
  CITIZEN_TERMS_VERSION,
  isVaultGrantLive,
  notFound,
  redact,
  vaultGrantExpiry,
  vaultGrantMinutesLeft,
  type AuditAction,
  type VaultAccessMethod,
  type VaultEventAction,
} from '@assistigo/core';
import type { Json, VaultAccessGrantRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * Vault access grants — the one thing every bridge path mints (docs/VAULT_BRIDGE_DESIGN.md §4.2):
 * one operator user, one centre, one citizen, ≤ 2 hours. Shared by the operator routes
 * (`operator.ts`: share code) and the citizen routes (`../citizen/access.ts`: Approve).
 *
 * Everything here runs on the service-role client: citizen tables have no operator policy, and
 * the citizen writes nothing directly (0038 note 2). Callers have already proved who is asking.
 * Ids only in anything written outside the citizen's own rows — never a number, code or title.
 */

export type VaultDb = AssistigoSupabaseClient;

export const GRANT_COLUMNS =
  'id, citizen_id, organization_id, centre_name, granted_to_user_id, method, allow_copy, granted_at, expires_at, ended_at, ended_by, opened_notified_at, created_at';

export type GrantView = {
  id: string;
  centreName: string;
  method: VaultAccessMethod;
  allowCopy: boolean;
  grantedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: 'operator' | 'citizen' | 'system' | null;
  live: boolean;
  minutesLeft: number;
};

export function grantView(row: VaultAccessGrantRow, now: Date): GrantView {
  const shape = { expiresAt: row.expires_at, endedAt: row.ended_at };
  return {
    id: row.id,
    centreName: row.centre_name,
    method: row.method,
    allowCopy: row.allow_copy,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
    endedBy: row.ended_by,
    live: isVaultGrantLive(shape, now),
    minutesLeft: vaultGrantMinutesLeft(shape, now),
  };
}

/** An access event for the citizen's history. Insert-only (0038 trigger); throws on failure. */
export async function recordVaultEvent(
  db: VaultDb,
  event: {
    action: VaultEventAction;
    grant: Pick<VaultAccessGrantRow, 'id' | 'citizen_id' | 'organization_id' | 'centre_name'>;
    operatorId: string | null;
    documentId?: string | null;
    documentType?: string | null;
  },
): Promise<void> {
  const { error } = await db.from('vault_access_events').insert({
    grant_id: event.grant.id,
    citizen_id: event.grant.citizen_id,
    organization_id: event.grant.organization_id,
    centre_name: event.grant.centre_name,
    operator_id: event.operatorId,
    document_id: event.documentId ?? null,
    document_type: event.documentType ?? null,
    action: event.action,
  });
  if (error) throw error;
}

/**
 * An audit line in the centre's log written by the server on the citizen's behalf (an Approve):
 * `system` actor, because the citizen is not a member of the centre. Best effort, like
 * `writeAuditLog`; metadata is redacted.
 */
export async function writeCentreAudit(
  db: VaultDb,
  entry: {
    organizationId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.from('audit_logs').insert({
    organization_id: entry.organizationId,
    actor_user_id: null,
    actor_type: 'system',
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    sensitivity: auditSensitivityFor(entry.action),
    metadata: (redact(entry.metadata ?? {}) ?? {}) as Json,
  });
}

/**
 * Mints a grant and writes the `granted` event the citizen sees; with `allowCopy`, also the
 * citizen's `centre_copy` consent naming this grant (design D14).
 */
export async function mintGrant(
  db: VaultDb,
  input: {
    citizenId: string;
    organizationId: string;
    centreName: string;
    operatorId: string;
    method: VaultAccessMethod;
    minutes: number;
    allowCopy: boolean;
    now: Date;
  },
): Promise<VaultAccessGrantRow> {
  const { data, error } = await db
    .from('vault_access_grants')
    .insert({
      citizen_id: input.citizenId,
      organization_id: input.organizationId,
      centre_name: input.centreName,
      granted_to_user_id: input.operatorId,
      method: input.method,
      allow_copy: input.allowCopy,
      granted_at: input.now.toISOString(),
      expires_at: vaultGrantExpiry(input.now, input.minutes).toISOString(),
    })
    .select(GRANT_COLUMNS)
    .single();
  if (error) throw error;
  const grant = data as VaultAccessGrantRow;

  await recordVaultEvent(db, { action: 'granted', grant, operatorId: input.operatorId });
  if (input.allowCopy) {
    const { error: consentError } = await db.from('citizen_consent_records').insert({
      citizen_id: input.citizenId,
      subject: 'centre_copy',
      text_version: CITIZEN_TERMS_VERSION,
      grant_id: grant.id,
    });
    if (consentError) throw consentError;
  }
  return grant;
}

/**
 * The grant, if it is live and held by this operator at this centre. Anything else — unknown,
 * another operator's, another centre's, expired, ended — is the same 404, so a grant id reveals
 * nothing to whoever does not hold it.
 */
export async function liveGrantFor(
  db: VaultDb,
  input: { grantId: string; operatorId: string; organizationId: string; now: Date },
): Promise<VaultAccessGrantRow> {
  const { data, error } = await db
    .from('vault_access_grants')
    .select(GRANT_COLUMNS)
    .eq('id', input.grantId)
    .eq('granted_to_user_id', input.operatorId)
    .eq('organization_id', input.organizationId)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  const grant = data as VaultAccessGrantRow | null;
  if (
    !grant ||
    !isVaultGrantLive({ expiresAt: grant.expires_at, endedAt: grant.ended_at }, input.now)
  ) {
    throw notFound('errors.vault.grant_missing');
  }
  return grant;
}
