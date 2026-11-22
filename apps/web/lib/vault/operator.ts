import 'server-only';

import {
  codeEntryAllowed,
  decideLookup,
  DEV_LOOKUP_LIMITS,
  LOOKUP_LIMITS,
  notFound,
  permissionDenied,
  rateLimited,
  WRONG_CODE_LIMITS,
  type AuditAction,
} from '@assistigo/core';
import { VAULT_BUCKET } from '../citizen/account';
import { matchesShareCode, mobileHmac, unwrapDocumentKey } from '../citizen/secrets';
import { openVaultFile } from '../citizen/vault-file';
import type {
  CitizenVaultDocumentRow,
  VaultAccessGrantRow,
  VaultAccessRequestRow,
} from '../supabase/database.types';
import {
  grantView,
  liveGrantFor,
  mintGrant,
  recordVaultEvent,
  type GrantView,
  type VaultDb,
} from './grants';

/**
 * The operator's side of the Citizen Vault bridge (docs/VAULT_BRIDGE_DESIGN.md §4, §6, §7):
 *
 *   lookup   "Bharatfill Vault" for a typed mobile number. Always the same answer — a request id
 *            and the code box — whether or not the number has a vault (no enumeration). A request
 *            row is written for every lookup; it reaches the citizen's phone only when they have
 *            an account with cloud sync on, and not more than 3 times in 15 min across centres.
 *   unlock   the 6-digit share code the citizen reads out. Every failure is one message.
 *   status   poll a request until the citizen approves, denies or it expires.
 *   documents / file / end — a live grant held by this operator, nothing else.
 *
 * The file route writes the access event BEFORE reading any byte: a citizen is never shown less
 * than what was opened. Mobile numbers, codes and titles never reach a log or an audit line.
 */

