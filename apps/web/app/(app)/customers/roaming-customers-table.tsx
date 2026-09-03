import Link from 'next/link';
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatGrantRemaining, grantRemainingMs } from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { RoamingLinkedCustomerRow } from '@/lib/supabase/database.types';

/** This centre's roaming list: everyone bookmarked here, locked or under an active grant. */
export async function RoamingCustomersTable({ organizationId }: { organizationId: string }) {
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('roaming_linked_customers', {
    p_organization_id: organizationId,
    p_limit: 50,
  });
  if (error) throw error;

  const customers = (data ?? []) as RoamingLinkedCustomerRow[];

  if (customers.length === 0) {
    return <EmptyState title={t('customers.roaming.emptyList')} />;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>{t('customers.name')}</TH>
          <TH>{t('customers.mobile')}</TH>
          <TH>{t('customers.district')}</TH>
          <TH>{t('customers.roaming.accessColumn')}</TH>
        </TR>
      </THead>
      <TBody>
        {customers.map((customer) => {
          const remaining = customer.has_active_grant
            ? grantRemainingMs({ status: 'active', expiresAt: customer.grant_expires_at })
            : 0;
          return (
            <TR key={customer.customer_id}>
              <TD>
                <Link
                  href={`/customers/${customer.customer_id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {customer.given_name}
                  {customer.family_initial ? ` ${customer.family_initial}.` : ''}
                </Link>
              </TD>
              <TD className="tabular-nums text-slate-600">•••••• {customer.mobile_last4}</TD>
              <TD className="text-slate-600">{customer.district ?? '—'}</TD>
              <TD>
                {remaining > 0 ? (
                  <Badge tone="success">
                    🟢{' '}
                    {t('customers.roaming.activeShort', {
                      remaining: formatGrantRemaining(remaining),
                    })}
                  </Badge>
                ) : (
                  <Badge tone="neutral">🔒 {t('customers.roaming.lockedShort')}</Badge>
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
