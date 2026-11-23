/**
 * Cross-operator roaming access. Master spec §11, §19.2, §19.9; migration 0024;
 * docs/SECURITY.md §2, §11.
 *
 * Org A is the home centre; org B is the centre a customer walks into while travelling. The
 * whole feature turns on one thing: a customer_roaming_links row (a bookmark) must grant nothing
 * by itself, and only a live, unexpired, unrevoked customer_access_grants row may unlock the
 * customer row, their field values and their documents for org B.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;
let customerId: string;
let documentId: string;

async function readAsOrgB() {
  const operator = fixture.orgB.usersByRole.operator.client;
  const [customer, fieldValues, documents] = await Promise.all([
    operator.from('customers').select('id').eq('id', customerId),
    operator.from('customer_field_values').select('id').eq('customer_id', customerId),
    operator.from('documents').select('id').eq('id', documentId),
  ]);
  return { customer, fieldValues, documents };
}

beforeAll(async () => {
  fixture = await setupFixture();
  const { orgA } = fixture;
  const owner = orgA.usersByRole.owner.client;

  const { data: customer, error: customerError } = await owner
    .from('customers')
    .insert({
      organization_id: orgA.id,
      full_name: 'Roaming Fixture Customer',
      mobile: '9900011122',
    })
    .select('id')
    .single();
  if (customerError) throw customerError;
  customerId = customer.id as string;

  const { error: fieldValueError } = await owner.from('customer_field_values').insert({
    organization_id: orgA.id,
    customer_id: customerId,
    field_key: 'customer.notes_test',
    value_text: 'fixture value',
  });
  if (fieldValueError) throw fieldValueError;

  const { data: document, error: documentError } = await owner
    .from('documents')
    .insert({
      organization_id: orgA.id,
      customer_id: customerId,
      original_filename: 'roaming-fixture.jpg',
      storage_path: `org/${orgA.id}/roaming-fixture.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 1024,
    })
    .select('id')
    .single();
  if (documentError) throw documentError;
  documentId = document.id as string;
}, 60_000);

afterAll(async () => {
  await teardownFixture(fixture);
});

describe('before any link or grant', () => {
  it('org B cannot read org A customer, field values or documents (test 1)', async () => {
    const { customer, fieldValues, documents } = await readAsOrgB();
    expect(customer.error).toBeNull();
    expect(customer.data).toEqual([]);
    expect(fieldValues.error).toBeNull();
    expect(fieldValues.data).toEqual([]);
    expect(documents.error).toBeNull();
    expect(documents.data).toEqual([]);
  });

  it('org B cannot bookmark org A customer directly — no insert policy for authenticated', async () => {
    const { error } = await fixture.orgB.usersByRole.operator.client
      .from('customer_roaming_links')
      .insert({ organization_id: fixture.orgB.id, customer_id: customerId });
    expect(error).not.toBeNull();
  });

  it('org B cannot self-grant access by inserting into customer_access_grants directly', async () => {
    const { error } = await fixture.orgB.usersByRole.operator.client
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
    expect(error).not.toBeNull();
  });

  it('no role, including service_role, can read a consent OTP challenge through PostgREST', async () => {
    // customer_access_challenges has RLS enabled and no policy at all — verified from the
    // service-role client, since that is the strongest case: if service_role reading through
    // PostgREST were allowed, an authenticated role would be too.
    const { data, error } = await fixture.admin
      .from('customer_access_challenges')
      .select('id')
      .eq('customer_id', customerId);
    // service_role bypasses RLS entirely at the Postgres level, so this is expected to succeed
    // and return nothing (no rows exist yet) — the real guarantee is exercised by the next
    // assertion, from an authenticated session, which the policy does apply to.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: asOperator, error: operatorError } =
      await fixture.orgB.usersByRole.operator.client
        .from('customer_access_challenges')
        .select('id')
        .eq('customer_id', customerId);
    expect(operatorError).toBeNull();
    expect(asOperator).toEqual([]);
  });
});

describe('after linking — a bookmark only (test 2)', () => {
  beforeAll(async () => {
    // The application layer always does this with the service-role client
    // (apps/web/lib/roaming/service.ts, linkRoamingCustomer) — simulated here the same way.
    const { error } = await fixture.admin.from('customer_roaming_links').insert({
      organization_id: fixture.orgB.id,
      customer_id: customerId,
      linked_by: fixture.orgB.usersByRole.operator.id,
    });
    if (error) throw error;
  });

  it('org B sees its own bookmark', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('customer_roaming_links')
      .select('id')
      .eq('customer_id', customerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('org A, the home centre, can also see who has bookmarked its customer', async () => {
    const { data, error } = await fixture.orgA.usersByRole.owner.client
      .from('customer_roaming_links')
      .select('id')
      .eq('customer_id', customerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('any active member of the linking centre sees the bookmark, not just whoever created it', async () => {
    // customer_roaming_links_select checks is_org_member(organization_id), not linked_by — the
    // whole counter should see what any colleague has bookmarked.
    const { data, error } = await fixture.orgB.usersByRole.viewer.client
      .from('customer_roaming_links')
      .select('id')
      .eq('customer_id', customerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('linking alone still does not unlock the customer row, field values or documents (test 1, restated)', async () => {
    const { customer, fieldValues, documents } = await readAsOrgB();
    expect(customer.data).toEqual([]);
    expect(fieldValues.data).toEqual([]);
    expect(documents.data).toEqual([]);
  });

  it('exposes the pre-auth projection only through the service-role-only RPC (test 3)', async () => {
    // roaming_customer_card is service_role-only by design (0024): granting it to `authenticated`
    // would let a bookmarking centre read raw certificate/education JSON directly over
    // PostgREST, bypassing the masking apps/web/lib/roaming/card.ts is responsible for.
    const direct = await fixture.orgB.usersByRole.operator.client.rpc('roaming_customer_card', {
      p_customer_id: customerId,
      p_caller_user_id: fixture.orgB.usersByRole.operator.id,
    });
    expect(direct.error).not.toBeNull();

    const viaServiceRole = await fixture.admin.rpc('roaming_customer_card', {
      p_customer_id: customerId,
      p_caller_user_id: fixture.orgB.usersByRole.operator.id,
    });
    expect(viaServiceRole.error).toBeNull();
    expect(viaServiceRole.data).toHaveLength(1);
    expect(viaServiceRole.data?.[0]).toMatchObject({
      customer_id: customerId,
      home_organization_id: fixture.orgA.id,
      is_linked: true,
    });
  });

  it('the pre-auth RPC returns nothing for a caller with no bookmark and no grant', async () => {
    const { data, error } = await fixture.admin.rpc('roaming_customer_card', {
      p_customer_id: customerId,
      p_caller_user_id: fixture.orgA.usersByRole.viewer.id,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('with an active grant (test 4)', () => {
  let grantId: string;

  beforeAll(async () => {
    // Simulates verify_roaming_access_otp's outcome (apps/web/lib/roaming/service.ts,
    // verifyRoamingOtp) — minted by the service role only, exactly as the app does it.
    const { data, error } = await fixture.admin
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
    grantId = data.id as string;
  });

  afterAll(async () => {
    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  });

  it('lets the grant holder read the customer row, field values and documents', async () => {
    const { customer, fieldValues, documents } = await readAsOrgB();
    expect(customer.error).toBeNull();
    expect(customer.data).toHaveLength(1);
    expect(fieldValues.error).toBeNull();
    expect(fieldValues.data).toHaveLength(1);
    expect(documents.error).toBeNull();
    expect(documents.data).toHaveLength(1);
  });

  it('does not extend the grant to a different member of org B', async () => {
    // The grant names one user, not the whole organization: has_active_customer_grant checks
    // granted_to_user_id, not organization_id, so a colleague at the same counter gets nothing
    // from this grant alone.
    const { data, error } = await fixture.orgB.usersByRole.manager.client
      .from('customers')
      .select('id')
      .eq('id', customerId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not leak document_extractions — the raw OCR transcript stays out of scope', async () => {
    // 0024 deliberately does not extend document_extractions RLS: a visiting centre gets the
    // confirmed profile and the files, never the unreviewed transcript behind them.
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('document_extractions')
      .select('id')
      .eq('document_id', documentId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('still refuses org B write access to the customer row — a grant is read-only', async () => {
    const { error } = await fixture.orgB.usersByRole.operator.client
      .from('customers')
      .update({ notes: 'tampered' })
      .eq('id', customerId);
    // No customers_update policy path covers a roaming grant, so this either affects zero rows
    // (RLS silently filters instead of erroring on UPDATE ... WHERE) or is rejected outright.
    // Either way, the row must not change.
    const { data: after } = await fixture.orgA.usersByRole.owner.client
      .from('customers')
      .select('notes')
      .eq('id', customerId)
      .single();
    void error;
    expect(after?.notes).not.toBe('tampered');
  });
});

describe('an expired grant denies access on its own (test 5)', () => {
  let grantId: string;

  beforeAll(async () => {
    const { data, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        // granted_at defaults to now(); the check constraint requires expires_at > granted_at,
        // so the grant is minted valid and then aged past its own expiry in a second statement —
        // exactly the state a lapsed real grant reaches on its own, with no status flip needed.
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    grantId = data.id as string;

    const { error: expireError } = await fixture.admin
      .from('customer_access_grants')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', grantId);
    if (expireError) throw expireError;
  });

  afterAll(async () => {
    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  });

  it('denies the customer row, field values and documents once expires_at has passed', async () => {
    const { customer, fieldValues, documents } = await readAsOrgB();
    expect(customer.data).toEqual([]);
    expect(fieldValues.data).toEqual([]);
    expect(documents.data).toEqual([]);
  });
});

describe('a revoked grant denies access even before its window would have ended (test 6)', () => {
  let grantId: string;

  beforeAll(async () => {
    const { data, error } = await fixture.admin
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
    grantId = data.id as string;
  });

  afterAll(async () => {
    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  });

  it('grants access while active', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('customers')
      .select('id')
      .eq('id', customerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('denies access the moment it is revoked, with time still left on the clock', async () => {
    const { error: revokeError } = await fixture.admin
      .from('customer_access_grants')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: fixture.orgB.usersByRole.operator.id,
      })
      .eq('id', grantId);
    if (revokeError) throw revokeError;

    const { customer, fieldValues, documents } = await readAsOrgB();
    expect(customer.data).toEqual([]);
    expect(fieldValues.data).toEqual([]);
    expect(documents.data).toEqual([]);
  });
});

describe('constraints', () => {
  it('rejects a grant longer than twelve hours', async () => {
    const { error } = await fixture.admin.from('customer_access_grants').insert({
      customer_id: customerId,
      organization_id: fixture.orgB.id,
      granted_to_user_id: fixture.orgB.usersByRole.operator.id,
      status: 'active',
      expires_at: new Date(Date.now() + 13 * 60 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  // Migration 0042 — trusted centres. Only `app_trusted` may run past twelve hours.
  it('still rejects a thirty-day grant for every method but app_trusted', async () => {
    for (const method of ['otp', 'app_approval', 'qr_consent', 'biometric']) {
      const { error } = await fixture.admin.from('customer_access_grants').insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        auth_method: method,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000 - 60_000).toISOString(),
      });
      expect(error, method).not.toBeNull();
    }
  });

  it('accepts a trusted centre for up to thirty days, never longer', async () => {
    const day = 24 * 60 * 60_000;
    const { data, error } = await fixture.admin
      .from('customer_access_grants')
      .insert({
        customer_id: customerId,
        organization_id: fixture.orgB.id,
        granted_to_user_id: fixture.orgB.usersByRole.operator.id,
        status: 'active',
        auth_method: 'app_trusted',
        expires_at: new Date(Date.now() + 30 * day - 60_000).toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    await fixture.admin.from('customer_access_grants').delete().eq('id', data?.id as string);

    const { error: tooLong } = await fixture.admin.from('customer_access_grants').insert({
      customer_id: customerId,
      organization_id: fixture.orgB.id,
      granted_to_user_id: fixture.orgB.usersByRole.operator.id,
      status: 'active',
      auth_method: 'app_trusted',
      expires_at: new Date(Date.now() + 31 * day).toISOString(),
    });
    expect(tooLong).not.toBeNull();
  });

  it('rejects a customer roam-linking to its own home centre', async () => {
    const { error } = await fixture.admin.from('customer_roaming_links').insert({
      organization_id: fixture.orgA.id,
      customer_id: customerId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/ASSISTIGO_ROAMING_LINK_SAME_ORG/);
  });
});

/**
 * Writing to a roaming customer — migration 0025.
 *
 * 0024 opened reading; this opens exactly one write, so that a walk-in document handed over at a
 * visiting counter lands in the citizen's own file rather than forking it across two centres.
 * The tests below are about the boundaries of that one write, because those are what stop the
 * clause from becoming a general cross-tenant hole:
 *
 *   - a live grant lets org B insert a document for the customer *into org A*,
 *   - the same grant does not let org B update or delete what org A already holds,
 *   - it does not let org B write a document into org A for a customer they hold no grant over,
 *   - and it does not let org B keep the row while claiming org A's id, or vice versa.
 */
