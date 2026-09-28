'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { loadAdminPlan } from '@/lib/admin/plans';
import {
  adminPlanInputSchema,
  changedPlanFields,
  planEditBlockers,
  planInputFromRow,
  toPlanWrite,
} from '@/lib/admin/plan-write';
import { logger } from '@/lib/api/logger';

/**
 * Plan catalogue mutations (spec §6.1 — Super Admin billing overrides; §22).
 *
 * Super admin only, re-checked here: a Server Action is a POST endpoint like any other and has
 * to stand on its own (docs/DEVELOPMENT_RULES.md §4). Every save is audited as critical, because
 * a limit changed here changes what every centre on the plan can do the moment it is saved.
 *
 * The price lock, code immutability and the free plan's protection are checked here for a
 * friendly message, and again by the `plans_guard_update` trigger (migration 0029).
 */

export type PlanActionState = {
  error?: string;
  notice?: string;
  /** Field-level translation keys, keyed by the input's dotted path. */
  fields?: Record<string, string>;
};

const idSchema = z.string().uuid();

/** What the 0029 trigger raises, mapped to the field it concerns. */
const TRIGGER_ERRORS: Record<string, { field: string; key: string }> = {
  plan_price_locked: { field: 'priceMonthlyInr', key: 'admin.plans.priceLocked' },
  plan_code_immutable: { field: 'code', key: 'admin.plans.codeImmutable' },
  plan_default_required: { field: 'active', key: 'admin.plans.defaultPlanRequired' },
};

function parsePlanField(formData: FormData): unknown {
  const raw = formData.get('plan');
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function savePlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.plans.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = adminPlanInputSchema.safeParse(parsePlanField(formData));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_';
      fields[path] ??= path === 'code' ? 'admin.plans.codeHint' : 'admin.plans.invalidValue';
    }
    return { error: 'errors.validation_failed', fields };
  }
  const input = parsed.data;

  const rawId = formData.get('id');
  const existingId = typeof rawId === 'string' && rawId ? rawId : null;
  if (existingId && !idSchema.safeParse(existingId).success) {
    return { error: 'errors.validation_failed' };
  }

  let changed: string[] = [];
  let result;

  if (existingId) {
    const existing = await loadAdminPlan(session.supabase, existingId);
    if (!existing) return { error: 'admin.plans.notFound' };

    const before = planInputFromRow(existing.row);
    const blockers = planEditBlockers(before, input, existing.organizations);
    if (Object.keys(blockers).length > 0) {
      return { error: Object.values(blockers)[0], fields: blockers };
    }

    changed = changedPlanFields(before, input);
    if (changed.length === 0) return { notice: 'admin.plans.noChanges' };

    // `code` is never part of an update; the blocker above has already refused a change to it.
    result = await session.supabase
      .from('plans')
      .update(toPlanWrite(input))
      .eq('id', existingId)
      .select('id')
      .maybeSingle();
  } else {
    result = await session.supabase
      .from('plans')
      .insert({ code: input.code, ...toPlanWrite(input) })
      .select('id')
      .single();
  }

  if (result.error) {
    if (result.error.code === '23505') {
      return { error: 'admin.plans.codeTaken', fields: { code: 'admin.plans.codeTaken' } };
    }
    const guarded = Object.entries(TRIGGER_ERRORS).find(([message]) =>
      result.error?.message.includes(message),
    );
    if (guarded) {
      const [, { field, key }] = guarded;
      return { error: key, fields: { [field]: key } };
    }
    logger.error('platform.plan_save_failed', { code: result.error.code });
    return { error: 'errors.internal' };
  }

  const planId = (result.data as { id: string } | null)?.id ?? existingId;

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: existingId ? 'platform.plan_updated' : 'platform.plan_created',
    entityType: 'plans',
    entityId: planId,
    // Plan settings are reference data, not personal data — but only names of what changed are
    // recorded for updates, so the trail reads as a list of decisions, not a copy of the table.
    metadata: existingId
      ? { code: input.code, changed, active: input.active }
      : { code: input.code, priceMonthlyInr: input.priceMonthlyInr, active: input.active },
  });

  revalidatePath('/admin/plans');
  revalidatePath('/billing');
  if (!existingId && planId) redirect(`/admin/plans/${planId}`);
  return { notice: 'admin.plans.saved' };
}
