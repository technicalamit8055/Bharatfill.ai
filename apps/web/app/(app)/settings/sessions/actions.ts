'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import {
  listActiveSessions,
  revokeActiveSession,
  type ActiveSession,
} from '@/lib/auth/active-sessions';
import { recordUserAuditEvent } from '@/lib/auth/user-audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';

/**
 * Signing your own sessions out (master spec §19.4; AUTH-05).
 *
 * These act on the caller's own sessions only, so no role permission is involved: every member
 * may sign their own account out anywhere. The database functions behind them are what keep a
 * session id from someone else's account from doing anything (migration 0031).
 */

export type SessionsState = {
  error?: string;
  notice?: string;
};

const sessionIdSchema = z.string().uuid();

async function requestOrigin(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const requestHeaders = await headers();
  return {
    ipAddress:
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      requestHeaders.get('x-real-ip'),
    userAgent: requestHeaders.get('user-agent'),
  };
}

export async function revokeSessionAction(
  _prev: SessionsState,
  formData: FormData,
): Promise<SessionsState> {
  const session = await requireSession();

  const sessionId = sessionIdSchema.safeParse(formData.get('sessionId'));
  if (!sessionId.success) return { error: 'errors.validation_failed' };

  const supabase = await createSupabaseServerClient();

  let target: ActiveSession | undefined;
  let revoked = false;
  try {
    // Looked up first so the audit line can say which device it was.
    target = (await listActiveSessions(supabase)).find((s) => s.id === sessionId.data);
    if (target && !target.isCurrent) revoked = await revokeActiveSession(supabase, target.id);
  } catch (error) {
    logger.error('auth.session_revoke_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'errors.internal' };
  }

  // Already signed out, expired, or this very session: nothing to audit, and the list is stale.
  if (!target || !revoked) {
    revalidatePath('/settings/sessions');
    return { error: 'settings.sessions.alreadyEnded' };
  }

  // The coarse device summary, not the session id: an owner reading the trail recognises
  // "Chrome on Windows", and `redact()` would scrub digit runs out of a UUID anyway.
  await recordUserAuditEvent(supabase, {
    userId: session.userId,
    action: 'auth.session_revoked',
    ...(await requestOrigin()),
    metadata: { scope: 'single', browser: target.browser, os: target.os, device: target.device },
  });

  revalidatePath('/settings/sessions');
  return { notice: 'settings.sessions.revoked' };
}

export async function revokeOtherSessionsAction(
  _prev: SessionsState,
  _formData: FormData,
): Promise<SessionsState> {
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  let otherCount: number;
  try {
    otherCount = (await listActiveSessions(supabase)).filter((s) => !s.isCurrent).length;
  } catch (error) {
    logger.error('auth.session_list_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'errors.internal' };
  }

  if (otherCount === 0) return { notice: 'settings.sessions.noOthers' };

  // GoTrue's own logout with scope "others" — the same call the password reset uses — ends every
  // session of this user except the one making the request.
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    logger.error('auth.session_revoke_failed', { reason: error.message });
    return { error: 'errors.internal' };
  }

  await recordUserAuditEvent(supabase, {
    userId: session.userId,
    action: 'auth.session_revoked',
    ...(await requestOrigin()),
    metadata: { scope: 'others', revokedCount: otherCount },
  });

  revalidatePath('/settings/sessions');
  return { notice: 'settings.sessions.revokedOthers' };
}
