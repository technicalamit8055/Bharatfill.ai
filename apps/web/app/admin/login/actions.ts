'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CONSOLE_PORTALS,
  CONSOLE_PORTAL_PATHS,
  consolePortalFor,
  isRoleAllowedAtPortal,
  type ConsolePortal,
} from '@assistigo/core';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { safeConsoleNext } from '@/lib/admin/console-session';
import { endConsoleSession, resolveStaffIdentity, startConsoleSession } from '@/lib/admin/session';
import { logger } from '@/lib/api/logger';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Console sign-in, lock and sign-out.
 *
 * One action serves both portals, told apart by a validated hidden field, so the two sign-in pages
 * cannot drift into enforcing different rules. The portal decides which roles are accepted
 * (packages/core/src/platform/portals.ts); everything after that is the same.
 */

export type ConsoleSignInState = {
  error?: string;
  /** Set when the account is staff but belongs to the other portal: where to send them. */
  otherPortal?: ConsolePortal;
};

const signInSchema = z.object({
  email: z.string().trim().email('validation.email_invalid'),
  password: z.string().min(1, 'admin.login.invalidCredentials'),
  portal: z.enum(CONSOLE_PORTALS),
  next: z.string().optional(),
});

async function requestMeta() {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  return {
    ipAddress: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : list.get('x-real-ip'),
    userAgent: list.get('user-agent'),
  };
}

export async function consoleSignInAction(
  _prev: ConsoleSignInState,
  formData: FormData,
): Promise<ConsoleSignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    portal: formData.get('portal'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'errors.validation_failed' };
  }
  const { email, password, portal } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Same answer for "no such user" and "wrong password", as on the operator sign-in. No
    // account to attribute it to, so a log line rather than an audit row — and never the address.
    logger.warn('platform.console_login_failed', { portal, reason: error?.message ?? 'no_user' });
    return { error: 'admin.login.invalidCredentials' };
  }

  const user = data.user;
  const admin = createSupabaseAdminClient();
  const meta = await requestMeta();
  const identity = await resolveStaffIdentity(admin, user);

  if (!identity.granted) {
    await writePlatformAuditLog(admin, {
      actorUserId: user.id,
      action: 'platform.console_access_denied',
      entityType: 'user',
      entityId: user.id,
      ...meta,
      metadata: { portal, reason: identity.reason },
    });
    // They came to the wrong door entirely. Leaving them signed in to their tenant account from
    // the console's page would be a surprise, so the session this action created goes too.
    await supabase.auth.signOut();
    return { error: 'admin.login.noAccess' };
  }

  if (!isRoleAllowedAtPortal(identity.role, portal)) {
    await writePlatformAuditLog(admin, {
      actorUserId: user.id,
      action: 'platform.console_access_denied',
      entityType: 'user',
      entityId: user.id,
      ...meta,
      metadata: { portal, reason: 'wrong_portal', role: identity.role },
    });
    // Legitimate staff at the wrong page: keep the Supabase session so the right page can offer
    // "continue as" — but mint no console session here. A session they already hold for their
    // own portal is left alone; it is bound to that portal and useless at this one.
    return {
      error: portal === 'team' ? 'admin.login.useSuperAdminPortal' : 'admin.login.useTeamPortal',
      otherPortal: consolePortalFor(identity.role),
    };
  }

  await startConsoleSession(user.id, portal);
  await writePlatformAuditLog(admin, {
    actorUserId: user.id,
    action: 'platform.admin_signed_in',
    entityType: 'platform_admin',
    entityId: user.id,
    ...meta,
    metadata: { portal, via: identity.via },
  });

  redirect(safeConsoleNext(parsed.data.next));
}

const portalSchema = z.enum(CONSOLE_PORTALS).catch('super_admin');

/**
 * Ends the console session but keeps the account signed in — stepping away from the console
 * without also dropping the operator dashboard in another tab. Coming back asks for the password.
 */
export async function lockConsoleAction(formData: FormData): Promise<void> {
  const portal = portalSchema.parse(formData.get('portal'));
  await endConsoleSession();
  redirect(`${CONSOLE_PORTAL_PATHS[portal]}?reason=locked`);
}

export async function consoleSignOutAction(formData: FormData): Promise<void> {
  const portal = portalSchema.parse(formData.get('portal'));
  await endConsoleSession();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`${CONSOLE_PORTAL_PATHS[portal]}?reason=signed_out`);
}