export type OperatorVaultContext = {
  db: VaultDb;
  organizationId: string;
  centreName: string;
  operatorId: string;
  now: () => Date;
  audit: (entry: {
    action: AuditAction;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

const MINUTE = 60_000;
const ago = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * MINUTE).toISOString();

/** How many rows match, up to `cap` — enough to compare against a limit, without a count query. */
async function countSince(
  db: VaultDb,
  table: 'vault_access_requests' | 'vault_unlock_attempts',
  column: string,
  value: string,
  since: string,
  cap: number,
  failuresOnly = false,
): Promise<number> {
  let query = db.from(table).select('id').eq(column, value).gte('created_at', since);
  if (failuresOnly) query = query.eq('succeeded', false);
  const { data, error } = await query.limit(cap);
  if (error) throw error;
  return (data ?? []).length;
}

/** The citizen behind a number, only if they have an account with cloud sync on. */
async function citizenWithCloud(db: VaultDb, mobile: string): Promise<string | null> {
  const { data: citizenId, error } = await db.rpc('citizen_id_for_mobile', { p_mobile: mobile });
  if (error) throw error;
  if (typeof citizenId !== 'string') return null;
  const { data: account, error: accountError } = await db
    .from('citizen_accounts')
    .select('id, cloud_enabled')
    .eq('id', citizenId)
    .maybeSingle();
  if (accountError) throw accountError;
  return (account as { cloud_enabled: boolean } | null)?.cloud_enabled ? citizenId : null;
}

/**
 * Production limits everywhere except `next dev` (NODE_ENV 'development'), where one test number
 * is looked up over and over. `next build` / `next start` force 'production' and tests run as
 * 'test', so neither a deployed server nor the safety tests ever see the relaxed limits.
 */
const lookupLimits = () =>
  process.env.NODE_ENV === 'development' ? DEV_LOOKUP_LIMITS : LOOKUP_LIMITS;

export type LookupResult = { requestId: string; expiresAt: string };

export async function lookupVault(
  ctx: OperatorVaultContext,
  mobile: string,
): Promise<LookupResult> {
  const now = ctx.now();
  const hmac = mobileHmac(mobile); // fails closed (errors.vault.unavailable) without the key

  const limits = lookupLimits();
  const decision = decideLookup(
    {
      byOperatorLast15Minutes: await countSince(
        ctx.db,
        'vault_access_requests',
        'requested_by',
        ctx.operatorId,
        ago(now, 15),
        limits.perOperatorPer15Minutes,
      ),
      byCentreLastHour: await countSince(
        ctx.db,
        'vault_access_requests',
        'organization_id',
        ctx.organizationId,
        ago(now, 60),
        limits.perCentrePerHour,
      ),
      toNumberLast15Minutes: await countSince(
        ctx.db,
        'vault_access_requests',
        'mobile_hmac',
        hmac,
        ago(now, 15),
        limits.perNumberPer15Minutes,
      ),
    },
    limits,
  );
  if (!decision.allowed) throw rateLimited('errors.vault.lookup_limited');

  // Past the per-number cap the row is still written (the operator sees nothing different), but
  // without the citizen's id it never reaches their phone.
  const citizenId = decision.deliver ? await citizenWithCloud(ctx.db, mobile) : null;

  const { data, error } = await ctx.db
    .from('vault_access_requests')
    .insert({
      citizen_id: citizenId,
      mobile_hmac: hmac,
      organization_id: ctx.organizationId,
      centre_name: ctx.centreName,
      requested_by: ctx.operatorId,
      expires_at: new Date(now.getTime() + 10 * MINUTE).toISOString(),
    })
    .select('id, expires_at')
    .single();
  if (error) throw error;
  const row = data as Pick<VaultAccessRequestRow, 'id' | 'expires_at'>;

  await ctx.audit({ action: 'vault.lookup', entityType: 'vault_access_request', entityId: row.id });
  return { requestId: row.id, expiresAt: row.expires_at };
}

export type RequestStatus =
  | { status: 'pending'; expiresAt: string }
  | { status: 'approved'; grant: GrantView }
  | { status: 'denied' | 'expired' };

export async function requestStatus(
  ctx: OperatorVaultContext,
  requestId: string,
): Promise<RequestStatus> {
  const now = ctx.now();
  const { data, error } = await ctx.db
    .from('vault_access_requests')
    .select('id, status, grant_id, expires_at')
    .eq('id', requestId)
    .eq('requested_by', ctx.operatorId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  const request = data as Pick<
    VaultAccessRequestRow,
    'id' | 'status' | 'grant_id' | 'expires_at'
  > | null;
  if (!request) throw notFound('errors.vault.request_missing');

  if (request.status === 'approved' && request.grant_id) {
    const grant = await liveGrantFor(ctx.db, {
      grantId: request.grant_id,
      operatorId: ctx.operatorId,
      organizationId: ctx.organizationId,
      now,
    }).catch(() => null);
    return grant ? { status: 'approved', grant: grantView(grant, now) } : { status: 'expired' };
  }
  if (request.status === 'denied') return { status: 'denied' };
  if (request.status === 'expired' || new Date(request.expires_at) <= now)
    return { status: 'expired' };
  return { status: 'pending', expiresAt: request.expires_at };
}

type ChallengeRow = {
  id: string;
  code_salt: string;
  code_hmac: string;
  attempts_left: number;
  duration_minutes: 30 | 120;
  allow_copy: boolean;
};

/** A hash compared when there is no code to compare against, so every failure costs the same. */
const DECOY_SALT = '00000000000000000000000000000000';
const DECOY_HMAC = '0'.repeat(64);

export async function unlockWithCode(
  ctx: OperatorVaultContext,
  mobile: string,
  code: string,
): Promise<GrantView> {
  const now = ctx.now();
  const hmac = mobileHmac(mobile);

  const allowed = codeEntryAllowed({
    byCentreLastHour: await countSince(
      ctx.db,
      'vault_unlock_attempts',
      'organization_id',
      ctx.organizationId,
      ago(now, 60),
      WRONG_CODE_LIMITS.perCentrePerHour,
      true,
    ),
    forNumberLastDay: await countSince(
      ctx.db,
      'vault_unlock_attempts',
      'mobile_hmac',
      hmac,
      ago(now, 24 * 60),
      WRONG_CODE_LIMITS.perNumberPerDay,
      true,
    ),
  });
  if (!allowed) throw rateLimited('errors.vault.code_paused');

  const citizenId = await citizenWithCloud(ctx.db, mobile);
  let challenge: ChallengeRow | null = null;
  if (citizenId) {
    const { data, error } = await ctx.db
      .from('vault_access_challenges')
      .select('id, code_salt, code_hmac, attempts_left, duration_minutes, allow_copy, expires_at')
      .eq('citizen_id', citizenId)
      .is('consumed_at', null)
      .gt('expires_at', now.toISOString())
      .gt('attempts_left', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    challenge = data as ChallengeRow | null;
  }

  const matches = matchesShareCode(
    code,
    challenge?.code_salt ?? DECOY_SALT,
    challenge?.code_hmac ?? DECOY_HMAC,
  );

  if (!citizenId || !challenge || !matches) {
    if (challenge) {
      await ctx.db
        .from('vault_access_challenges')
        .update({ attempts_left: Math.max(0, challenge.attempts_left - 1) })
        .eq('id', challenge.id);
    }
    await ctx.db.from('vault_unlock_attempts').insert({
      organization_id: ctx.organizationId,
      attempted_by: ctx.operatorId,
      mobile_hmac: hmac,
      succeeded: false,
    });
    await ctx.audit({
      action: 'vault.unlock_failed',
      entityType: 'vault_access_request',
      entityId: null,
    });
    throw permissionDenied('errors.vault.code_wrong');
  }

  // One use: only the caller that flips consumed_at from null mints the grant.
  const { data: consumed, error: consumeError } = await ctx.db
    .from('vault_access_challenges')
    .update({ consumed_at: now.toISOString() })
    .eq('id', challenge.id)
    .is('consumed_at', null)
    .select('id');
  if (consumeError) throw consumeError;
  if (!consumed || consumed.length === 0) throw permissionDenied('errors.vault.code_wrong');

  await ctx.db.from('vault_unlock_attempts').insert({
    organization_id: ctx.organizationId,
    attempted_by: ctx.operatorId,
    mobile_hmac: hmac,
    succeeded: true,
  });

  const grant = await mintGrant(ctx.db, {
    citizenId,
    organizationId: ctx.organizationId,
    centreName: ctx.centreName,
    operatorId: ctx.operatorId,
    method: 'code',
    minutes: challenge.duration_minutes,
    allowCopy: challenge.allow_copy,
    now,
  });
  await ctx.audit({
    action: 'vault.grant_created',
    entityType: 'vault_access_grant',
    entityId: grant.id,
    metadata: {
      method: 'code',
      minutes: challenge.duration_minutes,
      allowCopy: challenge.allow_copy,
    },
  });
  return grantView(grant, now);
}

export type GrantDocumentView = {
  id: string;
  documentType: string;
  category: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
};

const DOCUMENT_COLUMNS =
  'id, citizen_id, document_type, category, title, storage_path, mime_type, size_bytes, page_count, status, deleted_at';

export async function listGrantDocuments(
  ctx: OperatorVaultContext,
  grantId: string,
): Promise<{ grant: GrantView; documents: GrantDocumentView[] }> {
  const now = ctx.now();
  const grant = await liveGrantFor(ctx.db, {
    grantId,
    operatorId: ctx.operatorId,
    organizationId: ctx.organizationId,
    now,
  });
  const { data, error } = await ctx.db
    .from('citizen_vault_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('citizen_id', grant.citizen_id)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  await recordVaultEvent(ctx.db, { action: 'listed', grant, operatorId: ctx.operatorId });
  return {
    grant: grantView(grant, now),
    documents: ((data ?? []) as CitizenVaultDocumentRow[]).map((row) => ({
      id: row.id,
      documentType: row.document_type,
      category: row.category,
      title: row.title,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      pageCount: row.page_count,
    })),
  };
}

export type OpenedVaultFile = { bytes: Buffer; mimeType: string; documentType: string };

/**
 * One document's plaintext for a live grant. Order matters: grant → document → access event →
 * audit → only then the key, the bytes and the decryption. No grant, an expired one, another
 * centre's, or a deleted document: the same 404.
 */
export async function openGrantDocument(
  ctx: OperatorVaultContext,
  grantId: string,
  documentId: string,
  purpose: 'viewed' | 'attached',
): Promise<OpenedVaultFile> {
  const now = ctx.now();
  const grant: VaultAccessGrantRow = await liveGrantFor(ctx.db, {
    grantId,
    operatorId: ctx.operatorId,
    organizationId: ctx.organizationId,
    now,
  });

  const { data, error } = await ctx.db
    .from('citizen_vault_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .eq('citizen_id', grant.citizen_id)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  const document = data as CitizenVaultDocumentRow | null;
  if (!document) throw notFound('errors.vault.grant_missing');

  await recordVaultEvent(ctx.db, {
    action: purpose,
    grant,
    operatorId: ctx.operatorId,
    documentId: document.id,
    documentType: document.document_type,
  });
  await ctx.audit({
    action: 'vault.document_opened',
    entityType: 'vault_access_grant',
    entityId: grant.id,
    metadata: { documentType: document.document_type, purpose },
  });

  const { data: keyRow, error: keyError } = await ctx.db
    .from('citizen_vault_keys')
    .select('wrapped_key')
    .eq('citizen_id', grant.citizen_id)
    .maybeSingle();
  if (keyError) throw keyError;
  const wrapped = (keyRow as { wrapped_key: string } | null)?.wrapped_key;
  if (!wrapped) throw notFound('errors.vault.grant_missing');

  const { data: blob, error: downloadError } = await ctx.db.storage
    .from(VAULT_BUCKET)
    .download(document.storage_path);
  if (downloadError || !blob) throw notFound('errors.vault.grant_missing');

  const sealed = Buffer.from(await blob.arrayBuffer());
  const key = unwrapDocumentKey(grant.citizen_id, wrapped);
  return {
    bytes: openVaultFile(grant.citizen_id, document.id, sealed, key),
    mimeType: document.mime_type,
    documentType: document.document_type,
  };
}

export async function endGrant(ctx: OperatorVaultContext, grantId: string): Promise<void> {
  const now = ctx.now();
  const grant = await liveGrantFor(ctx.db, {
    grantId,
    operatorId: ctx.operatorId,
    organizationId: ctx.organizationId,
    now,
  });
  const { error } = await ctx.db
    .from('vault_access_grants')
    .update({ ended_at: now.toISOString(), ended_by: 'operator' })
    .eq('id', grant.id)
    .is('ended_at', null);
  if (error) throw error;
  await recordVaultEvent(ctx.db, { action: 'ended', grant, operatorId: ctx.operatorId });
  await ctx.audit({
    action: 'vault.grant_ended',
    entityType: 'vault_access_grant',
    entityId: grant.id,
  });
}
