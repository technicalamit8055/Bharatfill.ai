'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  LIVE_SUBSCRIPTION_STATUSES,
  decidePlanOverride,
  decideSuspension,
  scrubFreeText,
} from '@assistigo/core';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { requirePlatformSession, type PlatformSession } from '@/lib/admin/session';
import { logger } from '@/lib/api/logger';

/**
 * Tenant management: suspend, reactivate, and set a plan by hand.
 *
 * Super Admin only (`platform.tenants.manage`, `platform.billing.override`), checked here on every
 * call rather than trusted from the page. Each act needs a written reason, is decided by the pure
 * rules in packages/core/src/platform/tenants.ts, and writes a `critical` audit row. The reason is
 * scrubbed of identifier-shaped text before it is stored or audited: it is a note about a centre,
 * and a phone number pasted into it should not become a permanent record.
 *
 * Nothing here reads a tenant's records — only the organization row and its subscription.
 */

export type TenantActionState = { error?: string; notice?: string };

/** Postgres: a column this statement names does not exist — migration 0030 is not applied. */
const UNDEFINED_COLUMN = '42703';
const CHECK_VIOLATION = '23514';

const reasonSchema = z
  .string()
  .trim()
  .min(ADMIN_REASON_MIN, 'admin.tenants.manage.reasonTooShort')
  .max(ADMIN_REASON_MAX, 'admin.tenants.manage.reasonTooLong');

const suspendSchema = z.object({
  id: z.string().uuid(),
  reason: reasonSchema,
  confirm: z.string().trim(),
});

const reactivateSchema = z.object({
  id: z.string().uuid(),
  reason: reasonSchema,
});

const overrideSchema = z.object({
  id: z.string().uuid(),
  planCode: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'errors.validation_failed'),
  reason: reasonSchema,
});

type OrganizationFacts = {
  id: string;
  name: string;
  plan_code: string;
  deleted_at: string | null;
  suspended_at: string | null;
};

async function loadOrganization(
  session: PlatformSession,
  id: string,
): Promise<OrganizationFacts | 'missing' | 'migration'> {
  const { data, error } = await session.supabase
    .from('organizations')
    .select('id, name, plan_code, deleted_at, suspended_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_COLUMN) return 'migration';
    throw error;
  }
  return (data as OrganizationFacts | null) ?? 'missing';
}

function revalidateTenant(id: string) {
  revalidatePath(`/admin/tenants/${id}`);
  revalidatePath('/admin/tenants');
}

const SUSPENSION_ERRORS = {
  already_suspended: 'admin.tenants.manage.alreadySuspended',
  not_suspended: 'admin.tenants.manage.notSuspended',
  deleted: 'admin.tenants.manage.deleted',
} as const;

export async function suspendTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.tenants.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = suspendSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
    confirm: formData.get('confirm') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const organization = await loadOrganization(session, parsed.data.id);
  if (organization === 'migration') return { error: 'admin.tenants.migrationRequired' };
  if (organization === 'missing') return { error: 'admin.tenants.notFound' };

  // Typing the centre's name is the confirmation: the one friction that makes suspending the
  // wrong row of a long list a deliberate act rather than a slipped click.
  if (parsed.data.confirm.toLowerCase() !== organization.name.trim().toLowerCase()) {
    return { error: 'admin.tenants.manage.confirmMismatch' };
  }

  const decision = decideSuspension({
    suspendedAt: organization.suspended_at,
    deletedAt: organization.deleted_at,
    action: 'suspend',
  });
  if (!decision.allowed) return { error: SUSPENSION_ERRORS[decision.reason] };

  const reason = scrubFreeText(parsed.data.reason);
  // `is(suspended_at, null)` makes a double submit, or two staff at once, a no-op instead of a
  // second suspension that overwrites who did it and why.
  const { data, error } = await session.supabase
    .from('organizations')
    .update({
      suspended_at: new Date().toISOString(),
      suspension_reason: reason,
      suspended_by: session.userId,
    })
    .eq('id', organization.id)
    .is('suspended_at', null)
    .select('id');

  if (error) {
    logger.error('platform.tenant_suspend_failed', { code: error.code });
    return {
      error:
        error.code === UNDEFINED_COLUMN ? 'admin.tenants.migrationRequired' : 'errors.internal',
    };
  }
  if (!data || data.length === 0) return { error: SUSPENSION_ERRORS.already_suspended };

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.tenant_suspended',
    entityType: 'organization',
    entityId: organization.id,
    metadata: { reason, planCode: organization.plan_code },
  });

  revalidateTenant(organization.id);
  return { notice: 'admin.tenants.manage.suspendedNotice' };
}

