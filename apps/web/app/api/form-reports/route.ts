import { requirePermission, resolveContext } from '@/lib/api/context';
import { created, handler, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { createFormReportSchema } from '@/lib/forms/schema';

/** POST /api/form-reports — "report an unsupported form" (§17, §21.4). */
export const POST = handler('api.form_reports.create', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'formreport.create');
  const input = await parseBody(request, createFormReportSchema);

  const { data, error } = await context.supabase
    .from('form_reports')
    .insert({
      organization_id: context.organization.id,
      portal_adapter_id: input.portalAdapterId ?? null,
      page_origin: input.pageOrigin,
      page_path: input.pagePath ?? null,
      page_title: input.pageTitle ?? null,
      note: input.note ?? null,
      browser_version: request.headers.get('user-agent'),
      created_by: context.userId,
    })
    .select('id')
    .single();
  if (error) throw error;

  await writeAuditLog(context, {
    action: 'form_report.created',
    entityType: 'form_report',
    entityId: data.id as string,
    metadata: { pageOrigin: input.pageOrigin },
  });

  return created({ formReport: { id: data.id } });
});
