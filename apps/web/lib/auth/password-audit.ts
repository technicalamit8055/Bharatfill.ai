import 'server-only';

import type { AssistigoSupabaseClient } from '../supabase/server';
import { recordUserAuditEvent } from './user-audit';

/**
 * Records `auth.password_changed` for a user who has just replaced their password — one row in
 * each centre they belong to (see `recordUserAuditEvent`). Nothing about the password itself is
 * recorded.
 */
export async function recordPasswordChange(
  supabase: AssistigoSupabaseClient,
  input: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    method: 'recovery';
  },
): Promise<void> {
  await recordUserAuditEvent(supabase, {
    userId: input.userId,
    action: 'auth.password_changed',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { method: input.method },
  });
}
