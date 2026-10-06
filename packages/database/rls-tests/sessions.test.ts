/**
 * Sessions roster. Master spec §19.4; migration 0031 — `list_my_auth_sessions()` and
 * `revoke_my_auth_session()` read and delete rows of GoTrue's `auth.sessions` as security
 * definer, so the only thing standing between one user and another's sessions is the
 * `user_id = auth.uid()` inside them. These tests are what hold that line.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createSignedInClient,
  setupFixture,
  teardownFixture,
  type RlsFixture,
} from './harness';

type SessionRow = { session_id: string; is_current: boolean; user_agent: string | null };

let fixture: RlsFixture;
/** Two sign-ins for org A's operator: two sessions for the same person. */
let first: SupabaseClient;
let second: SupabaseClient;

async function listSessions(client: SupabaseClient): Promise<SessionRow[]> {
  const { data, error } = await client.rpc('list_my_auth_sessions');
  if (error) throw error;
  return data as SessionRow[];
}

async function currentSessionId(client: SupabaseClient): Promise<string> {
  const current = (await listSessions(client)).find((row) => row.is_current);
  if (!current) throw new Error('no current session');
  return current.session_id;
}

beforeAll(async () => {
  fixture = await setupFixture();
  const operator = fixture.orgA.usersByRole.operator;
  first = operator.client;
  second = await createSignedInClient(operator.email);
}, 60_000);

afterAll(async () => {
  await teardownFixture(fixture);
});

describe('list_my_auth_sessions', () => {
  it("lists the caller's sessions, with exactly one marked current", async () => {
    const rows = await listSessions(first);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((row) => row.is_current)).toHaveLength(1);
    // The current session is listed first.
    expect(rows[0]?.is_current).toBe(true);
  });

  it('marks a different session current for each sign-in', async () => {
    expect(await currentSessionId(first)).not.toBe(await currentSessionId(second));
  });

  it("never lists another user's sessions", async () => {
    const mine = new Set((await listSessions(first)).map((row) => row.session_id));
    const theirs = await listSessions(fixture.orgB.usersByRole.operator.client);
    const sameOrgOwner = await listSessions(fixture.orgA.usersByRole.owner.client);
    for (const row of [...theirs, ...sameOrgOwner]) expect(mine.has(row.session_id)).toBe(false);
  });

  it('is refused to anonymous callers', async () => {
    const { error } = await anonClient().rpc('list_my_auth_sessions');
    expect(error).not.toBeNull();
  });
});

describe('revoke_my_auth_session', () => {
  it("cannot revoke another user's session — not even an owner of the same centre", async () => {
    const target = await currentSessionId(second);

    for (const other of [
      fixture.orgA.usersByRole.owner.client,
      fixture.orgB.usersByRole.owner.client,
    ]) {
      const { data, error } = await other.rpc('revoke_my_auth_session', { p_session_id: target });
      expect(error).toBeNull();
      expect(data).toBe(false);
    }

    const stillThere = (await listSessions(first)).map((row) => row.session_id);
    expect(stillThere).toContain(target);
  });

  it('refuses the current session', async () => {
    const own = await currentSessionId(first);
    const { data } = await first.rpc('revoke_my_auth_session', { p_session_id: own });
    expect(data).toBe(false);
    expect(await currentSessionId(first)).toBe(own);
  });

  it('answers an unknown id exactly like a foreign one', async () => {
    const { data, error } = await first.rpc('revoke_my_auth_session', {
      p_session_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('is refused to anonymous callers', async () => {
    const { error } = await anonClient().rpc('revoke_my_auth_session', {
      p_session_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).not.toBeNull();
  });

  it("revokes the caller's other session, which can then neither refresh nor be verified", async () => {
    const target = await currentSessionId(second);
    const {
      data: { session: secondSession },
    } = await second.auth.getSession();
    if (!secondSession) throw new Error('second sign-in has no session');

    const { data, error } = await first.rpc('revoke_my_auth_session', { p_session_id: target });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const remaining = (await listSessions(first)).map((row) => row.session_id);
    expect(remaining).not.toContain(target);

    // The refresh token died with the session (auth.refresh_tokens cascades)…
    const refreshed = await anonClient().auth.refreshSession({
      refresh_token: secondSession.refresh_token,
    });
    expect(refreshed.error).not.toBeNull();

    // …and the still-unexpired access token no longer passes getUser(), which is the check the
    // dashboard and the extension API make on every request.
    const verified = await second.auth.getUser();
    expect(verified.error).not.toBeNull();
  });
});
