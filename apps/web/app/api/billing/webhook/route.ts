import { handler, ok, parseBody } from '@/lib/api/response';
import { requireBearerSecret } from '@/lib/api/secret';
import { billingWebhookSchema } from '@/lib/billing/schema';
import { getBillingProvider } from '@/lib/billing/providers';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/billing/webhook — idempotent billing provider callback (§22.4).
 *
 * No user session: the caller is the payment provider, not a signed-in operator, so this route
 * runs with the service-role client and is gated entirely by `BILLING_WEBHOOK_SECRET`, the same
 * fail-closed shape as `/api/jobs/run`.
 */
export const POST = handler('api.billing.webhook', async (request) => {
  requireBearerSecret(request, serverEnv().BILLING_WEBHOOK_SECRET);
  const input = await parseBody(request, billingWebhookSchema);

  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('billing_webhook_events')
    .select('id')
    .eq('provider', input.provider)
    .eq('event_id', input.eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return ok({ result: 'ignored', reason: 'Already processed.' });

  const provider = getBillingProvider(supabase);
  const result = await provider.handleWebhook({
    providerEventId: input.eventId,
    eventType: input.eventType,
    payload: input.payload,
  });

  const { error: insertError } = await supabase.from('billing_webhook_events').insert({
    provider: input.provider,
    event_id: input.eventId,
    event_type: input.eventType,
    result: result.result,
  });
  // A concurrent delivery of the same event racing us here still lands on the unique
  // constraint — that is the idempotency guarantee, not a failure to report.
  if (insertError && insertError.code !== '23505') throw insertError;

  return ok(result);
});
