/**
 * Platform admin infrastructure is unreachable from a tenant session.
 * Migration 0021; docs/SECURITY.md §2; master spec §6.1.
 *
 * The Super Admin panel authorises in its route handlers and then acts with the service role,
 * which bypasses RLS. That makes these tables' policies — or rather, their deliberate absence —
 * the second gate, and the only one that still holds if the application layer is wrong. What is
 * asserted here is that a signed-in tenant user, presenting a perfectly valid JWT straight to
 * PostgREST, can read and write none of it.
 *
 * The one exception is `platform_admins`, where a user may read their OWN row and nobody else's,
 * so that a client can learn "am I staff?" without the roster of internal staff being enumerable.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  createOutsiderClient,
  setupFixture,
  teardownFixture,
  type RlsFixture,
} from './harness';

let fixture: RlsFixture;
let sourceId: string;
let queueId: string;
let runId: string;
/** A roster row belonging to somebody else, for the enumeration test. */
let otherAdminRowId: string;

beforeAll(async () => {
  fixture = await setupFixture();
  const admin = adminClient();

  // Org B's owner is made internal staff so there is a roster row that org A's owner must not be
  // able to see. Nothing about being staff should make their tenant session more powerful.
  const staffUser = fixture.orgB.usersByRole.owner;
  const { data: rosterRow, error: rosterError } = await admin
    .from('platform_admins')
    .insert({
      user_id: staffUser.id,
      role: 'content_manager',
      email: staffUser.email,
      is_active: true,
    })
    .select('id')
    .single();
  if (rosterError) throw rosterError;
  otherAdminRowId = rosterRow.id as string;

  const { data: source, error: sourceError } = await admin
    .from('scraper_sources')
    .insert({
      slug: `rls-fixture-source-${Date.now()}`,
      name: 'RLS fixture source',
      portal_name: 'Fixture portal',
      source_url: 'https://ssc.gov.in/fixture',
      fetcher: 'fixture',
    })
    .select('id')
    .single();
  if (sourceError) throw sourceError;
  sourceId = source.id as string;

  const { data: run, error: runError } = await admin
    .from('scraper_runs')
    .insert({ source_id: sourceId, status: 'succeeded', finished_at: new Date().toISOString() })
    .select('id')
    .single();
  if (runError) throw runError;
  runId = run.id as string;

  const { data: queueItem, error: queueError } = await admin
    .from('scraped_schemes_queue')
    .insert({
      source_id: sourceId,
      run_id: runId,
      slug: 'rls-fixture-scheme',
      category: 'welfare',
      payload: { slug: 'rls-fixture-scheme' },
      proposed_changes: [],
      change_kind: 'new',
      status: 'pending',
      source_url: 'https://ssc.gov.in/fixture',
      content_hash: 'abcdef0123456789',
    })
    .select('id')
    .single();
  if (queueError) throw queueError;
  queueId = queueItem.id as string;
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  // scraper_runs and scraped_schemes_queue cascade from the source.
  if (sourceId) await admin.from('scraper_sources').delete().eq('id', sourceId);
  if (otherAdminRowId) await admin.from('platform_admins').delete().eq('id', otherAdminRowId);
  await teardownFixture(fixture);
});

describe('platform tables are invisible to tenant sessions', () => {
  const TABLES = ['scraper_sources', 'scraper_runs', 'scraped_schemes_queue'] as const;

  for (const table of TABLES) {
    it(`returns no rows from ${table} for an org owner`, async () => {
      const { data, error } = await fixture.orgA.usersByRole.owner.client.from(table).select('*');
      // RLS with no SELECT policy denies by returning nothing, not by erroring.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`refuses an insert into ${table} from an org owner`, async () => {
      const { error } = await fixture.orgA.usersByRole.owner.client
        .from(table)
        .insert({ slug: 'should-not-exist' });
      expect(error).not.toBeNull();
    });
  }

  it('refuses an update to a scraper source from an org owner', async () => {
    const { error, count } = await fixture.orgA.usersByRole.owner.client
      .from('scraper_sources')
      .update({ is_enabled: false }, { count: 'exact' })
      .eq('id', sourceId);

    // With no UPDATE policy the row is simply not visible to modify: zero rows affected.
    expect(error ?? { code: 'no-rows' }).toBeTruthy();
    expect(count ?? 0).toBe(0);

    // And it really did not change.
    const { data } = await adminClient()
      .from('scraper_sources')
      .select('is_enabled')
      .eq('id', sourceId)
      .single();
    expect(data?.is_enabled).toBe(true);
  });

  it('refuses a delete of a queue item from an org owner', async () => {
    await fixture.orgA.usersByRole.owner.client
      .from('scraped_schemes_queue')
      .delete()
      .eq('id', queueId);

    const { data } = await adminClient()
      .from('scraped_schemes_queue')
      .select('id')
      .eq('id', queueId)
      .maybeSingle();
    expect(data?.id).toBe(queueId);
  });

  it('returns nothing to an anonymous caller', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    for (const table of TABLES) {
      const { data } = await anon.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
  });
});

