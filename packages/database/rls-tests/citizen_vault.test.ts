/**
 * Citizen Vault tables (migration 0038, docs/VAULT_BRIDGE_DESIGN.md §5).
 *
 * The shape under test: a citizen reads only their own rows and writes nothing directly;
 * no operator — whatever their role — reads any citizen table or the citizen-vault bucket;
 * secrets (keys, share codes, unlock attempts) are unreadable to every client; time boxes and
 * the append-only access history hold even against the service role.
 *
 * Citizens here are confirmed-email accounts tagged app_metadata.principal = 'citizen', which is
 * what a phone sign-up becomes (checked separately), because the local stack has no SMS sender to
 * sign a phone account in with. Phone numbers use the 99000 test range. No real citizen data.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSignedInClient, setupFixture, teardownFixture, type RlsFixture } from './harness';

const RUN = Math.random().toString(36).slice(2, 8);
const BUCKET = 'citizen-vault';
const FAKE_WRAPPED = 'v1.aXY=.dGFn.Y3Q=';
const FAKE_HMAC = 'a'.repeat(64);

type Citizen = { id: string; client: SupabaseClient };

let fixture: RlsFixture;
let alice: Citizen;
let bob: Citizen;
let aliceDocumentId: string;
let aliceGrantId: string;
const extraUserIds: string[] = [];

async function createCitizen(admin: SupabaseClient, label: string): Promise<Citizen> {
  const email = `rls.citizen.${label}.${RUN}@assistigo-rls-test.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'AssistigoRlsTest!2026',
    email_confirm: true,
    app_metadata: { principal: 'citizen' },
    user_metadata: { rls_test: true },
  });
  if (error) throw error;
  const id = data.user.id;

  const { error: rpcError } = await admin.rpc('create_citizen_account', {
    p_citizen_id: id,
    p_display_name: `Rls Demo Citizen ${label}`,
    p_locale: 'hi',
    p_cloud_enabled: true,
    p_wrapped_key: FAKE_WRAPPED,
    p_pin_hmac: FAKE_HMAC,
    p_platform: 'android',
    p_device_label: null,
    p_terms_version: '2026-11-11',
  });
  if (rpcError) throw rpcError;
  return { id, client: await createSignedInClient(email) };
}

beforeAll(async () => {
  fixture = await setupFixture();
  const { admin } = fixture;
  alice = await createCitizen(admin, 'alice');
  bob = await createCitizen(admin, 'bob');

  aliceDocumentId = randomUUID();
  const { error: docError } = await admin.from('citizen_vault_documents').insert({
    id: aliceDocumentId,
    citizen_id: alice.id,
    document_type: 'marksheet_10',
    category: 'academic',
    title: 'Demo marksheet',
    storage_path: `citizen/${alice.id}/${aliceDocumentId}`,
    mime_type: 'application/pdf',
    size_bytes: 2048,
    status: 'ready',
  });
  if (docError) throw docError;

  const grantedAt = new Date();
  const { data: grant, error: grantError } = await admin
    .from('vault_access_grants')
    .insert({
      citizen_id: alice.id,
      organization_id: fixture.orgA.id,
      centre_name: fixture.orgA.name,
      granted_to_user_id: fixture.orgA.usersByRole.operator.id,
      method: 'code',
      granted_at: grantedAt.toISOString(),
      expires_at: new Date(grantedAt.getTime() + 60 * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (grantError) throw grantError;
  aliceGrantId = (grant as { id: string }).id;

  const { error: eventError } = await admin.from('vault_access_events').insert({
    grant_id: aliceGrantId,
    citizen_id: alice.id,
    organization_id: fixture.orgA.id,
    centre_name: fixture.orgA.name,
    operator_id: fixture.orgA.usersByRole.operator.id,
    document_id: aliceDocumentId,
    document_type: 'marksheet_10',
    action: 'viewed',
  });
  if (eventError) throw eventError;

  const { error: challengeError } = await admin.from('vault_access_challenges').insert({
    citizen_id: alice.id,
    code_salt: randomBytes(16).toString('hex'),
    code_hmac: FAKE_HMAC,
  });
  if (challengeError) throw challengeError;
}, 90_000);

afterAll(async () => {
  if (fixture) {
    for (const id of [alice?.id, bob?.id, ...extraUserIds]) {
      if (id) await fixture.admin.auth.admin.deleteUser(id);
    }
  }
  await teardownFixture(fixture);
});

describe('identity', () => {
  it('tags a phone sign-up as a citizen', async () => {
    const suffix = String(Math.floor(Math.random() * 100_000)).padStart(5, '0');
    const { data, error } = await fixture.admin.auth.admin.createUser({
      phone: `+9199000${suffix}`,
      phone_confirm: true,
      user_metadata: { rls_test: true },
    });
    if (error) throw error;
    extraUserIds.push(data.user.id);
    expect(data.user.app_metadata?.principal).toBe('citizen');
  });

  it('refuses a vault for an operator account, even from the service role', async () => {
    const { error } = await fixture.admin.rpc('create_citizen_account', {
      p_citizen_id: fixture.orgA.usersByRole.operator.id,
      p_display_name: 'Should Not Exist',
      p_locale: 'en',
      p_cloud_enabled: true,
      p_wrapped_key: FAKE_WRAPPED,
      p_pin_hmac: FAKE_HMAC,
      p_platform: 'android',
      p_device_label: null,
      p_terms_version: '2026-11-11',
    });
    expect(error?.message ?? '').toContain('ASSISTIGO_NOT_CITIZEN_PRINCIPAL');
  });

  it('does not let a citizen call the sign-up or lookup RPCs directly', async () => {
    const { error: createError } = await bob.client.rpc('create_citizen_account', {
      p_citizen_id: bob.id,
      p_display_name: 'x',
      p_locale: 'en',
      p_cloud_enabled: true,
      p_wrapped_key: FAKE_WRAPPED,
      p_pin_hmac: FAKE_HMAC,
      p_platform: 'android',
      p_device_label: null,
      p_terms_version: '2026-11-11',
    });
    expect(createError).not.toBeNull();

    const { error: lookupError } = await bob.client.rpc('citizen_id_for_mobile', {
      p_mobile: '9900012345',
    });
    expect(lookupError).not.toBeNull();
  });
});

describe('citizens read only their own rows', () => {
  it('sees their own account, documents, grants and history', async () => {
    const reads = await Promise.all([
      alice.client.from('citizen_accounts').select('id'),
      alice.client.from('citizen_vault_documents').select('id'),
      alice.client.from('vault_access_grants').select('id'),
      alice.client.from('vault_access_events').select('id'),
      alice.client.from('citizen_consent_records').select('id'),
      alice.client.from('citizen_devices').select('id'),
    ]);
    for (const { data, error } of reads) {
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    }
    const { data: accounts } = reads[0]!;
    expect((accounts ?? []).map((row) => (row as { id: string }).id)).toEqual([alice.id]);
  });

  it('sees nothing of another citizen', async () => {
    for (const table of [
      'citizen_vault_documents',
      'vault_access_grants',
      'vault_access_events',
    ] as const) {
      const { data } = await bob.client.from(table).select('id');
      expect(data ?? [], table).toHaveLength(0);
    }
    const { data } = await bob.client.from('citizen_accounts').select('id').eq('id', alice.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot read the secret tables, even its own rows', async () => {
    for (const table of [
      'citizen_vault_keys',
      'vault_access_challenges',
      'vault_unlock_attempts',
    ] as const) {
      const { data } = await alice.client.from(table).select('*');
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  it('cannot write directly — not its account, not a grant, not its history', async () => {
    await alice.client
      .from('citizen_accounts')
      .update({ display_name: 'Changed' })
      .eq('id', alice.id);
    const { data: account } = await fixture.admin
      .from('citizen_accounts')
      .select('display_name')
      .eq('id', alice.id)
      .single();
    expect((account as { display_name: string }).display_name).toBe('Rls Demo Citizen alice');

    const { error: grantError } = await alice.client.from('vault_access_grants').insert({
      citizen_id: alice.id,
      organization_id: fixture.orgB.id,
      centre_name: 'Self-granted',
      granted_to_user_id: fixture.orgB.usersByRole.operator.id,
      method: 'code',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(grantError).not.toBeNull();

    const { error: eventError } = await alice.client
      .from('vault_access_events')
      .insert({ citizen_id: alice.id, action: 'restored' });
    expect(eventError).not.toBeNull();
  });
});

describe('operators read nothing directly', () => {
  it.each(['owner', 'manager', 'operator', 'viewer', 'billing_admin'] as const)(
    'gives a %s no citizen rows, even with a live grant',
    async (role) => {
      const client = fixture.orgA.usersByRole[role].client;
      for (const table of [
        'citizen_accounts',
        'citizen_vault_documents',
        'citizen_devices',
        'citizen_consent_records',
        'vault_access_grants',
        'vault_access_requests',
        'vault_access_events',
        'citizen_vault_keys',
        'vault_access_challenges',
      ] as const) {
        const { data } = await client.from(table).select('*');
        expect(data ?? [], `${role} ${table}`).toHaveLength(0);
      }
    },
  );
});

describe('time boxes', () => {
  it('refuses a grant longer than two hours, even from the service role', async () => {
    const grantedAt = new Date();
    const { error } = await fixture.admin.from('vault_access_grants').insert({
      citizen_id: alice.id,
      organization_id: fixture.orgA.id,
      centre_name: fixture.orgA.name,
      granted_to_user_id: fixture.orgA.usersByRole.operator.id,
      method: 'approval',
      granted_at: grantedAt.toISOString(),
      expires_at: new Date(grantedAt.getTime() + 121 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('refuses a share code that lives longer than fifteen minutes', async () => {
    const createdAt = new Date();
    const { error } = await fixture.admin.from('vault_access_challenges').insert({
      citizen_id: alice.id,
      code_salt: randomBytes(16).toString('hex'),
      code_hmac: FAKE_HMAC,
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + 16 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('refuses a document stored outside its citizen folder', async () => {
    const id = randomUUID();
    const { error } = await fixture.admin.from('citizen_vault_documents').insert({
      id,
      citizen_id: alice.id,
      document_type: 'photo',
      category: 'form_asset',
      title: 'Misplaced',
      storage_path: `citizen/${bob.id}/${id}`,
      mime_type: 'image/jpeg',
      size_bytes: 100,
    });
    expect(error).not.toBeNull();
  });
});

describe('access history is append-only', () => {
  it('refuses edits and deletes, even from the service role', async () => {
    const { data: rows } = await fixture.admin
      .from('vault_access_events')
      .select('id')
      .eq('citizen_id', alice.id)
      .limit(1);
    const id = (rows?.[0] as { id: string } | undefined)?.id;
    expect(id).toBeDefined();

    const { error: updateError } = await fixture.admin
      .from('vault_access_events')
      .update({ action: 'listed' })
      .eq('id', id!);
    expect(updateError?.message ?? '').toContain('ASSISTIGO_VAULT_EVENTS_APPEND_ONLY');

    const { error: deleteError } = await fixture.admin
      .from('vault_access_events')
      .delete()
      .eq('id', id!);
    expect(deleteError?.message ?? '').toContain('ASSISTIGO_VAULT_EVENTS_APPEND_ONLY');
  });

  it('keeps the event, unlinked, when the citizen deletes their account', async () => {
    const temp = await createCitizen(fixture.admin, 'temp');
    const { error: insertError } = await fixture.admin
      .from('vault_access_events')
      .insert({ citizen_id: temp.id, action: 'restored' });
    if (insertError) throw insertError;

    const { error: deleteError } = await fixture.admin.auth.admin.deleteUser(temp.id);
    if (deleteError) throw deleteError;

    const { data } = await fixture.admin
      .from('vault_access_events')
      .select('citizen_id')
      .eq('action', 'restored')
      .is('citizen_id', null);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe('storage bucket citizen-vault', () => {
  it('admits no client upload, list or download — citizen or operator', async () => {
    const path = `citizen/${alice.id}/${aliceDocumentId}`;
    const { error: adminUpload } = await fixture.admin.storage
      .from(BUCKET)
      .upload(path, new Blob([randomBytes(64)], { type: 'application/octet-stream' }), {
        contentType: 'application/octet-stream',
        upsert: true,
      });
    expect(adminUpload).toBeNull();

    for (const client of [alice.client, fixture.orgA.usersByRole.owner.client]) {
      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(`citizen/${alice.id}/${randomUUID()}`, new Blob([randomBytes(8)]), {
          contentType: 'application/octet-stream',
        });
      expect(uploadError).not.toBeNull();

      const { data: listed } = await client.storage.from(BUCKET).list(`citizen/${alice.id}`);
      expect(listed ?? []).toHaveLength(0);

      const { error: downloadError } = await client.storage.from(BUCKET).download(path);
      expect(downloadError).not.toBeNull();
    }

    await fixture.admin.storage.from(BUCKET).remove([path]);
  });
});
