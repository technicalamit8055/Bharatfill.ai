/**
 * Operator-principal guards (migration 0037), found in the Citizen Vault bridge audit.
 *
 * F1 — billing_admin must not reach customer document bytes through the Storage API, the same
 *      way it cannot read `documents` rows (spec §18.3). Storage `list` is a select on
 *      storage.objects, so both listing and downloading are checked.
 * F2 — only an operator principal (confirmed email, not anonymous, not tagged
 *      app_metadata.principal = 'citizen') may hold an active centre membership, whichever path
 *      tries to create it: create_organization, accept_invitation, or a service-role insert.
 *
 * Phone numbers use the 99000 test range (docs/DATABASE.md § Seed data). No real citizen data.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSignedInClient,
  createOutsiderClient,
  setupFixture,
  teardownFixture,
  type RlsFixture,
} from './harness';

const BUCKET = 'customer-documents';
const RUN = Math.random().toString(36).slice(2, 8);

let fixture: RlsFixture;
let customerId: string;
let folder: string;
let objectPath: string;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

/** A confirmed-email account tagged as a citizen — what the bridge's citizen sign-up will mint. */
async function createCitizenTaggedUser(admin: SupabaseClient): Promise<{
  id: string;
  email: string;
  client: SupabaseClient;
}> {
  const email = `rls.citizen.${RUN}.${Math.random().toString(36).slice(2, 8)}@assistigo-rls-test.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'AssistigoRlsTest!2026',
    email_confirm: true,
    app_metadata: { principal: 'citizen' },
    user_metadata: { rls_test: true },
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, client: await createSignedInClient(email) };
}

/** A phone-only account, as citizen phone OTP sign-in produces. Never signs in here. */
async function createPhoneOnlyUser(admin: SupabaseClient): Promise<string> {
  const suffix = String(Math.floor(Math.random() * 100_000)).padStart(5, '0');
  const { data, error } = await admin.auth.admin.createUser({
    phone: `+9199000${suffix}`,
    phone_confirm: true,
    user_metadata: { rls_test: true },
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

beforeAll(async () => {
  fixture = await setupFixture();
  const owner = fixture.orgA.usersByRole.owner.client;

  const { data: customer, error: customerError } = await owner
    .from('customers')
    .insert({ organization_id: fixture.orgA.id, full_name: 'Rls Principal Fixture Customer' })
    .select('id')
    .single();
  if (customerError) throw customerError;
  customerId = customer.id as string;

  folder = `org/${fixture.orgA.id}/customer/${customerId}/${randomUUID()}`;
  objectPath = `${folder}/fixture.pdf`;
  const { error: uploadError } = await owner.storage
    .from(BUCKET)
    .upload(objectPath, new Blob(['%PDF-1.4\n% DEMO ONLY\n'], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
    });
  if (uploadError) throw uploadError;
}, 60_000);

afterAll(async () => {
  if (fixture) {
    await fixture.admin.storage.from(BUCKET).remove([objectPath]);
    for (const id of createdOrgIds) {
      await fixture.admin.from('organizations').delete().eq('id', id);
    }
    for (const id of createdUserIds) {
      await fixture.admin.auth.admin.deleteUser(id);
    }
  }
  await teardownFixture(fixture);
});

describe('F1: storage reads follow the document roles', () => {
  it('refuses a billing_admin download of a customer document', async () => {
    const { data, error } = await fixture.orgA.usersByRole.billing_admin.client.storage
      .from(BUCKET)
      .download(objectPath);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('shows a billing_admin nothing when listing a customer folder', async () => {
    const { data } = await fixture.orgA.usersByRole.billing_admin.client.storage
      .from(BUCKET)
      .list(folder);
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a billing_admin a signed URL', async () => {
    const { data, error } = await fixture.orgA.usersByRole.billing_admin.client.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it.each(['owner', 'manager', 'operator', 'viewer'] as const)(
    'still lets a %s download it',
    async (role) => {
      const { data, error } = await fixture.orgA.usersByRole[role].client.storage
        .from(BUCKET)
        .download(objectPath);
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    },
  );

  it('refuses another organization’s owner', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client.storage
      .from(BUCKET)
      .download(objectPath);
    expect(error).not.toBeNull();
  });
});

describe('F2: only operator principals hold an active membership', () => {
  it('still lets an ordinary email account create a centre', async () => {
    const outsider = await createOutsiderClient(fixture.admin);
    const { data: userData } = await outsider.auth.getUser();
    if (userData.user) createdUserIds.push(userData.user.id);

    const { data, error } = await outsider.rpc('create_organization', {
      p_name: `RLS Principal Control ${RUN}`,
    });
    expect(error).toBeNull();
    if (data) createdOrgIds.push((data as { id: string }).id);
  });

  it('refuses create_organization for a citizen-tagged account and leaves no organization', async () => {
    const citizen = await createCitizenTaggedUser(fixture.admin);
    const name = `RLS Citizen Org ${RUN}`;

    const { data, error } = await citizen.client.rpc('create_organization', { p_name: name });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('ASSISTIGO_NOT_OPERATOR_PRINCIPAL');
    expect(data).toBeNull();

    const { data: leftovers } = await fixture.admin
      .from('organizations')
      .select('id')
      .eq('name', name);
    expect(leftovers ?? []).toHaveLength(0);
  });

  it('refuses accept_invitation for a citizen-tagged account', async () => {
    const citizen = await createCitizenTaggedUser(fixture.admin);
    const token = `rls-principal-${RUN}-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { error: inviteError } = await fixture.admin.from('organization_invitations').insert({
      organization_id: fixture.orgA.id,
      email: citizen.email,
      role: 'operator',
      token_hash: tokenHash,
      invited_by: fixture.orgA.usersByRole.owner.id,
    });
    if (inviteError) throw inviteError;

    const { error } = await citizen.client.rpc('accept_invitation', { p_token_hash: tokenHash });
    expect(error).not.toBeNull();

    const { data: memberships } = await fixture.admin
      .from('organization_members')
      .select('id')
      .eq('user_id', citizen.id);
    expect(memberships ?? []).toHaveLength(0);
  });

  it('refuses even a service-role insert of a phone-only account', async () => {
    const phoneUserId = await createPhoneOnlyUser(fixture.admin);
    const { error } = await fixture.admin.from('organization_members').insert({
      organization_id: fixture.orgA.id,
      user_id: phoneUserId,
      role: 'operator',
      status: 'active',
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('ASSISTIGO_NOT_OPERATOR_PRINCIPAL');
  });

  it('refuses reactivating a parked membership for a citizen-tagged account', async () => {
    const citizen = await createCitizenTaggedUser(fixture.admin);
    // A non-active row is not access, so the guard lets it exist…
    const { error: insertError } = await fixture.admin.from('organization_members').insert({
      organization_id: fixture.orgA.id,
      user_id: citizen.id,
      role: 'operator',
      status: 'suspended',
    });
    expect(insertError).toBeNull();

    // …but it can never be switched on.
    const { error } = await fixture.admin
      .from('organization_members')
      .update({ status: 'active' })
      .eq('organization_id', fixture.orgA.id)
      .eq('user_id', citizen.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('ASSISTIGO_NOT_OPERATOR_PRINCIPAL');
  });
});