describe('platform_admins', () => {
  it('lets a user read their own roster row', async () => {
    const staff = fixture.orgB.usersByRole.owner;
    const { data, error } = await staff.client.from('platform_admins').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(staff.id);
  });

  it('shows a non-staff user an empty roster rather than an error', async () => {
    const { data, error } = await fixture.orgA.usersByRole.owner.client
      .from('platform_admins')
      .select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not let staff enumerate the rest of the roster', async () => {
    // The self-read policy is a self-read, not a foothold: asking for somebody else's row by id
    // still returns nothing.
    const { data } = await fixture.orgB.usersByRole.owner.client
      .from('platform_admins')
      .select('*')
      .eq('id', otherAdminRowId)
      .neq('user_id', fixture.orgB.usersByRole.owner.id);
    expect(data ?? []).toEqual([]);
  });

  it('refuses a user granting themselves platform access', async () => {
    // The whole privilege-escalation question in one assertion.
    const attacker = fixture.orgA.usersByRole.owner;
    const { error } = await attacker.client.from('platform_admins').insert({
      user_id: attacker.id,
      role: 'super_admin',
      email: attacker.email,
      is_active: true,
    });
    expect(error).not.toBeNull();

    const { data } = await adminClient()
      .from('platform_admins')
      .select('id')
      .eq('user_id', attacker.id);
    expect(data ?? []).toEqual([]);
  });

  it('refuses staff promoting themselves to super_admin', async () => {
    const staff = fixture.orgB.usersByRole.owner;
    await staff.client
      .from('platform_admins')
      .update({ role: 'super_admin' })
      .eq('user_id', staff.id);

    const { data } = await adminClient()
      .from('platform_admins')
      .select('role')
      .eq('user_id', staff.id)
      .single();
    expect(data?.role).toBe('content_manager');
  });

  it('refuses an outsider with no organization', async () => {
    const outsider = await createOutsiderClient(adminClient());
    const { data } = await outsider.from('platform_admins').select('*');
    expect(data ?? []).toEqual([]);
  });
});

describe('platform analytics RPCs are service_role only', () => {
  it('refuses platform_metrics() to a tenant session', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client.rpc('platform_metrics', {
      window_days: 30,
    });
    expect(error).not.toBeNull();
  });

  it('refuses platform_tenant_rows() to a tenant session', async () => {
    // This is the one that would leak every centre's name and volumes at once.
    const { error } = await fixture.orgA.usersByRole.owner.client.rpc('platform_tenant_rows', {
      search: null,
      row_limit: 50,
      row_offset: 0,
    });
    expect(error).not.toBeNull();
  });

  it('refuses platform_metrics() to staff holding only a tenant session', async () => {
    // Being on the roster does not upgrade the anon-key JWT they browse with.
    const { error } = await fixture.orgB.usersByRole.owner.client.rpc('platform_metrics', {
      window_days: 30,
    });
    expect(error).not.toBeNull();
  });

  it('returns counts to the service role', async () => {
    const { data, error } = await adminClient().rpc('platform_metrics', { window_days: 30 });
    expect(error).toBeNull();
    expect(data).toMatchObject({ tenants: expect.any(Object), usage: expect.any(Object) });
  });
});

describe('the global scheme catalogue stays service_role only for writes', () => {
  it('refuses an org owner creating a platform-wide scheme', async () => {
    // `schemes_catalog_write` requires organization_id is not null. A tenant owner writing a
    // global row would be publishing to every centre in the country.
    const { error } = await fixture.orgA.usersByRole.owner.client.from('schemes_catalog').insert({
      organization_id: null,
      slug: `rls-escalation-${Date.now()}`,
      category: 'welfare',
      title: { en: 'Escalation', hi: 'एस्केलेशन' },
      short_description: { en: 'x', hi: 'x' },
      benefits_summary: { en: 'x', hi: 'x' },
      benefit_highlight: { en: 'x', hi: 'x' },
      portal_name: 'Fixture',
      portal_url: 'https://example.test/',
      is_always_open: true,
      eligibility: {},
      pitch_template: { en: 'x', hi: 'x' },
      upcoming_pitch_template: { en: 'x', hi: 'x' },
    });
    expect(error).not.toBeNull();
  });
});
