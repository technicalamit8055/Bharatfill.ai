/**
 * Tests for the sessions roster's server helpers.
 *
 * What matters: rows from `list_my_auth_sessions()` are validated before use, the raw
 * User-Agent never leaves the server (only its coarse summary does), and revocation reports a
 * plain yes/no while surfacing database errors.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { listActiveSessions, revokeActiveSession, toActiveSession } from './active-sessions';

const CURRENT = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const rows = [
  {
    session_id: CURRENT,
    created_at: '2026-09-30T04:30:00+00:00',
    last_active_at: '2026-10-01T05:00:00+00:00',
    user_agent: CHROME_WINDOWS,
    ip_address: '203.0.113.7',
    is_current: true,
  },
  {
    session_id: OTHER,
    created_at: '2026-09-01T04:30:00+00:00',
    last_active_at: '2026-09-02T04:30:00+00:00',
    user_agent: null,
    ip_address: null,
    is_current: false,
  },
];

function stubRpc(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AssistigoSupabaseClient, rpc };
}

describe('toActiveSession', () => {
  it('summarises the user agent and drops the raw string', () => {
    const session = toActiveSession(rows[0]!);
    expect(session).toEqual({
      id: CURRENT,
      createdAt: rows[0]!.created_at,
      lastActiveAt: rows[0]!.last_active_at,
      ipAddress: '203.0.113.7',
      isCurrent: true,
      browser: 'Chrome',
      os: 'Windows',
      device: 'desktop',
    });
    expect(JSON.stringify(session)).not.toContain('Mozilla');
  });

  it('treats a missing user agent as an unknown device', () => {
    expect(toActiveSession(rows[1]!)).toMatchObject({
      browser: null,
      os: null,
      device: 'unknown',
      ipAddress: null,
      isCurrent: false,
    });
  });
});

describe('listActiveSessions', () => {
  it('calls the 0031 function and maps every row', async () => {
    const { client, rpc } = stubRpc({ data: rows, error: null });
    const sessions = await listActiveSessions(client);
    expect(rpc).toHaveBeenCalledWith('list_my_auth_sessions');
    expect(sessions.map((s) => s.id)).toEqual([CURRENT, OTHER]);
  });

  it('returns an empty list for no rows', async () => {
    const { client } = stubRpc({ data: null, error: null });
    await expect(listActiveSessions(client)).resolves.toEqual([]);
  });

  it('rejects a malformed row rather than rendering it', async () => {
    const { client } = stubRpc({ data: [{ ...rows[0], session_id: 'not-a-uuid' }], error: null });
    await expect(listActiveSessions(client)).rejects.toThrow();
  });

  it('surfaces a database error', async () => {
    const { client } = stubRpc({ data: null, error: { code: 'PGRST202', message: 'boom' } });
    await expect(listActiveSessions(client)).rejects.toThrow('(PGRST202): boom');
  });
});

describe('revokeActiveSession', () => {
  it('passes the id through and reports success', async () => {
    const { client, rpc } = stubRpc({ data: true, error: null });
    await expect(revokeActiveSession(client, OTHER)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('revoke_my_auth_session', { p_session_id: OTHER });
  });

  it('reports false when nothing was revoked', async () => {
    const { client } = stubRpc({ data: false, error: null });
    await expect(revokeActiveSession(client, OTHER)).resolves.toBe(false);
  });

  it('surfaces a database error', async () => {
    const { client } = stubRpc({ data: null, error: { code: 'PGRST202', message: 'boom' } });
    await expect(revokeActiveSession(client, OTHER)).rejects.toThrow('(PGRST202): boom');
  });
});
