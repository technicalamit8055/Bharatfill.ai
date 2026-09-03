import 'server-only';

import {
  conflict,
  grantExpiryFrom,
  isChallengeUsable,
  maskLast4,
  notFound,
  rateLimited,
  resolveGrantDuration,
  ROAMING_OTP_TTL_MINUTES,
  type RoamingAccessView,
  type RoamingCustomerCard,
  type RoamingLinkInput,
  type RoamingOtpRequestInput,
  type RoamingSchemeSummary,
  type RoamingSessionView,
} from '@assistigo/core';
import type { RequestContext } from '../api/context';
import { writeAuditLog } from '../api/audit';
import { logger } from '../api/logger';
import { buildCustomerSchemeReport, loadScheme } from '../schemes/service';
import { createSupabaseAdminClient, type AssistigoSupabaseClient } from '../supabase/server';
import type {
  CustomerAccessChallengeRow,
  Json,
  RoamingCustomerCardRow,
} from '../supabase/database.types';
import { buildRoamingCard } from './card';
import { dispatchRoamingOtp } from './dispatch';
import {
  formatRoamingOtp,
  generateRoamingOtp,
  hashRoamingOtp,
  matchesRoamingOtp,
  newOtpSalt,
} from './otp';
import { roamingOtpMessage } from './messages';
import { customerRowFromRoamingCard } from './scheme-report';

/** How many of the top eligible schemes the compact roaming view carries (extension banner). */
const TOP_SCHEME_COUNT = 3;

/**
 * Cross-centre roaming access — server-side orchestration.
 * Master spec §11, §19.2, §19.9; migration 0024.
 *
 * Every function here that touches `customer_access_challenges` or `customer_access_grants` uses
 * the service-role client, because those tables carry no INSERT/UPDATE policy for `authenticated`
 * by design (0024 header note 3) — the consent decision must not be self-servable from a stolen
 * or careless operator session. Authorization happens *before* the service role is reached: every
 * exported function assumes the caller already holds `customer.roaming_link` or
 * `customer.roaming_authenticate`, checked by the route handler via `requirePermission`, the same
 * split the Super Admin panel uses (docs/SECURITY.md §2).
 */

// ---------------------------------------------------------------------------
// Search — the platform-wide lookup
// ---------------------------------------------------------------------------

const SEARCH_RESULT_LIMIT = 5;

export async function searchRoamingCustomers(
  context: RequestContext,
  mobile: string,
): Promise<RoamingCustomerCard[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('roaming_customer_search', {
    p_mobile: mobile,
    p_exclude_organization_id: context.organization.id,
    p_limit: SEARCH_RESULT_LIMIT,
  });
  if (error) throw error;

  const rows = (data ?? []) as RoamingCustomerCardRow[];

  await writeAuditLog(context, {
    action: 'customer.roaming_lookup',
    entityType: 'customer',
    metadata: { resultCount: rows.length },
  });

  if (rows.length === 0) return [];

  // The search RPC has no notion of "already linked to the calling centre" — that is a fact
  // about the caller's own bookmarks, read through the caller's own RLS-scoped client.
  const { data: linkRows } = await context.supabase
    .from('customer_roaming_links')
    .select('customer_id')
    .eq('organization_id', context.organization.id)
    .in(
      'customer_id',
      rows.map((row) => row.customer_id),
    );
  const linkedIds = new Set((linkRows ?? []).map((row) => row.customer_id as string));

  return rows.map((row) => buildRoamingCard({ ...row, is_linked: linkedIds.has(row.customer_id) }));
}

// ---------------------------------------------------------------------------
// Link — bookmark a customer found elsewhere
// ---------------------------------------------------------------------------

/** District/state exactly as the SQL projections resolve it: permanent address wins, then current. */
function districtStateFromAddress(addressJson: Json): {
  district: string | null;
  state: string | null;
} {
  const address = (addressJson ?? {}) as {
    permanent?: { district?: string; state?: string };
    current?: { district?: string; state?: string };
  };
  return {
    district: address.permanent?.district ?? address.current?.district ?? null,
    state: address.permanent?.state ?? address.current?.state ?? null,
  };
}

