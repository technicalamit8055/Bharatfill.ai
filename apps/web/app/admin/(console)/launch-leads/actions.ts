'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformSession } from '@/lib/admin/session';
import { writePlatformAuditLog } from '@/lib/admin/audit';
import { logger } from '@/lib/api/logger';

export type LaunchLeadActionState = { error?: string; notice?: string };

const deleteSchema = z.object({ id: z.string().uuid() });

/**
 * Takes an operator off the early-access list — because they asked, or because they have since
 * created an account. The row is deleted outright; the audit entry keeps only its id.
 */
export async function deleteLaunchLeadAction(
  _prev: LaunchLeadActionState,
  formData: FormData,
): Promise<LaunchLeadActionState> {
  const session = await requirePlatformSession();
  if (!session.permissions.has('platform.leads.manage')) {
    return { error: 'errors.permission_denied' };
  }

  const parsed = deleteSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'errors.validation_failed' };

  const { error } = await session.supabase
    .from('launch_leads')
    .delete()
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('admin.launch_lead_delete_failed', { dbError: error.message });
    return { error: 'errors.internal' };
  }

  await writePlatformAuditLog(session.supabase, {
    actorUserId: session.userId,
    action: 'platform.launch_lead_deleted',
    entityType: 'launch_lead',
    entityId: parsed.data.id,
  });

  revalidatePath('/admin/launch-leads');
  return { notice: 'admin.launchLeads.deleted' };
}
