import 'server-only';

import {
  notFound,
  SHARE_CODE_TTL_MINUTES,
  type accessRequestDecisionSchema,
  type shareCodeIssueSchema,
} from '@assistigo/core';
import type { z } from 'zod';
import type {
  VaultAccessEventRow,
  VaultAccessGrantRow,
  VaultAccessRequestRow,
} from '../supabase/database.types';
import {
  GRANT_COLUMNS,
  grantView,
  mintGrant,
  recordVaultEvent,
  writeCentreAudit,
  type GrantView,
  type VaultDb,
} from '../vault/grants';
import { assertVaultConfigured, generateShareCode, newCodeSalt, shareCodeHmac } from './secrets';

/**
 * The citizen's side of the bridge (docs/VAULT_BRIDGE_DESIGN.md §4.2):
 *
 *   share code  six digits for the counter, valid 5 minutes, one use, 3 tries. Issuing a new one
 *               retires any earlier code still open, so only the latest works. The code is
 *               returned once and stored only as a salted HMAC.
 *   access      live and recent grants, pending requests from centres, and the history of what
 *               was opened (document type, never the title the operator saw).
 *   approve / deny a centre's request; revoke (Stop) a live grant.
 *
 * Every function is scoped by `citizenId` from the verified token, in the predicate.
 */

export type CitizenAccessContext = { db: VaultDb; citizenId: string; now: () => Date };

async function requireAccount(ctx: CitizenAccessContext): Promise<void> {
  const { data, error } = await ctx.db
    .from('citizen_accounts')
    .select('id')
    .eq('id', ctx.citizenId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.vault.account_missing');
}

export type IssuedShareCode = { code: string; expiresAt: string };

export async function issueShareCode(
  ctx: CitizenAccessContext,
  input: z.output<typeof shareCodeIssueSchema>,
): Promise<IssuedShareCode> {
  assertVaultConfigured();
  await requireAccount(ctx);
  const now = ctx.now();

  const { error: retireError } = await ctx.db
    .from('vault_access_challenges')
    .update({ consumed_at: now.toISOString() })
    .eq('citizen_id', ctx.citizenId)
    .is('consumed_at', null);
  if (retireError) throw retireError;

  const code = generateShareCode();
  const salt = newCodeSalt();
  const expiresAt = new Date(now.getTime() + SHARE_CODE_TTL_MINUTES * 60_000).toISOString();
  const { error } = await ctx.db.from('vault_access_challenges').insert({
    citizen_id: ctx.citizenId,
    code_salt: salt,
    code_hmac: shareCodeHmac(code, salt),
    duration_minutes: input.durationMinutes,
    allow_copy: input.allowCopy,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { code, expiresAt };
}

export type PendingRequestView = {
  id: string;
  centreName: string;
  expiresAt: string;
  createdAt: string;
};
export type AccessEventView = {
  id: string;
  action: VaultAccessEventRow['action'];
  centreName: string | null;
  documentType: string | null;
  createdAt: string;
};
export type AccessOverview = {
  grants: GrantView[];
  requests: PendingRequestView[];
  events: AccessEventView[];
};

export async function listAccess(ctx: CitizenAccessContext): Promise<AccessOverview> {
  const now = ctx.now();
  const [grants, requests, events] = await Promise.all([
    ctx.db
      .from('vault_access_grants')
      .select(GRANT_COLUMNS)
      .eq('citizen_id', ctx.citizenId)
      .order('granted_at', { ascending: false })
      .limit(20),
    ctx.db
      .from('vault_access_requests')
      .select('id, centre_name, status, expires_at, created_at')
      .eq('citizen_id', ctx.citizenId)
      .eq('status', 'pending')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    ctx.db
      .from('vault_access_events')
      .select('id, action, centre_name, document_type, created_at')
      .eq('citizen_id', ctx.citizenId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  for (const result of [grants, requests, events]) if (result.error) throw result.error;

  return {
    grants: ((grants.data ?? []) as VaultAccessGrantRow[]).map((row) => grantView(row, now)),
    requests: ((requests.data ?? []) as VaultAccessRequestRow[]).map((row) => ({
      id: row.id,
      centreName: row.centre_name,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
    events: ((events.data ?? []) as VaultAccessEventRow[]).map((row) => ({
      id: row.id,
      action: row.action,
      centreName: row.centre_name,
      documentType: row.document_type,
      createdAt: row.created_at,
    })),
  };
}

async function pendingRequest(
  ctx: CitizenAccessContext,
  requestId: string,
): Promise<VaultAccessRequestRow> {
  const { data, error } = await ctx.db
    .from('vault_access_requests')
    .select('*')
    .eq('id', requestId)
    .eq('citizen_id', ctx.citizenId)
    .eq('status', 'pending')
    .gt('expires_at', ctx.now().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.vault.request_missing');
  return data as VaultAccessRequestRow;
}

/** Approve: a grant for the operator who asked, for the time the citizen picked. */
export async function approveRequest(
  ctx: CitizenAccessContext,
  requestId: string,
  input: z.output<typeof accessRequestDecisionSchema>,
): Promise<GrantView> {
  const now = ctx.now();
  const request = await pendingRequest(ctx, requestId);

  // Claim the request first, so two taps (or two phones) cannot mint two grants.
  const { data: claimed, error: claimError } = await ctx.db
    .from('vault_access_requests')
    .update({
      status: 'approved',
      decided_at: now.toISOString(),
      duration_minutes: input.durationMinutes,
      allow_copy: input.allowCopy,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) throw notFound('errors.vault.request_missing');

  const grant = await mintGrant(ctx.db, {
    citizenId: ctx.citizenId,
    organizationId: request.organization_id,
    centreName: request.centre_name,
    operatorId: request.requested_by,
    method: 'approval',
    minutes: input.durationMinutes,
    allowCopy: input.allowCopy,
    now,
  });
  const { error: linkError } = await ctx.db
    .from('vault_access_requests')
    .update({ grant_id: grant.id })
    .eq('id', request.id);
  if (linkError) throw linkError;

  await writeCentreAudit(ctx.db, {
    organizationId: request.organization_id,
    action: 'vault.grant_created',
    entityType: 'vault_access_grant',
    entityId: grant.id,
    metadata: { method: 'approval', minutes: input.durationMinutes, allowCopy: input.allowCopy },
  });
  return grantView(grant, now);
}

export async function denyRequest(ctx: CitizenAccessContext, requestId: string): Promise<void> {
  const request = await pendingRequest(ctx, requestId);
  const { error } = await ctx.db
    .from('vault_access_requests')
    .update({ status: 'denied', decided_at: ctx.now().toISOString() })
    .eq('id', request.id)
    .eq('status', 'pending');
  if (error) throw error;
}

/** Stop: ends one of the citizen's own live grants at once. */
export async function revokeGrant(ctx: CitizenAccessContext, grantId: string): Promise<void> {
  const now = ctx.now();
  const { data, error } = await ctx.db
    .from('vault_access_grants')
    .update({ ended_at: now.toISOString(), ended_by: 'citizen' })
    .eq('id', grantId)
    .eq('citizen_id', ctx.citizenId)
    .is('ended_at', null)
    .gt('expires_at', now.toISOString())
    .select(GRANT_COLUMNS);
  if (error) throw error;
  const grant = ((data ?? []) as VaultAccessGrantRow[])[0];
  if (!grant) throw notFound('errors.vault.grant_missing');
  await recordVaultEvent(ctx.db, { action: 'ended', grant, operatorId: null });
}
