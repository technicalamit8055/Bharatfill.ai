'use server';

import { revalidatePath } from 'next/cache';
import { auditSensitivityFor, can } from '@assistigo/core';
import { logger } from '@/lib/api/logger';
import { requireSession } from '@/lib/auth/session';
import { organizationProfileSchema } from '@/lib/settings/organization';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type OrganizationState = { error?: string; notice?: string };

export async function updateOrganizationAction(
  _prev: OrganizationState,
  formData: FormData,
): Promise<OrganizationState> {
  const session = await requireSession();
  if (!can(session.role, 'org.settings')) return { error: 'errors.permission_denied' };

  const parsed = organizationProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    // Zod's built-in messages are English prose, not translation keys.
    return {
      error: message && /^\w+(\.\w+)+$/.test(message) ? message : 'errors.validation_failed',
    };
  }

  const { businessType, preferredLocale, ...rest } = parsed.data;
  const patch = { ...rest, business_type: businessType, preferred_locale: preferredLocale };
  const fields = (Object.keys(patch) as (keyof typeof patch)[]).filter(
    (key) => patch[key] !== session.organization[key],
  );
  if (fields.length === 0) return { notice: 'settings.org.saved' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', session.organization.id)
    .select('id')
    .maybeSingle();

  // RLS refuses by matching no row, which is not an error.
  if (error || !data) {
    logger.error('organization.update_failed', { dbError: error?.message ?? 'no_row' });
    return { error: 'errors.internal' };
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    organization_id: session.organization.id,
    actor_user_id: session.userId,
    actor_type: 'user',
    action: 'organization.updated',
    entity_type: 'organization',
    entity_id: session.organization.id,
    sensitivity: auditSensitivityFor('organization.updated'),
    // Which fields changed, not what they changed to.
    metadata: { fields },
  });
  if (auditError) {
    logger.error('audit.write_failed', {
      action: 'organization.updated',
      dbError: auditError.message,
    });
  }

  // The centre's name is also in the header's account menu.
  revalidatePath('/', 'layout');
  return { notice: 'settings.org.saved' };
}
