/**
 * A citizen locks the centre that created their profile. Migration 0046.
 *
 * Org A created the customer. Once the citizen locks org A (written by the service role, as the
 * server does from the citizen's verified session), org A must still list them — masked, flagged
 * locked — but read nothing of the record, its values, documents or files; may ask for access;
 * cannot remove the lock itself; and a fresh grant reopens the record for the operator it names.
 * Unlocking restores the ordinary home-centre access. Fixture names and made-up numbers only.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

type ListRow = {
  customer_id: string;
  is_linked: boolean;
  is_locked: boolean;
  full_name: string | null;
  given_name: string | null;
  family_initial: string | null;
  has_active_grant: boolean;
};

let fixture: RlsFixture;
let customerId: string;
let grantId: string | null = null;

const operator = () => fixture.orgA.usersByRole.operator;

async function lock() {
  const { error } = await fixture.admin.from('customer_citizen_locks').insert({
    customer_id: customerId,
    organization_id: fixture.orgA.id,
  });
  if (error) throw error;
}

async function unlock() {
  const { error } = await fixture.admin
    .from('customer_citizen_locks')
    .delete()
    .eq('customer_id', customerId);
  if (error) throw error;
}

async function readsCustomer(): Promise<boolean> {
  const { data, error } = await operator()
    .client.from('customers')
    .select('id')
    .eq('id', customerId);
  if (error) throw error;
  return (data ?? []).length === 1;
}

async function listRow(): Promise<ListRow | undefined> {
  const { data, error } = await operator().client.rpc('centre_customer_list', {
    p_organization_id: fixture.orgA.id,
    p_limit: 100,
  });
  if (error) throw error;
  return ((data ?? []) as ListRow[]).find((row) => row.customer_id === customerId);
}

beforeAll(async () => {
  fixture = await setupFixture();
  const { data, error } = await fixture.orgA.usersByRole.owner.client
    .from('customers')
    .insert({
      organization_id: fixture.orgA.id,
      full_name: 'Fixture Locked Person',
      mobile: '9900077788',
    })
    .select('id')
    .single();
  if (error) throw error;
  customerId = data.id as string;

  const { error: valueError } = await fixture.orgA.usersByRole.owner.client
    .from('customer_field_values')
    .insert({
      organization_id: fixture.orgA.id,
      customer_id: customerId,
      field_key: 'customer.father_name',
      value_text: 'Fixture Father',
    });
  if (valueError) throw valueError;
}, 60_000);

afterAll(async () => {
  if (grantId) await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  await teardownFixture(fixture);
});

describe('before any lock', () => {
  it('the creating centre reads its customer as usual', async () => {
    expect(await readsCustomer()).toBe(true);
    expect(await listRow()).toMatchObject({
      is_linked: false,
      is_locked: false,
      full_name: 'Fixture Locked Person',
    });
  });
});

describe('locked by the citizen', () => {
  beforeAll(lock);

  it('stays in the centre’s list, masked and flagged', async () => {
    expect(await listRow()).toMatchObject({
      is_linked: false,
      is_locked: true,
      full_name: null,
      given_name: 'Fixture',
      family_initial: 'P',
      has_active_grant: false,
    });
  });

  it('closes the record and its field values', async () => {
    expect(await readsCustomer()).toBe(false);
    const { data } = await operator()
      .client.from('customer_field_values')
      .select('id')
      .eq('customer_id', customerId);
    expect(data).toEqual([]);
  });

  it('lets the centre ask for access, and no other centre', async () => {
    const { data: mine } = await operator().client.rpc('can_request_customer_access', {
      p_customer_id: customerId,
    });
    expect(mine).toBe(true);
    const { data: theirs } = await fixture.orgB.usersByRole.operator.client.rpc(
      'can_request_customer_access',
      { p_customer_id: customerId },
    );
    expect(theirs).toBe(false);
  });

  it('cannot be removed or forged by the centre', async () => {
    await fixture.orgA.usersByRole.owner.client
      .from('customer_citizen_locks')
      .delete()
      .eq('customer_id', customerId);
    const { data } = await fixture.admin
      .from('customer_citizen_locks')
      .select('customer_id')
      .eq('customer_id', customerId);
    expect(data).toHaveLength(1);

    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('customer_citizen_locks')
      .insert({ customer_id: customerId, organization_id: fixture.orgA.id });
    expect(error).not.toBeNull();
  });

  it('refuses a lock naming another centre', async () => {
    const { error } = await fixture.admin
      .from('customer_citizen_locks')
      .upsert({ customer_id: customerId, organization_id: fixture.orgB.id });
    expect(error?.message).toContain('ASSISTIGO_CITIZEN_LOCK_WRONG_CENTRE');
  });

  it('a fresh grant reopens the record for the operator it names only', async () => {
    const { data, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgA.id,
        granted_to_user_id: operator().id,
        status: 'active',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    grantId = data.id as string;

    expect(await readsCustomer()).toBe(true);
    expect((await listRow())?.has_active_grant).toBe(true);
    const { data: viewer } = await fixture.orgA.usersByRole.viewer.client
      .from('customers')
      .select('id')
      .eq('id', customerId);
    expect(viewer).toEqual([]);
    // Its own record needs no link.
    const { data: links } = await fixture.admin
      .from('customer_roaming_links')
      .select('id')
      .eq('customer_id', customerId);
    expect(links).toEqual([]);

    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
    grantId = null;
  });
});

describe('unlocked again', () => {
  beforeAll(unlock);

  it('restores the ordinary home-centre access', async () => {
    expect(await readsCustomer()).toBe(true);
    expect(await listRow()).toMatchObject({ is_locked: false, full_name: 'Fixture Locked Person' });
  });
});
