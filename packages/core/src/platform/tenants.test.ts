import { describe, expect, it } from 'vitest';
import { decidePlanOverride, decideSuspension, isTenantStatus, tenantStatusOf } from './tenants';

describe('tenantStatusOf', () => {
  it('reads suspension from suspended_at alone', () => {
    expect(tenantStatusOf({ suspended_at: '2026-01-01T00:00:00Z' })).toBe('suspended');
    expect(tenantStatusOf({ suspended_at: null })).toBe('active');
  });

  /** A database without migration 0030 has no column at all; that centre is simply active. */
  it('treats a missing column as active', () => {
    expect(tenantStatusOf({})).toBe('active');
  });

  it('recognises only real statuses', () => {
    expect(isTenantStatus('suspended')).toBe(true);
    expect(isTenantStatus('deleted')).toBe(false);
  });
});

describe('decideSuspension', () => {
  it('suspends an active centre', () => {
    expect(decideSuspension({ suspendedAt: null, deletedAt: null, action: 'suspend' })).toEqual({
      allowed: true,
    });
  });

  it('refuses to suspend twice, so the original reason and actor are not overwritten', () => {
    expect(
      decideSuspension({ suspendedAt: '2026-01-01T00:00:00Z', deletedAt: null, action: 'suspend' }),
    ).toEqual({ allowed: false, reason: 'already_suspended' });
  });

  it('reactivates only a suspended centre', () => {
    expect(
      decideSuspension({
        suspendedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
        action: 'reactivate',
      }),
    ).toEqual({ allowed: true });
    expect(decideSuspension({ suspendedAt: null, deletedAt: null, action: 'reactivate' })).toEqual({
      allowed: false,
      reason: 'not_suspended',
    });
  });

  it('touches no deleted organization', () => {
    for (const action of ['suspend', 'reactivate'] as const) {
      expect(
        decideSuspension({ suspendedAt: null, deletedAt: '2026-01-01T00:00:00Z', action }),
      ).toEqual({ allowed: false, reason: 'deleted' });
    }
  });
});

describe('decidePlanOverride', () => {
  const base = {
    currentPlanCode: 'free',
    deletedAt: null,
    target: { code: 'professional', active: true },
    liveSubscription: null,
  };

  it('inserts a subscription for a centre that has none', () => {
    expect(decidePlanOverride(base)).toEqual({ allowed: true, mode: 'insert' });
  });

  it('updates a mock or manual subscription in place', () => {
    for (const provider of ['mock', 'manual']) {
      expect(decidePlanOverride({ ...base, liveSubscription: { provider } })).toEqual({
        allowed: true,
        mode: 'update',
      });
    }
  });

  /**
   * The billing-safety rule: a paid provider's subscription is the provider's. Rewriting it here
   * would leave the database and the invoice disagreeing until the next webhook undid it.
   */
  it('refuses while a paid provider owns the subscription', () => {
    for (const provider of ['razorpay', 'stripe']) {
      expect(decidePlanOverride({ ...base, liveSubscription: { provider } })).toEqual({
        allowed: false,
        reason: 'paid_subscription',
      });
    }
  });

  it('refuses a provider it does not recognise rather than guessing it is safe', () => {
    expect(decidePlanOverride({ ...base, liveSubscription: { provider: 'paypal' } })).toEqual({
      allowed: false,
      reason: 'paid_subscription',
    });
  });

  it('refuses a retired plan', () => {
    expect(decidePlanOverride({ ...base, target: { code: 'legacy', active: false } })).toEqual({
      allowed: false,
      reason: 'plan_retired',
    });
  });

  it('refuses a no-op onto the current plan', () => {
    expect(decidePlanOverride({ ...base, target: { code: 'free', active: true } })).toEqual({
      allowed: false,
      reason: 'same_plan',
    });
  });

  it('refuses a deleted organization before anything else', () => {
    expect(
      decidePlanOverride({
        ...base,
        deletedAt: '2026-01-01T00:00:00Z',
        liveSubscription: { provider: 'razorpay' },
      }),
    ).toEqual({ allowed: false, reason: 'deleted' });
  });
});