export async function reactivateTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.tenants.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = reactivateSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const organization = await loadOrganization(session, parsed.data.id);
  if (organization === 'migration') return { error: 'admin.tenants.migrationRequired' };
  if (organization === 'missing') return { error: 'admin.tenants.notFound' };

  const decision = decideSuspension({
    suspendedAt: organization.suspended_at,
    deletedAt: organization.deleted_at,
    action: 'reactivate',
  });
  if (!decision.allowed) return { error: SUSPENSION_ERRORS[decision.reason] };

  const { data, error } = await session.supabase
    .from('organizations')
    .update({ suspended_at: null, suspension_reason: null, suspended_by: null })
    .eq('id', organization.id)
    .not('suspended_at', 'is', null)
    .select('id');

  if (error) {
    logger.error('platform.tenant_reactivate_failed', { code: error.code });
    return { error: 'errors.internal' };
  }
  if (!data || data.length === 0) return { error: SUSPENSION_ERRORS.not_suspended };

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.tenant_reactivated',
    entityType: 'organization',
    entityId: organization.id,
    // The suspension's own reason is cleared from the row by this update, so the audit trail is
    // where "suspended because…, lifted because…" survives.
    metadata: { reason: scrubFreeText(parsed.data.reason), suspendedAt: organization.suspended_at },
  });

  revalidateTenant(organization.id);
  return { notice: 'admin.tenants.manage.reactivatedNotice' };
}

const OVERRIDE_ERRORS = {
  same_plan: 'admin.tenants.manage.samePlan',
  plan_retired: 'admin.tenants.manage.planRetired',
  paid_subscription: 'admin.tenants.manage.paidSubscription',
  deleted: 'admin.tenants.manage.deleted',
} as const;

export async function overridePlanAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.billing.override')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = overrideSchema.safeParse({
    id: formData.get('id'),
    planCode: formData.get('planCode'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }

  const organization = await loadOrganization(session, parsed.data.id);
  if (organization === 'migration') return { error: 'admin.tenants.migrationRequired' };
  if (organization === 'missing') return { error: 'admin.tenants.notFound' };

  const [planResult, liveResult] = await Promise.all([
    session.supabase
      .from('plans')
      .select('id, code, active')
      .eq('code', parsed.data.planCode)
      .maybeSingle(),
    session.supabase
      .from('subscriptions')
      .select('id, provider')
      .eq('organization_id', organization.id)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
      .maybeSingle(),
  ]);
  if (planResult.error) throw planResult.error;
  if (liveResult.error) throw liveResult.error;

  const plan = planResult.data as { id: string; code: string; active: boolean } | null;
  if (!plan) return { error: 'errors.plan_not_found' };
  const live = liveResult.data as { id: string; provider: string } | null;

  const decision = decidePlanOverride({
    currentPlanCode: organization.plan_code,
    deletedAt: organization.deleted_at,
    target: { code: plan.code, active: plan.active },
    liveSubscription: live,
  });
  if (!decision.allowed) return { error: OVERRIDE_ERRORS[decision.reason] };

  // A manual subscription has no period end: it lasts until staff change it or the centre buys a
  // plan of its own. `organizations.plan_code` follows through the 0018 sync trigger.
  const row = {
    organization_id: organization.id,
    plan_id: plan.id,
    provider: 'manual' as const,
    status: 'active' as const,
    current_period_start: new Date().toISOString(),
    current_period_end: null,
    cancel_at_period_end: false,
  };

  const { error } =
    decision.mode === 'update' && live
      ? await session.supabase.from('subscriptions').update(row).eq('id', live.id)
      : await session.supabase.from('subscriptions').insert(row);

  if (error) {
    logger.error('platform.tenant_plan_override_failed', { code: error.code });
    // Before 0030 the provider check does not admit `manual`.
    return {
      error: error.code === CHECK_VIOLATION ? 'admin.tenants.migrationRequired' : 'errors.internal',
    };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.tenant_plan_overridden',
    entityType: 'organization',
    entityId: organization.id,
    metadata: {
      fromPlan: organization.plan_code,
      toPlan: plan.code,
      mode: decision.mode,
      reason: scrubFreeText(parsed.data.reason),
    },
  });

  revalidateTenant(organization.id);
  return { notice: 'admin.tenants.manage.planOverriddenNotice' };
}
