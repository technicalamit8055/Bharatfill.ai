import 'server-only';

import { CITIZEN_APP_ORGANIZATION_ID, notFound } from '@assistigo/core';
import { writeCentreAudit } from '../vault/grants';
import { nationalMobile, type CitizenSessionsContext } from './citizen-sessions';

/**
 * "Centres that saved your profile" on the citizen's Centre access screen (migration 0046).
 *
 * A customer a centre created stays in that centre's panel for good. The citizen's one lever is
 * here: lock a centre. Locked, the centre still lists them (masked) and still sees which schemes
 * they qualify for, but the profile, saved values, documents and prepared files close until the
 * citizen approves a new request (app tap or WhatsApp code — a time-boxed grant like any visit)
 * or unlocks the centre again here. Locking also ends any live grant that centre holds over the
 * record.
 *
 * "The citizen's records" are the live `customers` rows at real centres (not the BharatDoc app
 * organization) whose mobile is the citizen's verified sign-in number — the same rule as
 * approvals (app-approval.ts). A customer id outside that set is the same 404 as an unknown one.
 *
 * Service role throughout (locks have no write policy); the caller has verified the citizen's
 * token. Ids only in audit lines.
 */

export type CentreProfileView = {
  customerId: string;
  centreName: string;
  locked: boolean;
  lockedAt: string | null;
};

/** One mobile number is shared by a family at most; more rows than this is not one person. */
const MAX_CUSTOMER_ROWS = 20;

type CustomerRef = { id: string; organization_id: string };

async function citizenCentreRecords(ctx: CitizenSessionsContext): Promise<CustomerRef[]> {
  const mobile = nationalMobile(ctx.phone);
  if (!mobile) return [];
  const { data, error } = await ctx.db
    .from('customers')
    .select('id, organization_id')
    .eq('mobile_normalized', mobile)
    .neq('organization_id', CITIZEN_APP_ORGANIZATION_ID)
    .is('deleted_at', null)
    .limit(MAX_CUSTOMER_ROWS);
  if (error) throw error;
  return (data ?? []) as CustomerRef[];
}

async function citizenCentreRecord(
  ctx: CitizenSessionsContext,
  customerId: string,
): Promise<CustomerRef> {
  const record = (await citizenCentreRecords(ctx)).find((row) => row.id === customerId);
  if (!record) throw notFound('errors.not_found');
  return record;
}

export async function listCentreProfiles(
  ctx: CitizenSessionsContext,
): Promise<CentreProfileView[]> {
  const records = await citizenCentreRecords(ctx);
  if (records.length === 0) return [];

  const [{ data: orgs, error: orgError }, { data: locks, error: lockError }] = await Promise.all([
    ctx.db
      .from('organizations')
      .select('id, name')
      .in('id', [...new Set(records.map((row) => row.organization_id))]),
    ctx.db
      .from('customer_citizen_locks')
      .select('customer_id, locked_at')
      .in(
        'customer_id',
        records.map((row) => row.id),
      ),
  ]);
  if (orgError) throw orgError;
  if (lockError) throw lockError;

  const names = new Map(
    ((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
  );
  const lockedAt = new Map(
    ((locks ?? []) as { customer_id: string; locked_at: string }[]).map((l) => [
      l.customer_id,
      l.locked_at,
    ]),
  );

  return records
    .map((row) => ({
      customerId: row.id,
      centreName: names.get(row.organization_id) ?? '',
      locked: lockedAt.has(row.id),
      lockedAt: lockedAt.get(row.id) ?? null,
    }))
    .sort((a, b) => a.centreName.localeCompare(b.centreName));
}

export async function lockCentreProfile(
  ctx: CitizenSessionsContext,
  customerId: string,
): Promise<void> {
  const now = ctx.now();
  const record = await citizenCentreRecord(ctx, customerId);

  const { error } = await ctx.db.from('customer_citizen_locks').upsert(
    {
      customer_id: record.id,
      organization_id: record.organization_id,
      citizen_id: ctx.citizenId,
      locked_at: now.toISOString(),
    },
    { onConflict: 'customer_id', ignoreDuplicates: true },
  );
  if (error) throw error;

  // A grant that centre holds right now (an earlier re-approval) ends with the lock.
  const { error: revokeError } = await ctx.db
    .from('customer_access_grants')
    .update({ status: 'revoked', revoked_at: now.toISOString(), revoked_by: ctx.citizenId })
    .eq('customer_id', record.id)
    .eq('organization_id', record.organization_id)
    .eq('status', 'active')
    .is('revoked_at', null);
  if (revokeError) throw revokeError;

  await writeCentreAudit(ctx.db, {
    organizationId: record.organization_id,
    action: 'customer.citizen_locked',
    entityType: 'customer',
    entityId: record.id,
    metadata: { by: 'citizen' },
  });
}

export async function unlockCentreProfile(
  ctx: CitizenSessionsContext,
  customerId: string,
): Promise<void> {
  const record = await citizenCentreRecord(ctx, customerId);

  const { error } = await ctx.db
    .from('customer_citizen_locks')
    .delete()
    .eq('customer_id', record.id);
  if (error) throw error;

  await writeCentreAudit(ctx.db, {
    organizationId: record.organization_id,
    action: 'customer.citizen_unlocked',
    entityType: 'customer',
    entityId: record.id,
    metadata: { by: 'citizen' },
  });
}
