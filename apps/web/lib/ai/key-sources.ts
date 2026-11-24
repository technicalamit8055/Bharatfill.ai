import 'server-only';

import { validationFailed } from '@assistigo/core';
import type { OrganizationAiProvider, OrganizationAiSettingsRow } from '../supabase/database.types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import { loadOrgAiSettings } from './vendor-settings';

/** A centre whose saved key may be reused for the shared setup. Never carries the key. */
export type AiKeySource = {
  organizationId: string;
  name: string;
  provider: OrganizationAiProvider;
  baseUrl: string | null;
  model: string | null;
};

/**
 * Centres the caller personally owns that have a saved AI key. Another owner's key is never
 * offered: it is their credential, and reusing it would bill them for every centre.
 */
export async function loadOwnAiKeySources(
  supabase: AssistigoSupabaseClient,
  userId: string,
): Promise<AiKeySource[]> {
  const { data: members, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('status', 'active');
  if (error) throw error;
  const ids = ((members ?? []) as { organization_id: string }[]).map((m) => m.organization_id);
  if (ids.length === 0) return [];

  const [orgs, rows] = await Promise.all([
    supabase.from('organizations').select('id, name').in('id', ids).is('deleted_at', null),
    supabase
      .from('organization_ai_settings')
      .select('organization_id, provider, base_url, model')
      .in('organization_id', ids)
      .not('api_key_encrypted', 'is', null),
  ]);
  if (orgs.error) throw orgs.error;
  if (rows.error) throw rows.error;

  const names = new Map(
    ((orgs.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
  );
  return (
    (rows.data ?? []) as Pick<
      OrganizationAiSettingsRow,
      'organization_id' | 'provider' | 'base_url' | 'model'
    >[]
  ).flatMap((row) => {
    const name = names.get(row.organization_id);
    if (name === undefined) return [];
    return [
      {
        organizationId: row.organization_id,
        name,
        provider: row.provider,
        baseUrl: row.base_url,
        model: row.model,
      },
    ];
  });
}

/** The decrypted key of a centre the caller owns. Server-side only; never return it. */
export async function resolveOwnAiKey(
  supabase: AssistigoSupabaseClient,
  userId: string,
  organizationId: string,
): Promise<string> {
  const sources = await loadOwnAiKeySources(supabase, userId);
  const allowed = sources.some((source) => source.organizationId === organizationId);
  const settings = allowed ? await loadOrgAiSettings(supabase, organizationId) : null;
  if (!settings?.apiKey) {
    throw validationFailed({ fields: { apiKey: 'admin.aiSettings.copyFailed' } });
  }
  return settings.apiKey;
}