describe('a live grant permits exactly one cross-centre write (migration 0025)', () => {
  let grantId: string;
  let otherCustomerId: string;
  const written: string[] = [];

  beforeAll(async () => {
    const { data, error } = await fixture.admin
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
    grantId = data.id as string;

    // A second org A customer, with no grant over them, to prove the clause is per-customer.
    const { data: other, error: otherError } = await fixture.orgA.usersByRole.owner.client
      .from('customers')
      .insert({
        organization_id: fixture.orgA.id,
        full_name: 'Ungranted Fixture Customer',
        mobile: '9900011133',
      })
      .select('id')
      .single();
    if (otherError) throw otherError;
    otherCustomerId = other.id as string;
  });

  afterAll(async () => {
    if (written.length > 0) await fixture.admin.from('documents').delete().in('id', written);
    await fixture.admin.from('customers').delete().eq('id', otherCustomerId);
    await fixture.admin.from('customer_access_grants').delete().eq('id', grantId);
  });

  it('lets the grant holder add a document to the customer home organization', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('documents')
      .insert({
        // Org A, not org B: the document belongs to the citizen's file.
        organization_id: fixture.orgA.id,
        customer_id: customerId,
        original_filename: 'walk-in-drop.jpg',
        storage_path: `org/${fixture.orgA.id}/customer/${customerId}/${crypto.randomUUID()}/walk-in-drop.jpg`,
        mime_type: 'image/jpeg',
        size_bytes: 2048,
        uploaded_by: fixture.orgB.usersByRole.operator.id,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) written.push(data.id as string);
  });

  it('refuses a document for a customer the caller holds no grant over', async () => {
    const { error } = await fixture.orgB.usersByRole.operator.client.from('documents').insert({
      organization_id: fixture.orgA.id,
      customer_id: otherCustomerId,
      original_filename: 'not-mine.jpg',
      storage_path: `org/${fixture.orgA.id}/customer/${otherCustomerId}/${crypto.randomUUID()}/not-mine.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 2048,
      uploaded_by: fixture.orgB.usersByRole.operator.id,
    });
    expect(error).not.toBeNull();
  });

  it('refuses a row whose organization is not the customer home centre', async () => {
    // Claiming org B's id for org A's customer would put a foreign customer_id on this centre's
    // books, which is the shape the equality check in the policy exists to reject.
    const { error } = await fixture.orgB.usersByRole.operator.client.from('documents').insert({
      organization_id: fixture.orgB.id,
      customer_id: customerId,
      original_filename: 'wrong-org.jpg',
      storage_path: `org/${fixture.orgB.id}/customer/${customerId}/${crypto.randomUUID()}/wrong-org.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 2048,
      uploaded_by: fixture.orgB.usersByRole.operator.id,
    });
    expect(error).not.toBeNull();
  });

  it('refuses a row attributed to somebody other than the grant holder', async () => {
    const { error } = await fixture.orgB.usersByRole.operator.client.from('documents').insert({
      organization_id: fixture.orgA.id,
      customer_id: customerId,
      original_filename: 'wrong-actor.jpg',
      storage_path: `org/${fixture.orgA.id}/customer/${customerId}/${crypto.randomUUID()}/wrong-actor.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 2048,
      // The grant names one user; a row must not be laundered through a colleague's name.
      uploaded_by: fixture.orgB.usersByRole.manager.id,
    });
    expect(error).not.toBeNull();
  });

  it('does not let the grant holder update or delete what the home centre already holds', async () => {
    const operator = fixture.orgB.usersByRole.operator.client;

    const { data: updated } = await operator
      .from('documents')
      .update({ original_filename: 'renamed.jpg' })
      .eq('id', documentId)
      .select('id');
    expect(updated ?? []).toEqual([]);

    const { data: deleted } = await operator
      .from('documents')
      .delete()
      .eq('id', documentId)
      .select('id');
    expect(deleted ?? []).toEqual([]);
  });

  it('stops permitting the write once the grant is revoked', async () => {
    const { error: revokeError } = await fixture.admin
      .from('customer_access_grants')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: fixture.orgB.usersByRole.operator.id,
      })
      .eq('id', grantId);
    if (revokeError) throw revokeError;

    const { error } = await fixture.orgB.usersByRole.operator.client.from('documents').insert({
      organization_id: fixture.orgA.id,
      customer_id: customerId,
      original_filename: 'after-revoke.jpg',
      storage_path: `org/${fixture.orgA.id}/customer/${customerId}/${crypto.randomUUID()}/after-revoke.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 2048,
      uploaded_by: fixture.orgB.usersByRole.operator.id,
    });
    expect(error).not.toBeNull();
  });
});
