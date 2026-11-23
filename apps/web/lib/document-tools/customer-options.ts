import 'server-only';

import { maskLast4 } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '@/lib/supabase/server';
import type { CustomerRow } from '@/lib/supabase/database.types';

/**
 * The customer picker every tool page offers.
 *
 * Shared with the document upload form's own picker (`documents/upload/page.tsx`): a recency
 * list, not a search box. §13.3 asks that a prepared file can be attached to a customer, not that
 * every customer in the organization be reachable from a `<select>` — an operator with a large
 * customer base attaches from the customer's own profile instead, where the search box lives.
 */
export async function loadCustomerOptions(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
): Promise<{ id: string; label: string }[]> {
  const { data } = await supabase
    .from('customers')
    .select('id, full_name, customer_code, mobile')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  return ((data ?? []) as Partial<CustomerRow>[]).map((customer) => {
    const last4 = maskLast4(customer.mobile ?? null);
    return {
      id: String(customer.id),
      label: last4 ? `${customer.full_name} · ••••${last4}` : String(customer.full_name ?? ''),
    };
  });
}
