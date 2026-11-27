import { APPLICATION_STATUSES, notFound, OPEN_STATUSES } from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, created, ok, parseBody, parseQuery } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import { applicationSearchSchema, createApplicationSchema } from '@/lib/applications/schema';
import type { ApplicationRow, PortalAdapterRow } from '@/lib/supabase/database.types';

const TERMINAL_STATUSES = APPLICATION_STATUSES.filter(
  (status) => !OPEN_STATUSES.includes(status),
);

/** GET /api/applications — the operational list, filtered by the dashboard's tabs (§21.3). */
export const GET = handler('api.applications.list', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'application.view');

  const query = parseQuery(request, applicationSearchSchema);

  let builder = context.supabase
    .from('applications')
    .select(
      'id, title, category, status, portal_name, portal_reference_number, deadline_at, amount_charged, payment_status, assigned_to, customer_id, created_at, customers(full_name, customer_code)',
      { count: 'exact' },
    )
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(query.limit);

  if (query.filter === 'open') builder = builder.in('status', OPEN_STATUSES);
  else if (query.filter === 'completed') builder = builder.in('status', TERMINAL_STATUSES);
  else if (query.filter === 'pending_documents' || query.filter === 'submitted') {
    builder = builder.eq('status', query.filter);
  }

  if (query.category) builder = builder.eq('category', query.category);
  if (query.customerId) builder = builder.eq('customer_id', query.customerId);
  if (query.q) {
    const like = `%${query.q}%`;
    builder = builder.or(
      `title.ilike.${like},portal_name.ilike.${like},portal_reference_number.ilike.${like}`,
    );
  }

  const { data, error, count } = await builder;
  if (error) throw error;

  return ok({ applications: data ?? [], total: count ?? (data ?? []).length });
});

/** POST /api/applications — create, optionally seeding the document checklist from an adapter. */
export const POST = handler('api.applications.create', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'application.create');

  const input = await parseBody(request, createApplicationSchema);

  const { data: customer, error: customerError } = await context.supabase
    .from('customers')
    .select('id')
    .eq('id', input.customerId)
    .eq('organization_id', context.organization.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customer) throw notFound('errors.not_found');

  let adapter: Pick<
    PortalAdapterRow,
    'id' | 'portal_name' | 'form_name' | 'document_requirements'
  > | null = null;
  if (input.portalAdapterId) {
    const { data, error } = await context.supabase
      .from('portal_adapters')
      .select('id, portal_name, form_name, document_requirements')
      .eq('id', input.portalAdapterId)
      .or(`organization_id.is.null,organization_id.eq.${context.organization.id}`)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound('errors.portal_adapter_not_found');
    adapter = data;
  }

  const { data: application, error } = await context.supabase
    .from('applications')
    .insert({
      organization_id: context.organization.id,
      customer_id: input.customerId,
      portal_adapter_id: input.portalAdapterId ?? null,
      title: input.title,
      category: input.category,
      portal_name: input.portalName ?? adapter?.portal_name ?? null,
      form_name: input.formName ?? adapter?.form_name ?? null,
      portal_url: input.portalUrl || null,
      deadline_at: input.deadlineAt || null,
      amount_charged: input.amountCharged ?? null,
      payment_status: input.paymentStatus ?? null,
      // The insert trigger sums these into amount_charged and issues the bill number (0050).
      govt_fee: input.govtFee ?? null,
      service_charge: input.serviceCharge ?? null,
      assigned_to: input.assignedTo ?? null,
      notes: input.notes ?? null,
      created_by: context.userId,
    })
    .select('id')
    .single();
  if (error) throw error;

  const requirements = (adapter?.document_requirements ?? []) as Array<{
    key: string;
    label?: string;
    required?: boolean;
  }>;
  if (requirements.length > 0) {
    const { error: checklistError } = await context.supabase.from('application_documents').insert(
      requirements.map((requirement) => ({
        organization_id: context.organization.id,
        application_id: application.id as string,
        requirement_key: requirement.key,
        requirement_label: requirement.label ?? null,
        status: 'required' as const,
      })),
    );
    if (checklistError) throw checklistError;
  }

  /*
   * Bidirectional link (docs plan: multi-stage form journey). The fill session that produced
   * this application was created before the application existed, so it could not name it at
   * insert time — patched in now that the application row is here. Scoped to this org and
   * customer so a stray or mismatched id cannot relink someone else's session.
   */
  if (input.fillSessionId) {
    const { error: linkError } = await context.supabase
      .from('fill_sessions')
      .update({ application_id: application.id })
      .eq('id', input.fillSessionId)
      .eq('organization_id', context.organization.id)
      .eq('customer_id', input.customerId);
    if (linkError) throw linkError;
  }

  await writeAuditLog(context, {
    action: 'application.created',
    entityType: 'application',
    entityId: application.id as string,
    metadata: { category: input.category, fromAdapter: Boolean(adapter) },
  });

  return created({ application: { id: application.id } satisfies Pick<ApplicationRow, 'id'> });
});
