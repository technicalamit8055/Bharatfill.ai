/**
 * BharatDoc app accounts as ordinary customers. Migration 0041; docs/VAULT_BRIDGE_DESIGN.md §13.
 *
 * App customers live in one platform organization with no members. Centres reach them only the
 * way they reach any other centre's customer — a live roaming grant — and the one extra thing a
 * grant opens for an app customer is READING the extraction, so the operator at the counter can
 * review it. Review writes go through the server on the service role, so no grant holder gets a
 * write policy here. Fixture names and made-up numbers only.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

const APP_ORG = 'b4a7d0c0-a990-4c1e-8d0c-000000000001';

let fixture: RlsFixture;
let customerId: string;
let documentId: string;
let extractionId: string;

async function readAs(client: RlsFixture['orgB']['usersByRole']['operator']['client']) {
  const [customer, documents, extractions] = await Promise.all([
    client.from('customers').select('id').eq('id', customerId),
    client.from('documents').select('id').eq('id', documentId),
    client.from('document_extractions').select('id').eq('id', extractionId),
  ]);
  return { customer, documents, extractions };
}

beforeAll(async () => {
  fixture = await setupFixture();

  const { data: customer, error: customerError } = await fixture.admin
    .from('customers')
    .insert({ organization_id: APP_ORG, full_name: 'App Fixture Citizen', mobile: '9000000991' })
    .select('id')
    .single();
  if (customerError) throw customerError;
  customerId = customer.id as string;

  const { data: document, error: documentError } = await fixture.admin
    .from('documents')
    .insert({
      organization_id: APP_ORG,
      customer_id: customerId,
      original_filename: 'app-fixture.pdf',
      storage_path: `org/${APP_ORG}/customer/${customerId}/fixture/app-fixture.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 1024,
      status: 'review_required',
    })
    .select('id')
    .single();
  if (documentError) throw documentError;
  documentId = document.id as string;

  const { data: extraction, error: extractionError } = await fixture.admin
    .from('document_extractions')
    .insert({
      organization_id: APP_ORG,
      document_id: documentId,
      provider: 'fixture',
      status: 'needs_review',
    })
    .select('id')
    .single();
  if (extractionError) throw extractionError;
  extractionId = extraction.id as string;
}, 60_000);

afterAll(async () => {
  if (fixture && customerId) {
    await fixture.admin.from('documents').delete().eq('customer_id', customerId);
    await fixture.admin.from('customers').delete().eq('id', customerId);
  }
  await teardownFixture(fixture);
});

describe('the BharatDoc app organization', () => {
  it('exists and refuses every membership, even from the service role', async () => {
    const { data: org } = await fixture.admin.from('organizations').select('id').eq('id', APP_ORG);
    expect(org).toHaveLength(1);

    const { error } = await fixture.admin.from('organization_members').insert({
      organization_id: APP_ORG,
      user_id: fixture.orgA.usersByRole.owner.id,
      role: 'owner',
    });
    expect(error).not.toBeNull();
  });

  it('no centre can create a customer in it', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('customers')
      .insert({ organization_id: APP_ORG, full_name: 'Planted Customer', mobile: '9000000992' });
    expect(error).not.toBeNull();
  });
});

describe('without a grant', () => {
  it('no role at any centre reads the app customer, documents or extraction', async () => {
    for (const org of [fixture.orgA, fixture.orgB]) {
      for (const role of ['owner', 'manager', 'operator', 'viewer'] as const) {
        const { customer, documents, extractions } = await readAs(org.usersByRole[role].client);
        expect(customer.data).toEqual([]);
        expect(documents.data).toEqual([]);
        expect(extractions.data).toEqual([]);
      }
    }
  });

  it('can_review_app_customer is false', async () => {
    const { data } = await fixture.orgB.usersByRole.operator.client.rpc('can_review_app_customer', {
      p_customer_id: customerId,
    });
    expect(data).toBe(false);
  });
});

describe('with a live grant held by an org B operator', () => {
  let grantId: string;

  beforeAll(async () => {
    const { data, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        auth_method: 'app_approval',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    grantId = data.id as string;
  });

  afterAll(async () => {
    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  });

  it('the grant holder reads the customer, the document and — for app customers — the extraction', async () => {
    const { customer, documents, extractions } = await readAs(
      fixture.orgB.usersByRole.operator.client,
    );
    expect(customer.data).toHaveLength(1);
    expect(documents.data).toHaveLength(1);
    expect(extractions.error).toBeNull();
    expect(extractions.data).toHaveLength(1);

    const { data } = await fixture.orgB.usersByRole.operator.client.rpc('can_review_app_customer', {
      p_customer_id: customerId,
    });
    expect(data).toBe(true);
  });

  it('a colleague at the same centre gets nothing from it', async () => {
    const { customer, extractions } = await readAs(fixture.orgB.usersByRole.manager.client);
    expect(customer.data).toEqual([]);
    expect(extractions.data).toEqual([]);
  });

  it('the grant holder still writes nothing directly: profile, values and extraction', async () => {
    const operator = fixture.orgB.usersByRole.operator.client;

    const { data: updated } = await operator
      .from('customers')
      .update({ full_name: 'Changed By Visitor' })
      .eq('id', customerId)
      .select('id');
    expect(updated ?? []).toEqual([]);

    const { error: valueError } = await operator.from('customer_field_values').insert({
      organization_id: APP_ORG,
      customer_id: customerId,
      field_key: 'customer.father_name',
      value_text: 'planted',
    });
    expect(valueError).not.toBeNull();

    const { data: extractionUpdated } = await operator
      .from('document_extractions')
      .update({ status: 'accepted' })
      .eq('id', extractionId)
      .select('id');
    expect(extractionUpdated ?? []).toEqual([]);

    const { data: unchanged } = await fixture.admin
      .from('customers')
      .select('full_name')
      .eq('id', customerId)
      .single();
    expect(unchanged?.full_name).toBe('App Fixture Citizen');
  });

  it('cannot move the app customer into the visiting centre', async () => {
    const { data } = await fixture.orgB.usersByRole.operator.client
      .from('customers')
      .update({ organization_id: fixture.orgB.id })
      .eq('id', customerId)
      .select('id');
    expect(data ?? []).toEqual([]);
  });
});
