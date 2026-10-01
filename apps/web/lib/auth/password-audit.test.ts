/**
 * Tests for the password-change audit trail.
 *
 * The properties that matter: one row lands in every centre the user belongs to, the row names
 * the action and the user but never carries a password, a user with no centre writes nothing,
 * and a failing database never turns an already-completed password change into an error.
 *
 * The Supabase stub covers only the two calls the function makes.
 */

import { describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION_BY_NAME } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { recordPasswordChange } from './password-audit';

const USER = '33333333-3333-4333-8333-333333333333';
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

const input = {
  userId: USER,
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (test)',
  method: 'recovery' as const,
};

function stub(options: {
  memberships?: { organization_id: string }[];
  membershipError?: string;
  insertError?: string;
}) {
  const insert = vi.fn(async () => ({
    error: options.insertError ? { message: options.insertError } : null,
  }));

  const eq = vi.fn();
  const membershipQuery = {
    eq: eq.mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({
        data: options.membershipError ? null : (options.memberships ?? []),
        error: options.membershipError ? { message: options.membershipError } : null,
      }),
  };

  const from = vi.fn((table: string) =>
    table === 'organization_members' ? { select: () => membershipQuery } : { insert },
  );

  return { client: { from } as unknown as AssistigoSupabaseClient, insert, from };
}

describe('auth.password_changed catalogue entry', () => {
  it('is registered as a sensitive user event', () => {
    expect(AUDIT_ACTION_BY_NAME.get('auth.password_changed')).toMatchObject({
      entityType: 'user',
      sensitivity: 'sensitive',
    });
  });
});

describe('recordPasswordChange', () => {
  it('writes one row per active centre, identifying the user and nothing secret', async () => {
    const { client, insert } = stub({
      memberships: [{ organization_id: ORG_A }, { organization_id: ORG_B }],
    });

    await recordPasswordChange(client, input);

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = (insert.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    expect(rows.map((row) => row.organization_id)).toEqual([ORG_A, ORG_B]);
    for (const row of rows) {
      expect(row).toMatchObject({
        actor_user_id: USER,
        actor_type: 'user',
        action: 'auth.password_changed',
        entity_type: 'user',
        entity_id: USER,
        sensitivity: 'sensitive',
        ip_address: '203.0.113.7',
        metadata: { method: 'recovery' },
      });
      expect(JSON.stringify(row)).not.toMatch(/password"\s*:/i);
    }
  });

  it('writes nothing for a user who belongs to no centre', async () => {
    const { client, insert } = stub({ memberships: [] });
    await recordPasswordChange(client, input);
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not throw when the membership lookup fails', async () => {
    const { client, insert } = stub({ membershipError: 'boom' });
    await expect(recordPasswordChange(client, input)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not throw when the insert fails', async () => {
    const { client } = stub({ memberships: [{ organization_id: ORG_A }], insertError: 'rls' });
    await expect(recordPasswordChange(client, input)).resolves.toBeUndefined();
  });
});
