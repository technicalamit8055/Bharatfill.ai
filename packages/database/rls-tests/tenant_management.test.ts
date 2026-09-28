/**
 * Tenant management (migration 0030) holds its rules in the database, not only in the panel.
 * docs/SECURITY.md §2; master spec §6.1.
 *
 * The console suspends centres and sets plans with the service role. What is asserted here is
 * that a tenant's own session — an owner holding a perfectly valid JWT, presented straight to
 * PostgREST — can neither lift a suspension, impose one, nor grant itself a staff-set comp, and
 * cannot call the new tenant-detail RPC at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;

beforeAll(async () => {
  fixture = await setupFixture();
});

afterAll(async () => {
  await teardownFixture(fixture);
});

describe('organization suspension columns', () => {
  it('refuses an owner suspending their own organization', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('organizations')
      .update({
        suspended_at: new Date().toISOString(),
        suspension_reason: 'Owner trying to write the staff column',
      })
      .eq('id', fixture.orgA.id);
    expect(error).not.toBeNull();
  });

  it('refuses an owner lifting a suspension staff imposed', async () => {
    const admin = adminClient();
    const { error: suspendError } = await admin
      .from('organizations')
      .update({
        suspended_at: new Date().toISOString(),
        suspension_reason: 'RLS fixture: suspended by staff',
      })
      .eq('id', fixture.orgB.id);
    expect(suspendError).toBeNull();

    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('organizations')
      .update({ suspended_at: null, suspension_reason: null })
      .eq('id', fixture.orgB.id);
    expect(error).not.toBeNull();

    const { data } = await admin
      .from('organizations')
      .select('suspended_at')
      .eq('id', fixture.orgB.id)
      .single();
    expect(data?.suspended_at).not.toBeNull();

    await admin
      .from('organizations')
      .update({ suspended_at: null, suspension_reason: null })
      .eq('id', fixture.orgB.id);
  });

  it('still lets an owner edit the organization’s ordinary fields', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('organizations')
      .update({ city: 'Lucknow' })
      .eq('id', fixture.orgA.id);
    expect(error).toBeNull();
  });

  it('refuses a suspension with no reason, even from the service role', async () => {
    const { error } = await adminClient()
      .from('organizations')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', fixture.orgA.id);
    expect(error).not.toBeNull();
  });
});

describe('manual subscriptions', () => {
  it('refuses an owner creating a staff-set subscription for their own centre', async () => {
    const { data: plan } = await adminClient()
      .from('plans')
      .select('id')
      .eq('code', 'free')
      .single();

    const { error } = await fixture.orgA.usersByRole.owner.client.from('subscriptions').insert({
      organization_id: fixture.orgA.id,
      plan_id: plan?.id,
      provider: 'manual',
      status: 'active',
    });
    expect(error).not.toBeNull();
  });

  it('lets the service role write one', async () => {
    const admin = adminClient();
    const { data: plan } = await admin.from('plans').select('id').eq('code', 'free').single();
    const { data, error } = await admin
      .from('subscriptions')
      .insert({
        organization_id: fixture.orgB.id,
        plan_id: plan?.id,
        provider: 'manual',
        status: 'active',
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    // And the owner cannot then rewrite it while keeping it marked manual.
    const { error: ownerError } = await fixture.orgB.usersByRole.owner.client
      .from('subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', data?.id);
    expect(ownerError).not.toBeNull();

    await admin.from('subscriptions').delete().eq('id', data?.id);
  });
});

describe('platform_tenant_detail() is service_role only', () => {
  it('refuses a tenant session, even for its own organization', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client.rpc('platform_tenant_detail', {
      org: fixture.orgA.id,
    });
    expect(error).not.toBeNull();
  });

  it('refuses the five-argument platform_tenant_rows() to a tenant session', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client.rpc('platform_tenant_rows', {
      search: null,
      row_limit: 50,
      row_offset: 0,
      status_filter: 'suspended',
      plan_filter: null,
    });
    expect(error).not.toBeNull();
  });

  it('returns metadata and counts — and no contact details — to the service role', async () => {
    const { data, error } = await adminClient().rpc('platform_tenant_detail', {
      org: fixture.orgA.id,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: fixture.orgA.id,
      members: expect.any(Object),
      volumes: expect.any(Object),
    });
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('email');
  });

  it('returns null for an organization that does not exist', async () => {
    const { data, error } = await adminClient().rpc('platform_tenant_detail', {
      org: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
