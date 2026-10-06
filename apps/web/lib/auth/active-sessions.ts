import 'server-only';

import { z } from 'zod';
import { summarizeUserAgent, type UserAgentSummary } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';

/**
 * The signed-in person's sessions roster. Master spec §19.4; AUTH-05.
 *
 * Reads and revokes go through `list_my_auth_sessions()` / `revoke_my_auth_session()`
 * (migration 0031), which only ever see the caller's own sessions — the user's JWT is what
 * selects them, so there is no id here that could be pointed at somebody else.
 */

const sessionRowSchema = z.object({
  session_id: z.string().uuid(),
  created_at: z.string(),
  last_active_at: z.string(),
  user_agent: z.string().nullable(),
  ip_address: z.string().nullable(),
  is_current: z.boolean().nullable(),
});

/** What the page renders. The raw User-Agent stays on the server; only its summary goes out. */
export type ActiveSession = UserAgentSummary & {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  ipAddress: string | null;
  isCurrent: boolean;
};

export function toActiveSession(row: z.infer<typeof sessionRowSchema>): ActiveSession {
  return {
    id: row.session_id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    ipAddress: row.ip_address,
    isCurrent: row.is_current === true,
    ...summarizeUserAgent(row.user_agent),
  };
}

/**
 * Supabase hands back errors as plain objects, not `Error`s, so callers logging
 * `error instanceof Error ? error.message : …` would lose them. The code is what tells a missing
 * migration (PGRST202) apart from a privilege problem on `auth.sessions` (42501).
 */
function rpcError(fn: string, error: { code?: string; message?: string }): Error {
  return new Error(`${fn} failed (${error.code ?? 'no code'}): ${error.message ?? 'no message'}`);
}

export async function listActiveSessions(
  supabase: AssistigoSupabaseClient,
): Promise<ActiveSession[]> {
  const { data, error } = await supabase.rpc('list_my_auth_sessions');
  if (error) throw rpcError('list_my_auth_sessions', error);
  return z.array(sessionRowSchema).parse(data ?? []).map(toActiveSession);
}

/**
 * Signs one of the caller's other sessions out. `false` covers an unknown id, an already-ended
 * session and the current one — the database does not say which, and neither does this.
 */
export async function revokeActiveSession(
  supabase: AssistigoSupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_my_auth_session', {
    p_session_id: sessionId,
  });
  if (error) throw rpcError('revoke_my_auth_session', error);
  return data === true;
}
