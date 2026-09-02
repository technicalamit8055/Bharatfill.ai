/**
 * Cross-organization denial. Master spec §18.3, docs/DATABASE.md §8 items 1-2,
 * docs/SECURITY.md §11 checklist item "Cross-organization access denied in tests".
 *
 * For every tenant table: a member of org A can read their own org's rows, and a member of
 * org B reading the same query gets zero rows back — never an error, never someone else's data.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;

/**
 * The platform scheme catalogue (`organization_id is null`) is the one table in the schema that
 * is deliberately readable across tenants, so its policy needs pinning down from both sides:
 * a published platform row must reach everyone, and a draft one must reach nobody.
 */
const PLATFORM_PUBLISHED_SLUG = 'rls-fixture-platform-published';
const PLATFORM_DRAFT_SLUG = 'rls-fixture-platform-draft';

function fixtureScheme(slug: string) {
  return {
    slug,
    category: 'welfare',
    title: { en: 'Rls fixture scheme', hi: 'आरएलएस फिक्स्चर योजना' },
    short_description: { en: 'Fixture.', hi: 'फिक्स्चर।' },
    benefits_summary: { en: 'Fixture.', hi: 'फिक्स्चर।' },
    benefit_highlight: { en: 'Fixture', hi: 'फिक्स्चर' },
    portal_name: 'Fixture portal',
    portal_url: 'https://example.test/',
    is_always_open: true,
    estimated_operator_fee: 50,
    eligibility: {},
    pitch_template: { en: 'Fixture for ₹{fee}.', hi: '₹{fee} में फिक्स्चर।' },
    upcoming_pitch_template: { en: 'Opens in {days} days, ₹{fee}.', hi: '{days} दिन, ₹{fee}।' },
  };
}

beforeAll(async () => {
  fixture = await setupFixture();

  // Seed one row per tenant table in org A, as org A's owner, through the same RLS-governed
  // client the assertions use — proving the policy allows a legitimate insert too.
  const { orgA } = fixture;
  const owner = orgA.usersByRole.owner.client;

  const { data: customer, error: customerError } = await owner
    .from('customers')
    .insert({ organization_id: orgA.id, full_name: 'Rls Fixture Customer' })
    .select('id')
    .single();
  if (customerError) throw customerError;

  const { error: fieldValueError } = await owner.from('customer_field_values').insert({
    organization_id: orgA.id,
    customer_id: customer.id,
    field_key: 'customer.notes_test',
    value_text: 'fixture',
  });
  if (fieldValueError) throw fieldValueError;

  const { data: application, error: applicationError } = await owner
    .from('applications')
    .insert({ organization_id: orgA.id, customer_id: customer.id, title: 'Rls fixture application' })
    .select('id')
    .single();
  if (applicationError) throw applicationError;

  const { data: fillSession, error: fillSessionError } = await owner
    .from('fill_sessions')
    .insert({
      organization_id: orgA.id,
      customer_id: customer.id,
      page_origin: 'https://example.test',
    })
    .select('id')
    .single();
  if (fillSessionError) throw fillSessionError;

  const { error: consentError } = await owner.from('consent_records').insert({
    organization_id: orgA.id,
    customer_id: customer.id,
    consent_subject: 'customer_data',
    consent_text_version: 'v1',
  });
  if (consentError) throw consentError;

  const { error: aiSettingsError } = await owner
    .from('organization_ai_settings')
    .insert({ organization_id: orgA.id, provider: 'deepseek' });
  if (aiSettingsError) throw aiSettingsError;

  const { error: schemeError } = await owner
    .from('schemes_catalog')
    .insert({ organization_id: orgA.id, ...fixtureScheme('rls-fixture-local-scheme') });
  if (schemeError) throw schemeError;

  // Platform rows are service_role only, so they go in through the admin client.
  const { error: platformSchemeError } = await fixture.admin.from('schemes_catalog').insert([
    { organization_id: null, ...fixtureScheme(PLATFORM_PUBLISHED_SLUG), is_published: true },
    { organization_id: null, ...fixtureScheme(PLATFORM_DRAFT_SLUG), is_published: false },
  ]);
  if (platformSchemeError) throw platformSchemeError;

  fixture.orgA.usersByRole.owner.client = owner;
  (fixture as unknown as { seeded: Record<string, string> }).seeded = {
    customerId: customer.id,
    applicationId: application.id,
    fillSessionId: fillSession.id,
  };
}, 60_000);

