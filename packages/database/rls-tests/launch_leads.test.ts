/**
 * Launch leads are reachable by the service role only. Migration 0035.
 *
 * The public form writes through a server action and the admin console reads through the
 * service role, so neither an anonymous visitor nor a signed-in tenant presenting a valid JWT
 * straight to PostgREST may read, add, change or remove a row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, setupFixture, teardownFixture, type RlsFixture } from './harness';

let fixture: RlsFixture;
let leadId: string;

/** Invented values — never a real operator's number. */
const FIXTURE_LEAD = {
  whatsapp_number: '9000000001',
  shop_name: 'RLS Fixture Cyber Cafe',
  city: 'Testpur',
  consent_version: 'launch-leads-v1',
};

beforeAll(async () => {
  fixture = await setupFixture();
  const { data, error } = await adminClient()
    .from('launch_leads')
    .insert(FIXTURE_LEAD)
    .select('id')
    .single();
  if (error) throw error;
  leadId = data.id as string;
}, 60_000);

afterAll(async () => {
  if (leadId) await adminClient().from('launch_leads').delete().eq('id', leadId);
  await teardownFixture(fixture);
});

describe('launch_leads is closed to every client role', () => {
  const callers: [string, () => SupabaseClient][] = [
    ['an anonymous visitor', () => anonClient()],
    ['an org owner', () => fixture.orgA.usersByRole.owner.client],
  ];

  for (const [who, client] of callers) {
    it(`returns no rows to ${who}`, async () => {
      const { data } = await client().from('launch_leads').select('*');
      expect(data ?? []).toEqual([]);
    });

    it(`refuses an insert from ${who}`, async () => {
      const { error } = await client()
        .from('launch_leads')
        .insert({ ...FIXTURE_LEAD, whatsapp_number: '9000000002' });
      expect(error).not.toBeNull();
    });

    it(`cannot change or delete a lead as ${who}`, async () => {
      await client().from('launch_leads').update({ city: 'Changed' }).eq('id', leadId);
      await client().from('launch_leads').delete().eq('id', leadId);

      const { data } = await adminClient()
        .from('launch_leads')
        .select('city')
        .eq('id', leadId)
        .single();
      expect(data?.city).toBe(FIXTURE_LEAD.city);
    });
  }
});
