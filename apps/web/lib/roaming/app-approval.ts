import 'server-only';

import {
  conflict,
  grantExpiryFrom,
  notFound,
  rateLimited,
  ROAMING_APP_REQUEST_TTL_MINUTES,
  TRUSTED_CENTRE_DURATION_MINUTES,
  trustedGrantExpiryFrom,
  type AuditAction,
  type CitizenProfileRequestView,
  type RoamingAppDecisionInput,
  type RoamingAppRequestInput,
  type RoamingAppRequestView,
  type RoamingSessionView,
} from '@assistigo/core';
import type { CustomerAccessGrantRow, CustomerAccessRequestRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { writeCentreAudit } from '../vault/grants';
import { assertTrustedSlot, citizenCustomerIds } from './citizen-sessions';

/**
 * Roaming consent by approval in the BharatDoc app (migration 0039) — the alternative to the
 * OTP in `service.ts`.
 *
 *   operator  asks (no duration), polls until the citizen answers, or cancels.
 *   citizen   sees pending requests (centre + purpose), approves with a duration they pick —
 *             1, 2 or 4 hours, or 30 days to trust the centre (migration 0042) — or denies.
 *
 * Approve mints the same `customer_access_grants` row as a verified OTP, with auth_method
 * `app_approval`, for the operator who asked, at the centre that asked.
 *
 * A request reaches a phone only when the citizen account's verified sign-in number is the
 * customer's mobile, checked when the request is made and again when it is approved (the
 * customer's number may have been edited in between). The operator's view is identical either
 * way: nothing here says whether a person uses the app.
 *
 * Everything runs on the service-role client (the table has no write policy); callers have
 * already proved who is asking. Ids only in audit lines — never a number or a name.
 */

type Db = AssistigoSupabaseClient;

const MINUTE = 60_000;
/** One operator asking one customer more often than this is pestering, not serving. */
const REQUESTS_PER_OPERATOR_PER_15_MIN = 3;
/** Across every centre — stops a customer's phone being flooded with cards. */
const REQUESTS_PER_CUSTOMER_PER_15_MIN = 6;

const GRANT_SESSION_COLUMNS =
  'id, purpose, target_scheme_slug, auth_method, status, revoked_at, granted_at, expires_at';

function toSessionView(
  row: Pick<
    CustomerAccessGrantRow,
    'id' | 'purpose' | 'target_scheme_slug' | 'auth_method' | 'granted_at' | 'expires_at'
  >,
): RoamingSessionView {
  return {
    grantId: row.id,
    purpose: row.purpose,
    targetSchemeSlug: row.target_scheme_slug,
    authMethod: row.auth_method,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Operator side
// ---------------------------------------------------------------------------

export type OperatorApprovalContext = {
  db: Db;
  organizationId: string;
  centreName: string;
  operatorId: string;
  now: () => Date;
  /**
   * This centre may ask: it has the customer linked, or created the record and the citizen
   * locked it (`can_request_customer_access`, 0046; caller's own JWT).
   */
  isLinked: (customerId: string) => Promise<boolean>;
  audit: (entry: {
    action: AuditAction;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

async function countRequestsSince(
  db: Db,
  filters: Record<string, string>,
  since: string,
  cap: number,
): Promise<number> {
  let query = db.from('customer_access_requests').select('id').gte('created_at', since);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query.limit(cap);
  if (error) throw error;
  return (data ?? []).length;
}

export async function requestAppApproval(
  ctx: OperatorApprovalContext,
  customerId: string,
  input: RoamingAppRequestInput,
): Promise<{ requestId: string; expiresAt: string }> {
  const now = ctx.now();
  if (!(await ctx.isLinked(customerId))) throw notFound('errors.not_found');

  const { data: customer, error: customerError } = await ctx.db
    .from('customers')
    .select('id, mobile, deleted_at')
    .eq('id', customerId)
    .maybeSingle();
  if (customerError) throw customerError;
  const row = customer as { id: string; mobile: string | null; deleted_at: string | null } | null;
  if (!row || row.deleted_at) throw notFound('errors.not_found');
  if (!row.mobile) throw conflict('errors.roaming_no_mobile_on_file');

  const since = new Date(now.getTime() - 15 * MINUTE).toISOString();
  const [mine, overall] = await Promise.all([
    countRequestsSince(
      ctx.db,
      { customer_id: customerId, requested_by: ctx.operatorId },
      since,
      REQUESTS_PER_OPERATOR_PER_15_MIN,
    ),
    countRequestsSince(
      ctx.db,
      { customer_id: customerId },
      since,
      REQUESTS_PER_CUSTOMER_PER_15_MIN,
    ),
  ]);
  if (mine >= REQUESTS_PER_OPERATOR_PER_15_MIN || overall >= REQUESTS_PER_CUSTOMER_PER_15_MIN) {
    throw rateLimited('errors.roaming_app_request_rate_limited');
  }

  // Only the newest request from this counter stays answerable.
  const { error: retireError } = await ctx.db
    .from('customer_access_requests')
    .update({ status: 'expired', decided_at: now.toISOString() })
    .eq('customer_id', customerId)
    .eq('requested_by', ctx.operatorId)
    .eq('status', 'pending');
  if (retireError) throw retireError;

  const { data: citizenId, error: lookupError } = await ctx.db.rpc('citizen_id_for_mobile', {
    p_mobile: row.mobile,
  });
  if (lookupError) throw lookupError;

  const { data: inserted, error: insertError } = await ctx.db
    .from('customer_access_requests')
    .insert({
      customer_id: customerId,
      organization_id: ctx.organizationId,
      centre_name: ctx.centreName,
      requested_by: ctx.operatorId,
      citizen_id: typeof citizenId === 'string' ? citizenId : null,
      purpose: input.purpose,
      target_scheme_slug: input.targetSchemeSlug ?? null,
      expires_at: new Date(now.getTime() + ROAMING_APP_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
    })
    .select('id, expires_at')
    .single();
  if (insertError) throw insertError;
  const request = inserted as Pick<CustomerAccessRequestRow, 'id' | 'expires_at'>;

  await ctx.audit({
    action: 'customer.roaming_approval_requested',
    entityType: 'customer',
    entityId: customerId,
    metadata: { purpose: input.purpose, requestId: request.id },
  });
  return { requestId: request.id, expiresAt: request.expires_at };
}

async function operatorRequest(
  ctx: OperatorApprovalContext,
  customerId: string,
  requestId: string,
): Promise<CustomerAccessRequestRow> {
  const { data, error } = await ctx.db
    .from('customer_access_requests')
    .select('*')
    .eq('id', requestId)
    .eq('customer_id', customerId)
    .eq('requested_by', ctx.operatorId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.roaming_request_missing');
  return data as CustomerAccessRequestRow;
}

export async function appApprovalStatus(
  ctx: OperatorApprovalContext,
  customerId: string,
  requestId: string,
): Promise<RoamingAppRequestView> {
  const now = ctx.now();
  const request = await operatorRequest(ctx, customerId, requestId);

  if (request.status === 'approved' && request.grant_id) {
    const { data, error } = await ctx.db
      .from('customer_access_grants')
      .select(GRANT_SESSION_COLUMNS)
      .eq('id', request.grant_id)
      .eq('granted_to_user_id', ctx.operatorId)
      .maybeSingle();
    if (error) throw error;
    const grant = data as CustomerAccessGrantRow | null;
    const live =
      grant !== null &&
      grant.status === 'active' &&
      !grant.revoked_at &&
      new Date(grant.expires_at) > now;
    return live
      ? { status: 'approved', requestId, session: toSessionView(grant) }
      : { status: 'expired', requestId };
  }
  if (request.status === 'denied') return { status: 'denied', requestId };
  if (request.status !== 'pending' || new Date(request.expires_at) <= now) {
    return { status: 'expired', requestId };
  }
  return { status: 'pending', requestId, expiresAt: request.expires_at };
}

/** The operator gave up waiting: the citizen's card goes away and Approve no longer works. */
export async function cancelAppApproval(
  ctx: OperatorApprovalContext,
  customerId: string,
  requestId: string,
): Promise<void> {
  const request = await operatorRequest(ctx, customerId, requestId);
  if (request.status !== 'pending') return;
  const { error } = await ctx.db
    .from('customer_access_requests')
    .update({ status: 'expired', decided_at: ctx.now().toISOString() })
    .eq('id', request.id)
    .eq('status', 'pending');
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Citizen side
// ---------------------------------------------------------------------------

export type CitizenApprovalContext = {
  db: Db;
  citizenId: string;
  /** The verified sign-in number, E.164 without "+" ("919900012345"). Never logged. */
  phone: string | null;
  now: () => Date;
};

export async function listProfileRequests(
  ctx: CitizenApprovalContext,
): Promise<CitizenProfileRequestView[]> {
  const { data, error } = await ctx.db
    .from('customer_access_requests')
    .select('id, centre_name, purpose, expires_at, created_at')
    .eq('citizen_id', ctx.citizenId)
    .eq('status', 'pending')
    .gt('expires_at', ctx.now().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data ?? []) as CustomerAccessRequestRow[]).map((row) => ({
    id: row.id,
    centreName: row.centre_name,
    purpose: row.purpose,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/**
 * The request, if it is pending, addressed to this citizen, and the customer's mobile is still
 * this citizen's verified number. Anything else is the same 404.
 */
async function citizenRequest(
  ctx: CitizenApprovalContext,
  requestId: string,
): Promise<CustomerAccessRequestRow> {
  const missing = notFound('errors.roaming_request_missing');
  const { data, error } = await ctx.db
    .from('customer_access_requests')
    .select('*')
    .eq('id', requestId)
    .eq('citizen_id', ctx.citizenId)
    .eq('status', 'pending')
    .gt('expires_at', ctx.now().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw missing;
  const request = data as CustomerAccessRequestRow;

  const { data: customer, error: customerError } = await ctx.db
    .from('customers')
    .select('id, mobile, deleted_at')
    .eq('id', request.customer_id)
    .maybeSingle();
  if (customerError) throw customerError;
  const row = customer as { mobile: string | null; deleted_at: string | null } | null;
  if (!row || row.deleted_at || !row.mobile || !ctx.phone || ctx.phone !== `91${row.mobile}`) {
    throw missing;
  }
  return request;
}

export type ApprovedProfileRequest = { centreName: string; expiresAt: string };

export async function approveProfileRequest(
  ctx: CitizenApprovalContext,
  requestId: string,
  input: RoamingAppDecisionInput,
): Promise<ApprovedProfileRequest> {
  const now = ctx.now();
  const request = await citizenRequest(ctx, requestId);
  const trusted = input.durationMinutes === TRUSTED_CENTRE_DURATION_MINUTES;
  if (trusted) {
    await assertTrustedSlot(ctx.db, await citizenCustomerIds(ctx.db, ctx.phone), now);
  }

  // Claim first, so two taps (or two phones) cannot mint two grants.
  const { data: claimed, error: claimError } = await ctx.db
    .from('customer_access_requests')
    .update({
      status: 'approved',
      decided_at: now.toISOString(),
      duration_minutes: input.durationMinutes,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) throw notFound('errors.roaming_request_missing');

  const { data: consent, error: consentError } = await ctx.db
    .from('consent_records')
    .insert({
      organization_id: request.organization_id,
      customer_id: request.customer_id,
      consent_subject: 'roaming_access',
      consent_text_version: trusted ? 'roaming-trusted-v1' : 'roaming-app-v1',
      status: 'granted',
      collected_by: request.requested_by,
      evidence_json: {
        method: trusted ? 'app_trusted' : 'app_approval',
        requestId: request.id,
        purpose: request.purpose,
        targetSchemeSlug: request.target_scheme_slug,
        durationMinutes: input.durationMinutes,
      },
    })
    .select('id')
    .single();
  if (consentError) throw consentError;

  const expiresAt = trusted
    ? trustedGrantExpiryFrom(now)
    : grantExpiryFrom(now, input.durationMinutes);
  const { data: grant, error: grantError } = await ctx.db
    .from('customer_access_grants')
    .insert({
      customer_id: request.customer_id,
      organization_id: request.organization_id,
      granted_to_user_id: request.requested_by,
      purpose: request.purpose,
      target_scheme_slug: request.target_scheme_slug,
      auth_method: trusted ? 'app_trusted' : 'app_approval',
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      consent_record_id: (consent as { id: string }).id,
    })
    .select('id')
    .single();
  if (grantError) throw grantError;
  const grantId = (grant as { id: string }).id;

  const { error: linkError } = await ctx.db
    .from('customer_access_requests')
    .update({ grant_id: grantId })
    .eq('id', request.id);
  if (linkError) throw linkError;

  await ctx.db
    .from('customer_roaming_links')
    .update({ last_served_at: now.toISOString() })
    .eq('organization_id', request.organization_id)
    .eq('customer_id', request.customer_id);

  await writeCentreAudit(ctx.db, {
    organizationId: request.organization_id,
    action: 'customer.roaming_access_granted',
    entityType: 'customer_access_grant',
    entityId: grantId,
    metadata: {
      method: trusted ? 'app_trusted' : 'app_approval',
      purpose: request.purpose,
      durationMinutes: input.durationMinutes,
      targetSchemeSlug: request.target_scheme_slug,
    },
  });

  return { centreName: request.centre_name, expiresAt: expiresAt.toISOString() };
}

export async function denyProfileRequest(
  ctx: CitizenApprovalContext,
  requestId: string,
): Promise<void> {
  const request = await citizenRequest(ctx, requestId);
  const { data, error } = await ctx.db
    .from('customer_access_requests')
    .update({ status: 'denied', decided_at: ctx.now().toISOString() })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw notFound('errors.roaming_request_missing');

  await writeCentreAudit(ctx.db, {
    organizationId: request.organization_id,
    action: 'customer.roaming_approval_denied',
    entityType: 'customer',
    entityId: request.customer_id,
    metadata: { requestId: request.id },
  });
}