afterAll(async () => {
  // Platform rows belong to no organization, so dropping the test orgs does not take them with it.
  if (fixture) {
    await fixture.admin
      .from('schemes_catalog')
      .delete()
      .is('organization_id', null)
      .in('slug', [PLATFORM_PUBLISHED_SLUG, PLATFORM_DRAFT_SLUG]);
  }
  await teardownFixture(fixture);
});

describe('cross-organization denial', () => {
  it('lets an org A member read org A customers', async () => {
    const { data, error } = await fixture.orgA.usersByRole.operator.client
      .from('customers')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).not.toHaveLength(0);
  });

  it('returns zero customers when org B reads org A', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('customers')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero customer_field_values when org B reads org A', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('customer_field_values')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero applications when org B reads org A', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('applications')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero fill_sessions when org B reads org A', async () => {
    const { data, error } = await fixture.orgB.usersByRole.operator.client
      .from('fill_sessions')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero consent_records when org B reads org A', async () => {
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('consent_records')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero organization_ai_settings rows when org B reads org A', async () => {
    // This row carries a third-party API key ciphertext, so it gets the same tenancy
    // guarantee as every other tenant table — never just because a member is an owner
    // somewhere, only because they are a member of *this* organization (docs/SECURITY.md §4).
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('organization_ai_settings')
      .select('organization_id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero schemes_catalog rows when org B reads org A', async () => {
    // A centre's own catalogue can carry local schemes and corrected age limits it worked out
    // itself; it is competitive knowledge, not shared reference data.
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('schemes_catalog')
      .select('id')
      .eq('organization_id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not let org B insert a scheme into org A', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('schemes_catalog')
      .insert({ organization_id: fixture.orgA.id, ...fixtureScheme('rls-fixture-intruder') });
    expect(error).not.toBeNull();
  });

  it('shows the published platform catalogue to every organization', async () => {
    for (const org of [fixture.orgA, fixture.orgB]) {
      const { data, error } = await org.usersByRole.operator.client
        .from('schemes_catalog')
        .select('slug')
        .eq('slug', PLATFORM_PUBLISHED_SLUG);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
  });

  it('hides an unpublished platform scheme from every tenant', async () => {
    // An unverified import must not become advice given at a counter.
    for (const org of [fixture.orgA, fixture.orgB]) {
      const { data, error } = await org.usersByRole.owner.client
        .from('schemes_catalog')
        .select('slug')
        .eq('slug', PLATFORM_DRAFT_SLUG);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('does not let an organization write into the platform catalogue', async () => {
    const { error } = await fixture.orgA.usersByRole.owner.client
      .from('schemes_catalog')
      .insert({ organization_id: null, ...fixtureScheme('rls-fixture-fake-platform') });
    expect(error).not.toBeNull();
  });

  it('does not let org B see org A in organizations', async () => {
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('organizations')
      .select('id')
      .eq('id', fixture.orgA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not let org B insert a customer into org A', async () => {
    const { error } = await fixture.orgB.usersByRole.owner.client
      .from('customers')
      .insert({ organization_id: fixture.orgA.id, full_name: 'Should Not Insert' });
    expect(error).not.toBeNull();
  });

  it('does not let org B update an org A application', async () => {
    const seeded = (fixture as unknown as { seeded: Record<string, string> }).seeded;
    const { data, error } = await fixture.orgB.usersByRole.owner.client
      .from('applications')
      .update({ notes: 'tampered' })
      .eq('id', seeded.applicationId)
      .select('id');
    // A cross-org update matches zero rows under RLS rather than erroring.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
