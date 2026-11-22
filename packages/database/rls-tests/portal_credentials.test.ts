/**
 * customer_portal_credentials (migration 0036, spec §19.7a).
 *
 * The table holds the logins to citizens' government accounts, so RLS must admit only the
 * counter roles of the customer's own centre — not a viewer, not a billing admin, not another
 * tenant, and not another tenant holding a live roaming grant for the same customer.
 *
 * The ciphertext columns hold placeholder `v1.` strings: these tests exercise policies and
 * constraints, not encryption (that is apps/web/lib/portal-credentials/rows.test.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

const FAKE_CIPHERTEXT = 'v1.aXY=.dGFn.Y3Q=';

let fixture: RlsFixture;
let customerId: string;
let otherCustomerId: string;
let credentialId: string;

function row(organizationId: string, forCustomer: string, portalKey = 'ssc') {
  return {
    organization_id: organizationId,
    customer_id: forCustomer,
    portal_key: portalKey,
    login_id_encrypted: FAKE_CIPHERTEXT,
    login_id_hint: '•••••123',
    password_encrypted: FAKE_CIPHERTEXT,
  };
}

beforeAll(async () => {
  fixture = await setupFixture();
  const owner = fixture.orgA.usersByRole.owner.client;

  const { data: customers, error: customerError } = await owner
    .from('customers')
    .insert([
      { organization_id: fixture.orgA.id, full_name: 'Rls Vault Fixture Customer' },
      { organization_id: fixture.orgA.id, full_name: 'Rls Vault Second Customer' },
    ])
    .select('id');
  if (customerError) throw customerError;
  customerId = customers[0]!.id as string;
  otherCustomerId = customers[1]!.id as string;

  const { data, error } = await fixture.orgA.usersByRole.operator.client
    .from('customer_portal_credentials')
    .insert(row(fixture.orgA.id, customerId))
    .select('id')
    .single();
  if (error) throw error;
  credentialId = data.id as string;
}, 60_000);

afterAll(async () => {
  await teardownFixture(fixture);
});

describe('who can read a saved portal login', () => {
  it('admits the owner, manager and operator of the customer’s own centre', async () => {
    for (const role of ['owner', 'manager', 'operator'] as const) {
      const { data, error } = await fixture.orgA.usersByRole[role].client
        .from('customer_portal_credentials')
        .select('id')
        .eq('id', credentialId);
      expect(error, role).toBeNull();
      expect(data, role).toHaveLength(1);
    }
  });

  it('hides it from a viewer and a billing admin', async () => {
    for (const role of ['viewer', 'billing_admin'] as const) {
      const { data } = await fixture.orgA.usersByRole[role].client
        .from('customer_portal_credentials')
        .select('id')
        .eq('id', credentialId);
      expect(data ?? [], role).toHaveLength(0);
    }
  });

  it('hides it from every role in another centre', async () => {
    for (const role of ['owner', 'manager', 'operator'] as const) {
      const { data } = await fixture.orgB.usersByRole[role].client
        .from('customer_portal_credentials')
        .select('id')
        .eq('id', credentialId);
      expect(data ?? [], role).toHaveLength(0);
    }
  });

  it('stays hidden from another centre holding a live roaming grant for the customer', async () => {
    const { data: grant, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;

    try {
      // The grant does open the customer row (0024)…
      const customer = await fixture.orgB.usersByRole.operator.client
        .from('customers')
        .select('id')
        .eq('id', customerId);
      expect(customer.data).toHaveLength(1);

      // …but never the vault.
      const { data } = await fixture.orgB.usersByRole.operator.client
        .from('customer_portal_credentials')
        .select('id')
        .eq('customer_id', customerId);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await fixture.admin.from('customer_access_grants').delete().eq('id', grant.id);
    }
  });
});

describe('who can write one', () => {
  it('blocks a viewer from saving a login', async () => {
    const { error } = await fixture.orgA.usersByRole.viewer.client
      .from('customer_portal_credentials')
      .insert(row(fixture.orgA.id, otherCustomerId, 'upsc'));
    expect(error).not.toBeNull();
  });

  it('blocks another centre from saving a login under this centre', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('customer_portal_credentials')
      .insert(row(fixture.orgA.id, otherCustomerId, 'upsc'));
    expect(error).not.toBeNull();
  });

  it('blocks a row in your own centre that points at another centre’s customer', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('customer_portal_credentials')
      .insert(row(fixture.orgB.id, customerId, 'upsc'));
    expect(error).not.toBeNull();
  });

  it('refuses to move a row to a different customer', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('customer_portal_credentials')
      .update({ customer_id: otherCustomerId })
      .eq('id', credentialId);
    expect(error).not.toBeNull();
  });
});

describe('constraints', () => {
  it('refuses a plaintext login ID', async () => {
    const { error } = await fixture.orgA.usersByRole.operator.client
      .from('customer_portal_credentials')
      .insert({ ...row(fixture.orgA.id, otherCustomerId, 'bpsc'), login_id_encrypted: 'TEST123' });
    expect(error).not.toBeNull();
  });

  it('keeps one login per catalogued portal per customer', async () => {
    const { error } = await fixture.orgA.usersByRole.operator.client
      .from('customer_portal_credentials')
      .insert(row(fixture.orgA.id, customerId, 'ssc'));
    expect(error).not.toBeNull();
  });

  it('requires a label for `other`, and only for `other`', async () => {
    const operator = fixture.orgA.usersByRole.operator.client;
    const missing = await operator
      .from('customer_portal_credentials')
      .insert(row(fixture.orgA.id, otherCustomerId, 'other'));
    expect(missing.error).not.toBeNull();

    const stray = await operator
      .from('customer_portal_credentials')
      .insert({ ...row(fixture.orgA.id, otherCustomerId, 'uppsc'), portal_label: 'x' });
    expect(stray.error).not.toBeNull();
  });
});
