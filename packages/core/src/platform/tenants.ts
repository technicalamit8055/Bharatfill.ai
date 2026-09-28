/**
 * Tenant management rules for the Super Admin panel (spec §6.1: "manage organizations, billing
 * overrides").
 *
 * Pure decisions only — the admin actions do the I/O and ask these whether to proceed, so the
 * rules can be tested without a database and cannot drift between the page and the action.
 *
 * Nothing here reads or reveals a tenant's records. Suspension changes whether a centre may act;
 * a plan override changes which limits apply. Both are audited as `critical`.
 */

export const TENANT_STATUSES = ['active', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export function isTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === 'string' && (TENANT_STATUSES as readonly string[]).includes(value);
}

export function tenantStatusOf(organization: { suspended_at?: string | null }): TenantStatus {
  return organization.suspended_at ? 'suspended' : 'active';
}

/**
 * Bounds on the reason a staff member must give. Long enough that "spam" or "test" does not pass
 * as a justification someone can read back in the audit trail; short enough to stay a sentence.
 *
 * The maximum matches `scrubFreeText()`'s cap, because the reason is scrubbed of identifier-shaped
 * text before it is stored or audited. Migration 0030's check constraint is looser (10–500) so a
 * scrubbed string — whose placeholders can run a little longer than what they replaced — always
 * fits.
 */
export const ADMIN_REASON_MIN = 10;
export const ADMIN_REASON_MAX = 200;

export type SuspensionDecision =
  { allowed: true } | { allowed: false; reason: 'already_suspended' | 'not_suspended' | 'deleted' };

export function decideSuspension(input: {
  suspendedAt: string | null;
  deletedAt: string | null;
  action: 'suspend' | 'reactivate';
}): SuspensionDecision {
  if (input.deletedAt) return { allowed: false, reason: 'deleted' };
  if (input.action === 'suspend' && input.suspendedAt) {
    return { allowed: false, reason: 'already_suspended' };
  }
  if (input.action === 'reactivate' && !input.suspendedAt) {
    return { allowed: false, reason: 'not_suspended' };
  }
  return { allowed: true };
}

/** Subscription statuses that count as the centre's current subscription (0007's unique index). */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

/** Providers the panel may overwrite. A paid provider's row belongs to the provider. */
const OVERRIDABLE_PROVIDERS = new Set(['mock', 'manual']);

export type PlanOverrideDecision =
  | { allowed: true; mode: 'insert' | 'update' }
  | { allowed: false; reason: 'same_plan' | 'plan_retired' | 'paid_subscription' | 'deleted' };

/**
 * Whether staff may move a centre onto `target` by hand, and how.
 *
 * Refused while a paid provider (Razorpay, Stripe) owns the live subscription: rewriting that row
 * locally would leave the database claiming one plan while the provider keeps charging for
 * another, and the provider's next webhook would silently undo the override anyway. Change it in
 * the provider's dashboard instead.
 *
 * Refused onto a retired plan, because retiring a plan means it takes no new subscribers — an
 * override is still a new subscriber.
 */
export function decidePlanOverride(input: {
  currentPlanCode: string;
  deletedAt: string | null;
  target: { code: string; active: boolean };
  liveSubscription: { provider: string } | null;
}): PlanOverrideDecision {
  if (input.deletedAt) return { allowed: false, reason: 'deleted' };
  if (!input.target.active) return { allowed: false, reason: 'plan_retired' };
  if (input.target.code === input.currentPlanCode) return { allowed: false, reason: 'same_plan' };

  if (!input.liveSubscription) return { allowed: true, mode: 'insert' };
  if (!OVERRIDABLE_PROVIDERS.has(input.liveSubscription.provider)) {
    return { allowed: false, reason: 'paid_subscription' };
  }
  return { allowed: true, mode: 'update' };
}
