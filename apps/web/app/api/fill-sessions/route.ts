import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseQuery } from '@/lib/api/response';
import { fillSessionSearchSchema } from '@/lib/fill-sessions/schema';

/** GET /api/fill-sessions — the extension audit ledger (§18). */
export const GET = handler('api.fill_sessions.list', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'fill.run');

  const query = parseQuery(request, fillSessionSearchSchema);

  let builder = context.supabase
    .from('fill_sessions')
    .select(
      'id, customer_id, application_id, portal_adapter_id, page_origin, page_title, status, ' +
        'filled_fields_count, skipped_fields_count, proposed_fields_count, captcha_fields_count, ' +
        'otp_fields_count, payment_fields_count, created_by, created_at, ' +
        'customers(full_name, customer_code)',
      { count: 'exact' },
    )
    .eq('organization_id', context.organization.id)
    .order('created_at', { ascending: false })
    .limit(query.limit);

  if (query.status) builder = builder.eq('status', query.status);
  if (query.customerId) builder = builder.eq('customer_id', query.customerId);
  if (query.applicationId) builder = builder.eq('application_id', query.applicationId);
  if (query.q) {
    const like = `%${query.q}%`;
    builder = builder.or(`page_title.ilike.${like},page_origin.ilike.${like}`);
  }

  const { data, error, count } = await builder;
  if (error) throw error;

  return ok({ fillSessions: data ?? [], total: count ?? (data ?? []).length });
});
