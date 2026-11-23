import 'server-only';

import {
  conflict,
  MAX_TRUSTED_CENTRES,
  notFound,
  trustedGrantExpiryFrom,
  type CitizenCentreAccessView,
} from '@assistigo/core';
import type { CustomerAccessGrantRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { writeCentreAudit } from '../vault/grants';

/**
 * The citizen's "Centre access" screen in the BharatDoc app (migration 0042; design §14):
 *
 *   list   every roaming grant over the citizen's customer records from the last 30 days —
 *          live ones first — with the centre's name, the purpose and how it ended.
 *   stop   ends one live grant at once. The centre's next read is refused by RLS.
 *   trust  turns a live grant into a trusted centre (30 days), or renews a trusted one for
 *          another 30 days. Same operator, same centre, same purpose; at most
 *          `MAX_TRUSTED_CENTRES` live at once.
 *
 * "The citizen's customer records" are the live `customers` rows, at any centre, whose mobile is
 * the citizen's verified sign-in number — the same rule that decides which phone an approval
 * request reaches (app-approval.ts). Everything is scoped by that set in the predicate, so a
 * grant id from somewhere else is the same 404 as one that does not exist.
 *
 * Service role throughout (grants have no write policy); the caller has verified the citizen's
 * token. Ids only in audit lines — never a number or a name.
 */

type Db = AssistigoSupabaseClient;

export type CitizenSessionsContext = {
  db: Db;
  citizenId: string;
  /** Verified sign-in number, E.164 without "+" ("919900012345"). Never logged. */
  phone: string | null;
  now: () => Date;
};

const DAY = 24 * 60 * 60_000;
/** How far back ended sessions are shown. A trusted grant lasts exactly this long. */
const HISTORY_DAYS = 30;
/** One mobile number is shared by a family at most; more rows than this is not one person. */
const MAX_CUSTOMER_ROWS = 20;

const GRANT_COLUMNS =
  'id, customer_id, organization_id, granted_to_user_id, purpose, target_scheme_slug, status, ' +
  'auth_method, granted_at, expires_at, revoked_at, revoked_by, consent_record_id';

type GrantRow = Pick<
  CustomerAccessGrantRow,
  | 'id'
  | 'customer_id'
  | 'organization_id'
  | 'granted_to_user_id'
  | 'purpose'
  | 'target_scheme_slug'
  | 'status'
  | 'auth_method'
  | 'granted_at'
  | 'expires_at'
  | 'revoked_at'
  | 'revoked_by'
  | 'consent_record_id'
>;

/** The 10 national digits of a verified Indian number, or null. */
export function nationalMobile(phone: string | null): string | null {
  if (!phone) return null;
  const match = /^91([6-9]\d{9})$/.exec(phone);
  return match ? match[1]! : null;
}

/** Ids of the live customer rows, at any centre, whose mobile is this citizen's number. */
export async function citizenCustomerIds(db: Db, phone: string | null): Promise<string[]> {
  const mobile = nationalMobile(phone);
  if (!mobile) return [];
  const { data, error } = await db
    .from('customers')
    .select('id')
    .eq('mobile_normalized', mobile)
    .is('deleted_at', null)
    .limit(MAX_CUSTOMER_ROWS);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export function isGrantLive(
  grant: Pick<GrantRow, 'status' | 'revoked_at' | 'expires_at'>,
  now: Date,
): boolean {
  return (
    grant.status === 'active' && !grant.revoked_at && Date.parse(grant.expires_at) > now.getTime()
  );
}

/**
 * Live trusted grants over these customers, optionally not counting one (a renewal replaces
 * itself, so it does not need a free slot).
 */
export async function countLiveTrusted(
  db: Db,
  customerIds: readonly string[],
  now: Date,
  exceptGrantId?: string,
): Promise<number> {
  if (customerIds.length === 0) return 0;
  const { data, error } = await db
    .from('customer_access_grants')
    .select('id')
    .in('customer_id', customerIds as string[])
    .eq('auth_method', 'app_trusted')
    .eq('status', 'active')
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .limit(MAX_TRUSTED_CENTRES + 1);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).filter((row) => row.id !== exceptGrantId).length;
}

/** Throws when the citizen already trusts as many centres as allowed. */
export async function assertTrustedSlot(
  db: Db,
  customerIds: readonly string[],
  now: Date,
  exceptGrantId?: string,
): Promise<void> {
  if ((await countLiveTrusted(db, customerIds, now, exceptGrantId)) >= MAX_TRUSTED_CENTRES) {
    throw conflict('errors.roaming_trusted_limit', { max: MAX_TRUSTED_CENTRES });
  }
}

function stateOf(
  grant: GrantRow,
  citizenId: string,
  now: Date,
): CitizenCentreAccessView['state'] | null {
  if (isGrantLive(grant, now)) return 'live';
  if (grant.status === 'revoked' || grant.revoked_at) {
    // Replaced by a trusted grant (`trustCentreAccess`) — the new row is the one to show.
    if (!grant.revoked_by) return null;
    return grant.revoked_by === citizenId ? 'ended_by_you' : 'ended_by_centre';
  }
  return 'expired';
}

export async function listCentreAccess(
  ctx: CitizenSessionsContext,
): Promise<CitizenCentreAccessView[]> {
  const now = ctx.now();
  const customerIds = await citizenCustomerIds(ctx.db, ctx.phone);
  if (customerIds.length === 0) return [];

  const { data, error } = await ctx.db
    .from('customer_access_grants')
    .select(GRANT_COLUMNS)
    .in('customer_id', customerIds)
    .gte('granted_at', new Date(now.getTime() - HISTORY_DAYS * DAY).toISOString())
    .order('granted_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  const grants = (data ?? []) as unknown as GrantRow[];
  if (grants.length === 0) return [];

  const organizationIds = [...new Set(grants.map((grant) => grant.organization_id))];
  const { data: organizations, error: orgError } = await ctx.db
    .from('organizations')
    .select('id, name')
    .in('id', organizationIds);
  if (orgError) throw orgError;
  const names = new Map(
    ((organizations ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );

  const views: CitizenCentreAccessView[] = [];
  for (const grant of grants) {
    const state = stateOf(grant, ctx.citizenId, now);
    if (!state) continue;
    const ended =
      state === 'live'
        ? null
        : state === 'expired'
          ? grant.expires_at
          : (grant.revoked_at ?? grant.expires_at);
    views.push({
      grantId: grant.id,
      centreName: names.get(grant.organization_id) ?? '',
      purpose: grant.purpose,
      targetSchemeSlug: grant.target_scheme_slug,
      trusted: grant.auth_method === 'app_trusted',
      grantedAt: grant.granted_at,
      expiresAt: grant.expires_at,
      state,
      endedAt: ended,
    });
  }
  // Live first (soonest to end first), then the rest newest first.
  return views.sort((a, b) => {
    if ((a.state === 'live') !== (b.state === 'live')) return a.state === 'live' ? -1 : 1;
    if (a.state === 'live') return Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    return Date.parse(b.grantedAt) - Date.parse(a.grantedAt);
  });
}

/** A live grant over one of this citizen's records, or the same 404 for anything else. */
async function liveCitizenGrant(
  ctx: CitizenSessionsContext,
  grantId: string,
  customerIds: readonly string[],
): Promise<GrantRow> {
  const missing = notFound('errors.roaming_grant_missing');
  if (customerIds.length === 0) throw missing;
  const { data, error } = await ctx.db
    .from('customer_access_grants')
    .select(GRANT_COLUMNS)
    .eq('id', grantId)
    .in('customer_id', customerIds as string[])
    .maybeSingle();
  if (error) throw error;
  const grant = data as unknown as GrantRow | null;
  if (!grant || !isGrantLive(grant, ctx.now())) throw missing;
  return grant;
}

/** Stop: the centre loses access at once. */
export async function stopCentreAccess(
  ctx: CitizenSessionsContext,
  grantId: string,
): Promise<void> {
  const now = ctx.now();
  const customerIds = await citizenCustomerIds(ctx.db, ctx.phone);
  const grant = await liveCitizenGrant(ctx, grantId, customerIds);

  const { data, error } = await ctx.db
    .from('customer_access_grants')
    .update({ status: 'revoked', revoked_at: now.toISOString(), revoked_by: ctx.citizenId })
    .eq('id', grant.id)
    .eq('status', 'active')
    .is('revoked_at', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw notFound('errors.roaming_grant_missing');

  // DPDP: withdrawing consent is recorded on the consent itself, not only on the grant.
  if (grant.consent_record_id) {
    const { error: consentError } = await ctx.db
      .from('consent_records')
      .update({ status: 'withdrawn', withdrawn_at: now.toISOString() })
      .eq('id', grant.consent_record_id)
      .eq('status', 'granted');
    if (consentError) throw consentError;
  }

  await writeCentreAudit(ctx.db, {
    organizationId: grant.organization_id,
    action: 'customer.roaming_access_revoked',
    entityType: 'customer_access_grant',
    entityId: grant.id,
    metadata: { by: 'citizen', trusted: grant.auth_method === 'app_trusted' },
  });
}

export type TrustedCentreGrant = { grantId: string; expiresAt: string };

/**
 * Trust (or renew): replaces a live grant with a 30-day one for the same operator, centre,
 * customer and purpose. The old row is claimed first so two taps cannot mint two grants.
 */
export async function trustCentreAccess(
  ctx: CitizenSessionsContext,
  grantId: string,
): Promise<TrustedCentreGrant> {
  const now = ctx.now();
  const customerIds = await citizenCustomerIds(ctx.db, ctx.phone);
  const grant = await liveCitizenGrant(ctx, grantId, customerIds);
  const renewing = grant.auth_method === 'app_trusted';
  await assertTrustedSlot(ctx.db, customerIds, now, renewing ? grant.id : undefined);

  // Claim. `revoked_by` stays null: replaced, not stopped (see `stateOf`).
  const { data: claimed, error: claimError } = await ctx.db
    .from('customer_access_grants')
    .update({ status: 'revoked', revoked_at: now.toISOString() })
    .eq('id', grant.id)
    .eq('status', 'active')
    .is('revoked_at', null)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) throw notFound('errors.roaming_grant_missing');

  const restore = async () => {
    await ctx.db
      .from('customer_access_grants')
      .update({ status: 'active', revoked_at: null })
      .eq('id', grant.id);
  };

  const { data: consent, error: consentError } = await ctx.db
    .from('consent_records')
    .insert({
      organization_id: grant.organization_id,
      customer_id: grant.customer_id,
      consent_subject: 'roaming_access',
      consent_text_version: 'roaming-trusted-v1',
      status: 'granted',
      collected_by: null,
      evidence_json: {
        method: 'app_trusted',
        fromGrantId: grant.id,
        renewal: renewing,
        purpose: grant.purpose,
        targetSchemeSlug: grant.target_scheme_slug,
      },
    })
    .select('id')
    .single();
  if (consentError) {
    await restore();
    throw consentError;
  }

  const expiresAt = trustedGrantExpiryFrom(now);
  const { data: inserted, error: grantError } = await ctx.db
    .from('customer_access_grants')
    .insert({
      customer_id: grant.customer_id,
      organization_id: grant.organization_id,
      granted_to_user_id: grant.granted_to_user_id,
      purpose: grant.purpose,
      target_scheme_slug: grant.target_scheme_slug,
      auth_method: 'app_trusted',
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      consent_record_id: (consent as { id: string }).id,
    })
    .select('id')
    .single();
  if (grantError) {
    await restore();
    throw grantError;
  }
  const newId = (inserted as { id: string }).id;

  // The old grant's consent is superseded by the new one.
  if (grant.consent_record_id) {
    await ctx.db
      .from('consent_records')
      .update({ status: 'withdrawn', withdrawn_at: now.toISOString() })
      .eq('id', grant.consent_record_id)
      .eq('status', 'granted');
  }

  await writeCentreAudit(ctx.db, {
    organizationId: grant.organization_id,
    action: 'customer.roaming_access_granted',
    entityType: 'customer_access_grant',
    entityId: newId,
    metadata: { method: 'app_trusted', renewal: renewing, replacedGrantId: grant.id },
  });
  return { grantId: newId, expiresAt: expiresAt.toISOString() };
}