export async function linkRoamingCustomer(
  context: RequestContext,
  input: RoamingLinkInput,
): Promise<RoamingCustomerCard> {
  const admin = createSupabaseAdminClient();

  const { data: customerRow, error } = await admin
    .from('customers')
    .select(
      'id, organization_id, full_name, mobile, address_json, date_of_birth, gender, category, education_json, certificates_json, identity_summary_json, verification_status, deleted_at',
    )
    .eq('id', input.customerId)
    .maybeSingle();
  if (error) throw error;
  if (!customerRow || customerRow.deleted_at) throw notFound('errors.not_found');

  if (customerRow.organization_id === context.organization.id) {
    throw conflict('errors.roaming_link_same_org');
  }

  const { data: linkRow, error: linkError } = await admin
    .from('customer_roaming_links')
    .upsert(
      {
        organization_id: context.organization.id,
        customer_id: input.customerId,
        linked_by: context.userId,
        notes: input.notes ?? null,
        last_served_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,customer_id' },
    )
    .select('id')
    .single();
  if (linkError) throw linkError;

  await writeAuditLog(context, {
    action: 'customer.roaming_linked',
    entityType: 'customer_roaming_link',
    entityId: linkRow.id as string,
    metadata: { customerId: input.customerId },
  });

  const { district, state } = districtStateFromAddress(customerRow.address_json as Json);

  return buildRoamingCard({
    customer_id: customerRow.id,
    home_organization_id: customerRow.organization_id,
    full_name: customerRow.full_name,
    mobile: customerRow.mobile,
    district,
    state,
    date_of_birth: customerRow.date_of_birth,
    gender: customerRow.gender,
    category: customerRow.category,
    education_json: customerRow.education_json as Json,
    certificates_json: customerRow.certificates_json as Json,
    identity_summary_json: customerRow.identity_summary_json as Json,
    verification_status: customerRow.verification_status,
    is_linked: true,
  });
}

// ---------------------------------------------------------------------------
// Access state — what the caller may see right now
// ---------------------------------------------------------------------------

function toSessionView(row: {
  id: string;
  purpose: RoamingSessionView['purpose'];
  target_scheme_slug: string | null;
  auth_method: RoamingSessionView['authMethod'];
  granted_at: string;
  expires_at: string;
}): RoamingSessionView {
  return {
    grantId: row.id,
    purpose: row.purpose,
    targetSchemeSlug: row.target_scheme_slug,
    authMethod: row.auth_method,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

/**
 * The minimal shape `resolveRoamingAccess` needs — deliberately narrower than `RequestContext`
 * so a Server Component page (which has no `Request` and so no full API context, only
 * `PageSession` plus its own Supabase client) can call it too, the same as the customer profile
 * page does. A full `RequestContext` satisfies this structurally; no adapter is needed at either
 * call site.
 */
export type RoamingAccessCaller = {
  supabase: AssistigoSupabaseClient;
  userId: string;
  organization: { id: string };
};

export async function resolveRoamingAccess(
  context: RoamingAccessCaller,
  customerId: string,
): Promise<RoamingAccessView> {
  // RLS-scoped: succeeds for a home-org member and for a live grant holder alike (0024's
  // customers_select policy), so this one query already tells the two apart from "neither".
  const { data: customerRow, error: customerError } = await context.supabase
    .from('customers')
    .select('id, organization_id')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (customerError) throw customerError;

  if (customerRow) {
    if (customerRow.organization_id === context.organization.id) {
      return {
        state: 'home_org',
        card: null,
        session: null,
        challengePending: false,
        topSchemes: null,
      };
    }

    const { data: grantRow, error: grantError } = await context.supabase
      .from('customer_access_grants')
      .select('id, purpose, target_scheme_slug, auth_method, granted_at, expires_at')
      .eq('customer_id', customerId)
      .eq('granted_to_user_id', context.userId)
      .eq('status', 'active')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (grantError) throw grantError;

    return {
      state: 'roaming_active',
      card: null,
      session: grantRow ? toSessionView(grantRow) : null,
      challengePending: false,
      topSchemes: null,
    };
  }

  // Not reachable through customers_select: either this centre has bookmarked the citizen and
  // is waiting on consent, or there is nothing here for this caller at all.
  const { data: linked, error: linkError } = await context.supabase.rpc(
    'has_customer_roaming_link',
    { p_customer_id: customerId },
  );
  if (linkError) throw linkError;
  if (!linked) throw notFound('errors.not_found');

  // Service role only (0024): this function returns the raw name, mobile and certificate JSON,
  // so it must never be reachable with the caller's own JWT — only from here, with the caller's
  // identity already resolved from a verified session and passed in explicitly.
  const admin = createSupabaseAdminClient();
  const { data: cardRows, error: cardError } = await admin.rpc('roaming_customer_card', {
    p_customer_id: customerId,
    p_caller_user_id: context.userId,
  });
  if (cardError) throw cardError;
  const cardRow = ((cardRows ?? []) as RoamingCustomerCardRow[])[0];
  if (!cardRow) throw notFound('errors.not_found');

  const { count } = await admin
    .from('customer_access_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('requested_by', context.userId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString());

  const topSchemes = await topEligibleSchemes(context, cardRow);

  return {
    state: 'roaming_locked',
    card: buildRoamingCard(cardRow),
    session: null,
    challengePending: (count ?? 0) > 0,
    topSchemes,
  };
}

/**
 * The eligibility answer for a `roaming_locked` card, trimmed for the extension banner.
 *
 * Runs the same pure evaluator the dashboard's `CustomerSchemesWidget` uses
 * (`buildCustomerSchemeReport`), against the visiting centre's own catalogue — the schemes this
 * operator actually knows how to sell. A failure here must not break the whole access view: the
 * banner just shows no schemes rather than the page failing to load.
 */
async function topEligibleSchemes(
  context: RoamingAccessCaller,
  cardRow: RoamingCustomerCardRow,
): Promise<RoamingSchemeSummary[]> {
  try {
    const report = await buildCustomerSchemeReport(
      context.supabase,
      context.organization.id,
      customerRowFromRoamingCard(cardRow),
    );
    return [...report.activeOpportunities, ...report.upcomingOpportunities]
      .slice(0, TOP_SCHEME_COUNT)
      .map((match) => ({
        slug: match.scheme.slug,
        title: match.scheme.title,
        estimatedFee: match.estimatedFee,
      }));
  } catch (thrown) {
    logger.warn('roaming.scheme_summary_failed', {
      reason: thrown instanceof Error ? thrown.message : 'unknown',
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Request OTP
// ---------------------------------------------------------------------------

/** A citizen fielding more than this many codes in the window is being harassed, not served. */
const OTP_REQUESTS_PER_WINDOW = 3;
const OTP_REQUEST_WINDOW_MINUTES = 15;

export async function requestRoamingOtp(
  context: RequestContext,
  customerId: string,
  input: RoamingOtpRequestInput,
): Promise<{ mobileLast4: string | null; expiresInSeconds: number }> {
  const admin = createSupabaseAdminClient();

  // Defence in depth: the route only reaches here from the 'roaming_locked' state, which itself
  // requires a bookmark, but this function must stand on its own.
  const { data: linked, error: linkError } = await context.supabase.rpc(
    'has_customer_roaming_link',
    { p_customer_id: customerId },
  );
  if (linkError) throw linkError;
  if (!linked) throw notFound('errors.not_found');

  const { data: customerRow, error: customerError } = await admin
    .from('customers')
    .select('id, mobile, deleted_at')
    .eq('id', customerId)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customerRow || customerRow.deleted_at) throw notFound('errors.not_found');
  if (!customerRow.mobile) throw conflict('errors.roaming_no_mobile_on_file');

  const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from('customer_access_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('requested_by', context.userId)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= OTP_REQUESTS_PER_WINDOW) {
    throw rateLimited('errors.roaming_otp_rate_limited');
  }

  const otp = generateRoamingOtp();
  const salt = newOtpSalt();
  const durationMinutes = resolveGrantDuration(input.durationMinutes);

  const { error: insertError } = await admin.from('customer_access_challenges').insert({
    customer_id: customerId,
    organization_id: context.organization.id,
    requested_by: context.userId,
    purpose: input.purpose,
    target_scheme_slug: input.targetSchemeSlug ?? null,
    duration_minutes: durationMinutes,
    channel: input.channel,
    otp_salt: salt,
    otp_hash: hashRoamingOtp(otp, salt),
  });
  if (insertError) throw insertError;

  let schemeTitle: string | null = null;
  if (input.targetSchemeSlug) {
    try {
      const scheme = await loadScheme(
        context.supabase,
        context.organization.id,
        input.targetSchemeSlug,
      );
      schemeTitle = scheme?.title.en ?? null;
    } catch (thrown) {
      // A scheme lookup failure must not block sending the code — the message just names the
      // purpose instead of the scheme.
      logger.warn('roaming.scheme_lookup_failed', {
        reason: thrown instanceof Error ? thrown.message : 'unknown',
      });
    }
  }

  const message = roamingOtpMessage({
    centreName: context.organization.name,
    purpose: input.purpose,
    schemeTitle,
    otp: formatRoamingOtp(otp),
    durationMinutes,
  });

  await dispatchRoamingOtp(input.channel, customerRow.mobile, message);

  await writeAuditLog(context, {
    action: 'customer.roaming_otp_requested',
    entityType: 'customer',
    entityId: customerId,
    metadata: { purpose: input.purpose, channel: input.channel, durationMinutes },
  });

  return {
    mobileLast4: maskLast4(customerRow.mobile),
    expiresInSeconds: ROAMING_OTP_TTL_MINUTES * 60,
  };
}

// ---------------------------------------------------------------------------
// Verify OTP — mints the grant
// ---------------------------------------------------------------------------

export async function verifyRoamingOtp(
  context: RequestContext,
  customerId: string,
  otp: string,
): Promise<RoamingSessionView> {
  const admin = createSupabaseAdminClient();

  const { data: challenge, error } = await admin
    .from('customer_access_challenges')
    .select('*')
    .eq('customer_id', customerId)
    .eq('requested_by', context.userId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!challenge) throw notFound('errors.roaming_no_challenge');

  const row = challenge as CustomerAccessChallengeRow;

  if (
    !isChallengeUsable({
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      attemptsLeft: row.attempts_left,
    })
  ) {
    throw conflict('errors.roaming_otp_expired');
  }

  if (!(await matchesRoamingOtp(otp, row.otp_salt, row.otp_hash))) {
    const attemptsLeft = Math.max(0, row.attempts_left - 1);
    await admin
      .from('customer_access_challenges')
      .update({
        attempts_left: attemptsLeft,
        ...(attemptsLeft === 0 ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq('id', row.id);
    throw conflict('errors.roaming_otp_incorrect', { attemptsLeft });
  }

  // Consume atomically: `.is('consumed_at', null)` in the same update means a racing second
  // verify (two tabs, a retried request) cannot both mint a grant from one code.
  const { data: consumedRows, error: consumeError } = await admin
    .from('customer_access_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null)
    .select('id');
  if (consumeError) throw consumeError;
  if (!consumedRows || consumedRows.length === 0) throw conflict('errors.roaming_otp_expired');

  const grantedAt = new Date();
  const expiresAt = grantExpiryFrom(grantedAt, row.duration_minutes);

  const { data: consentRow, error: consentError } = await admin
    .from('consent_records')
    .insert({
      organization_id: context.organization.id,
      customer_id: customerId,
      consent_subject: 'roaming_access',
      consent_text_version: 'roaming-otp-v1',
      status: 'granted',
      collected_by: context.userId,
      evidence_json: {
        method: 'otp',
        channel: row.channel,
        purpose: row.purpose,
        targetSchemeSlug: row.target_scheme_slug,
        durationMinutes: row.duration_minutes,
      },
    })
    .select('id')
    .single();
  if (consentError) throw consentError;

  const { data: grantRow, error: grantError } = await admin
    .from('customer_access_grants')
    .insert({
      customer_id: customerId,
      organization_id: context.organization.id,
      granted_to_user_id: context.userId,
      purpose: row.purpose,
      target_scheme_slug: row.target_scheme_slug,
      auth_method: 'otp',
      granted_at: grantedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      consent_record_id: consentRow.id as string,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    })
    .select('id, purpose, target_scheme_slug, auth_method, granted_at, expires_at')
    .single();
  if (grantError) throw grantError;

  // The bookmark predates the visit; a granted session is the moment the visit actually happens.
  await admin
    .from('customer_roaming_links')
    .update({ last_served_at: grantedAt.toISOString() })
    .eq('organization_id', context.organization.id)
    .eq('customer_id', customerId);

  await writeAuditLog(context, {
    action: 'customer.roaming_access_granted',
    entityType: 'customer_access_grant',
    entityId: grantRow.id as string,
    metadata: {
      purpose: row.purpose,
      durationMinutes: row.duration_minutes,
      targetSchemeSlug: row.target_scheme_slug,
    },
  });

  return toSessionView(grantRow);
}

// ---------------------------------------------------------------------------
// Revoke — end the session early
// ---------------------------------------------------------------------------

export async function revokeRoamingAccess(
  context: RequestContext,
  customerId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: revokedRows, error } = await admin
    .from('customer_access_grants')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: context.userId })
    .eq('customer_id', customerId)
    .eq('granted_to_user_id', context.userId)
    .eq('status', 'active')
    .select('id');
  if (error) throw error;
  if (!revokedRows || revokedRows.length === 0) throw notFound('errors.roaming_no_active_session');

  for (const revoked of revokedRows) {
    await writeAuditLog(context, {
      action: 'customer.roaming_access_revoked',
      entityType: 'customer_access_grant',
      entityId: revoked.id as string,
      metadata: {},
    });
  }
}
