import 'server-only';

import { getPortal, notFound, type PortalKey } from '@assistigo/core';
import type { RequestContext } from '../api/context';
import { localised, type Locale } from '../i18n';
import type { CustomerPortalCredentialRow } from '../supabase/database.types';
import { PORTAL_CREDENTIAL_COLUMNS } from './rows';

/**
 * Data access for the portal credential vault (migration 0036).
 *
 * Every read is pinned to the caller's own organization. A roaming operator from another centre
 * gets `not_found` here even inside a live consent window — the vault is home-centre only, and
 * RLS (which has no roaming or support-access clause on this table) says the same thing.
 */

/** For every response that carries a secret: no browser, proxy or CDN may keep a copy. */
export const NO_STORE: ResponseInit = { headers: { 'cache-control': 'no-store' } };

export type VaultCustomer ={ id: string; fullName: string; mobile: string | null };

export async function loadOwnCustomer(
  context: RequestContext,
  customerId: string,
): Promise<VaultCustomer> {
  const { data, error } = await context.supabase
    .from('customers')
    .select('id, full_name, mobile')
    .eq('id', customerId)
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.not_found');
  const row = data as { id: string; full_name: string; mobile: string | null };
  return { id: row.id, fullName: row.full_name, mobile: row.mobile };
}

export async function listCredentials(
  context: RequestContext,
  customerId: string,
): Promise<CustomerPortalCredentialRow[]> {
  const { data, error } = await context.supabase
    .from('customer_portal_credentials')
    .select(PORTAL_CREDENTIAL_COLUMNS)
    .eq('organization_id', context.organization.id)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerPortalCredentialRow[];
}

export async function loadCredential(
  context: RequestContext,
  customerId: string,
  credentialId: string,
): Promise<CustomerPortalCredentialRow> {
  const { data, error } = await context.supabase
    .from('customer_portal_credentials')
    .select(PORTAL_CREDENTIAL_COLUMNS)
    .eq('id', credentialId)
    .eq('organization_id', context.organization.id)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('errors.not_found');
  return data as CustomerPortalCredentialRow;
}

export async function loadCredentialForPortal(
  context: RequestContext,
  customerId: string,
  portalKey: PortalKey,
): Promise<CustomerPortalCredentialRow | null> {
  const { data, error } = await context.supabase
    .from('customer_portal_credentials')
    .select(PORTAL_CREDENTIAL_COLUMNS)
    .eq('organization_id', context.organization.id)
    .eq('customer_id', customerId)
    .eq('portal_key', portalKey)
    .maybeSingle();
  if (error) throw error;
  return (data as CustomerPortalCredentialRow | null) ?? null;
}

/** Best-effort: a failed timestamp must not fail a login the operator is waiting on. */
export async function touchLastUsed(context: RequestContext, credentialId: string): Promise<void> {
  await context.supabase
    .from('customer_portal_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', credentialId)
    .eq('organization_id', context.organization.id);
}

/** The display name of a row's portal: the catalogue name, or the operator's label for `other`. */
export function portalDisplayName(
  row: Pick<CustomerPortalCredentialRow, 'portal_key' | 'portal_label'>,
  locale: Locale,
): string {
  if (row.portal_key === 'other' && row.portal_label) return row.portal_label;
  return localised(getPortal(row.portal_key).name, locale);
}
