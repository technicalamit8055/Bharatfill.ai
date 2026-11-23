/**
 * Roaming customers join the visiting centre's customer list. Migration 0044.
 *
 * Org A is the customer's home centre; org B serves them while they travel. A grant to org B
 * must put the customer in org B's list automatically (no "Link to counter" press), the list
 * must show org B only the masked card for them, and the link must still grant nothing on its
 * own — opening the record needs a live grant every visit. Fixture names and made-up numbers only.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

type ListRow = {
  customer_id: string;
  is_linked: boolean;
  full_name: string | null;
  given_name: string | null;
  family_initial: string | null;
  mobile_last4: string;
  has_active_grant: boolean;
  total_count: number;
};

let fixture: RlsFixture;
let roamingCustomerId: string;
let ownCustomerId: string;
let grantId: string;

async function listAs(role: 'operator' | 'viewer' | 'billing_admin', org: 'orgA' | 'orgB') {
  const { data, error } = await fixture[org].usersByRole[role].client.rpc('centre_customer_list', {
    p_organization_id: fixture[org].id,
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []) as ListRow[];
}

beforeAll(async () => {
  fixture = await setupFixture();

  const { data: roaming, error: roamingError } = await fixture.orgA.usersByRole.owner.client
    .from('customers')
    .insert({
      organization_id: fixture.orgA.id,
      full_name: 'Fixture Kumar Sharma',
      mobile: '9900033344',
    })
    .select('id')
    .single();
  if (roamingError) throw roamingError;
  roamingCustomerId = roaming.id as string;

  const { data: own, error: ownError } = await fixture.orgB.usersByRole.owner.client
    .from('customers')
    .insert({ organization_id: fixture.orgB.id, full_name: 'Own Fixture Customer' })
    .select('id')
    .single();
  if (ownError) throw ownError;
  ownCustomerId = own.id as string;
}, 60_000);

afterAll(async () => {
  if (grantId) await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  await teardownFixture(fixture);
});

describe('before any grant', () => {
  it('org B lists only its own customer', async () => {
    const rows = await listAs('operator', 'orgB');
    expect(rows.map((row) => row.customer_id)).toEqual([ownCustomerId]);
    expect(rows[0]).toMatchObject({ is_linked: false, full_name: 'Own Fixture Customer' });
  });
});

describe('a grant links the customer automatically', () => {
  beforeAll(async () => {
    // Minted by the service role, as every grant path in the app does.
    const { data, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: roamingCustomerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    grantId = data.id as string;
  });

  it('creates the link without anyone pressing "Link to counter"', async () => {
    const { data } = await fixture.admin
      .from('customer_roaming_links')
      .select('organization_id, linked_by')
      .eq('customer_id', roamingCustomerId);
    expect(data).toEqual([
      { organization_id: fixture.orgB.id, linked_by: fixture.orgB.usersByRole.operator.id },
    ]);
  });

  it('lists the customer at org B with the masked card only', async () => {
    const rows = await listAs('operator', 'orgB');
    const linked = rows.find((row) => row.customer_id === roamingCustomerId);
    expect(linked).toMatchObject({
      is_linked: true,
      full_name: null,
      given_name: 'Fixture',
      // First letter of the last word (0044 fixed 0024's last-letter bug).
      family_initial: 'S',
      mobile_last4: '3344',
      has_active_grant: true,
    });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0]?.total_count)).toBe(2);
  });

  it('shows the access as live only to the operator who holds the grant', async () => {
    const rows = await listAs('viewer', 'orgB');
    expect(rows.find((row) => row.customer_id === roamingCustomerId)?.has_active_grant).toBe(false);
  });

  it('never lists another centre’s link at the home centre', async () => {
    const rows = await listAs('operator', 'orgA');
    expect(rows.every((row) => row.is_linked === false)).toBe(true);
    expect(rows.map((row) => row.customer_id)).toContain(roamingCustomerId);
  });

  it('gives a role outside customers_select nothing', async () => {
    expect(await listAs('billing_admin', 'orgB')).toEqual([]);
  });
});

describe('after the visit — listed, approve each visit', () => {
  beforeAll(async () => {
    const { error } = await fixture.admin
      .from('customer_access_grants')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', grantId);
    if (error) throw error;
  });

  it('keeps the customer in org B’s list, locked', async () => {
    const rows = await listAs('operator', 'orgB');
    expect(rows.find((row) => row.customer_id === roamingCustomerId)).toMatchObject({
      is_linked: true,
      has_active_grant: false,
    });
  });

  it('opens nothing: the customer row is unreadable to org B again', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('customers')
      .select('id')
      .eq('id', roamingCustomerId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('a second grant does not make a second link', async () => {
    const { data: again, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: roamingCustomerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const { data } = await fixture.admin
      .from('customer_roaming_links')
      .select('id')
      .eq('customer_id', roamingCustomerId);
    expect(data).toHaveLength(1);
    await fixture.admin
      .from('customer_access_grants')
      .delete()
      .eq('id', again.id as string);
  });
});

describe('roaming_family_initial', () => {
  it.each([
    ['Rahul Kumar', 'K'],
    ['  rahul   kumar  sharma ', 'S'],
    ['Rahul', null],
  ])('%j → %j', async (name, expected) => {
    const { data, error } = await fixture.admin.rpc('roaming_family_initial', {
      p_full_name: name,
    });
    expect(error).toBeNull();
    expect(data).toBe(expected);
  });
});
