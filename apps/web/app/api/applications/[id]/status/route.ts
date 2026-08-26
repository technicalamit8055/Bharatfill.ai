import { z } from 'zod';
import { assertTransition, notFound, type ApplicationStatus } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { changeApplicationStatusSchema } from '@/lib/applications/schema';

const idSchema = z.string().uuid();

/**
 * POST /api/applications/:id/status — validated transition (§21.3).
 * `application_status_events` is populated by a database trigger the moment `status` changes, so
 * this route never writes to it directly — it only validates the move and flips the column.
 */
export const POST = handler(
  'api.applications.status',
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const context = await resolveContext(request);
    requirePermission(context, 'application.update');
    const id = idSchema.parse((await ctx.params).id);
    const input = await parseBody(request, changeApplicationStatusSchema);

    const { data: application, error: loadError } = await context.supabase
      .from('applications')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!application) throw notFound('errors.application_not_found');

    const from = application.status as ApplicationStatus;
    assertTransition(from, input.status);

    if (from !== input.status) {
      const { error } = await context.supabase
        .from('applications')
        .update({ status: input.status })
        .eq('id', id)
        .eq('organization_id', context.organization.id);
      if (error) throw error;

      await writeAuditLog(context, {
        action: 'application.status_changed',
        entityType: 'application',
        entityId: id,
        metadata: { from, to: input.status, note: input.note },
      });
    }

    return ok({ id, status: input.status });
  },
);
