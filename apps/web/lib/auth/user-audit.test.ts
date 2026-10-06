/**
 * `recordUserAuditEvent` for session revocation. The per-centre fan-out and failure handling
 * are covered through `recordPasswordChange` in password-audit.test.ts; this file covers what
 * the sessions roster adds — the `auth.session_revoked` action and its metadata.
 */

import { describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION_BY_NAME } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { recordUserAuditEvent } from './user-audit';

const USER = '33333333-3333-4333-8333-333333333333';
const ORG_A = '11111111-1111-4111-8111-111111111111';

function stub() {
  const insert = vi.fn(async () => ({ error: null }));
  const membershipQuery = {
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: [{ organization_id: ORG_A }], error: null }),
  };
  const from = vi.fn((table: string) =>
    table === 'organization_members' ? { select: () => membershipQuery } : { insert },
  );
  return { client: { from } as unknown as AssistigoSupabaseClient, insert };
}

describe('auth.session_revoked catalogue entry', () => {
  it('is registered as a sensitive user event', () => {
    expect(AUDIT_ACTION_BY_NAME.get('auth.session_revoked')).toMatchObject({
      entityType: 'user',
      sensitivity: 'sensitive',
    });
  });
});

describe('recordUserAuditEvent', () => {
  it('records which device was signed out, as the roster names it', async () => {
    const { client, insert } = stub();
    const metadata = { scope: 'single', browser: 'Chrome', os: 'Windows', device: 'desktop' };

    await recordUserAuditEvent(client, {
      userId: USER,
      action: 'auth.session_revoked',
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (test)',
      metadata,
    });

    const rows = (insert.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: ORG_A,
      actor_user_id: USER,
      action: 'auth.session_revoked',
      entity_type: 'user',
      entity_id: USER,
      sensitivity: 'sensitive',
      metadata,
    });
  });

  it('redacts anything sensitive a caller passes in metadata', async () => {
    const { client, insert } = stub();

    await recordUserAuditEvent(client, {
      userId: USER,
      action: 'auth.session_revoked',
      ipAddress: null,
      userAgent: null,
      metadata: { scope: 'others', revokedCount: 2, refreshToken: 'secret-value' },
    });

    const rows = (insert.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    const metadata = rows[0]?.metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({ scope: 'others', revokedCount: 2 });
    expect(JSON.stringify(metadata)).not.toContain('secret-value');
  });
});
