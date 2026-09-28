'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { logger } from '@/lib/api/logger';

/**
 * Global portal adapter maintenance.
 *
 * Scoped tightly on purpose: status, notes, known issues and the verification stamp. Field
 * mappings are not editable here — a mapping is a structured artefact produced and tested against
 * a real form by the extension tooling (docs/FORM_ENGINE.md), and a free-text JSON box in an admin
 * panel is the wrong place to hand-edit the thing that decides what gets typed into a citizen's
 * application.
 */

export type AdapterActionState = { error?: string; notice?: string };

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['draft', 'testing', 'active', 'deprecated']),
  notes: z.string().trim().max(2000).optional(),
  knownIssues: z.string().trim().max(2000).optional(),
  markVerified: z.boolean(),
});

export async function updateAdapterAction(
  _prev: AdapterActionState,
  formData: FormData,
): Promise<AdapterActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.forms.edit')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    notes: formData.get('notes') ?? undefined,
    knownIssues: formData.get('knownIssues') ?? undefined,
    markVerified: formData.get('markVerified') === 'on',
  });

  if (!parsed.success) return { error: 'errors.validation_failed' };

  const { error } = await session.supabase
    .from('portal_adapters')
    .update({
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      known_issues: parsed.data.knownIssues || null,
      // Only ever moved forward. Clearing a verification date would erase the record that somebody
      // once checked this adapter against the real form.
      ...(parsed.data.markVerified ? { last_verified_at: new Date().toISOString() } : {}),
    })
    .eq('id', parsed.data.id)
    // Global adapters only — a centre's own override is their data.
    .is('organization_id', null);

  if (error) {
    logger.error('platform.adapter_update_failed', { code: error.code });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.adapter_updated',
    entityType: 'portal_adapter',
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status, verified: parsed.data.markVerified },
  });

  revalidatePath('/admin/forms');
  return { notice: 'admin.forms.saved' };
}
