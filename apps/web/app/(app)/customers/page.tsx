import Link from 'next/link';
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatIndianDate, maskLast4 } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CustomerRow } from '@/lib/supabase/database.types';
import { CustomerSearchBox } from './customer-search-box';
import { RoamingLookup } from './roaming-lookup';
import { RoamingCustomersTable } from './roaming-customers-table';

const BUTTON_LINK =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export const metadata = { title: 'Customers' };

const VERIFICATION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  unverified: 'neutral',
  extracted: 'info',
  operator_verified: 'success',
  customer_confirmed: 'success',
  expired: 'warning',
  rejected: 'warning',
};

const VIEW_FILTERS = ['all', 'roaming'] as const;
type ViewFilter = (typeof VIEW_FILTERS)[number];

function isViewFilter(value: string | undefined): value is ViewFilter {
  return Boolean(value) && (VIEW_FILTERS as readonly string[]).includes(value ?? '');
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('customer.view');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const view: ViewFilter = isViewFilter(params.view as string | undefined)
    ? (params.view as ViewFilter)
    : 'all';

  const { data } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, mobile, address_json, verification_status, created_at')
    .eq('organization_id', session.organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(25);

  const customers = (data ?? []) as Partial<CustomerRow>[];
  const canCreate = session.permissions.has('customer.create');
  const canLinkRoaming = session.permissions.has('customer.roaming_link');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('customers.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canLinkRoaming ? <RoamingLookup /> : null}
          {canCreate ? (
            <Link href="/customers/new" className={BUTTON_LINK}>
              {t('customers.new')}
            </Link>
          ) : null}
        </div>
      </div>

      {canLinkRoaming ? (
        <div className="flex gap-1 border-b border-slate-200">
          <Link
            href="/customers"
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              view === 'all'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('customers.roaming.tabAll')}
          </Link>
          <Link
            href="/customers?view=roaming"
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              view === 'roaming'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🌐 {t('customers.roaming.tabRoaming')}
          </Link>
        </div>
      ) : null}

      {view === 'roaming' ? (
        <Card>
          <RoamingCustomersTable organizationId={session.organization.id} />
        </Card>
      ) : (
        <>
          <CustomerSearchBox />

          <Card>
            {customers.length === 0 ? (
              <EmptyState
                title={t('customers.emptyFirst')}
                description={canCreate ? undefined : t('customers.empty')}
                action={
                  canCreate ? (
                    <Link href="/customers/new" className={BUTTON_LINK}>
                      {t('customers.new')}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('customers.code')}</TH>
                    <TH>{t('customers.name')}</TH>
                    <TH>{t('customers.mobile')}</TH>
                    <TH>{t('customers.district')}</TH>
                    <TH>{t('settings.status')}</TH>
                    <TH>{t('customers.created')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {customers.map((customer) => (
                    <TR key={customer.id}>
                      <TD>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-mono text-xs text-brand-700 hover:underline"
                        >
                          {customer.customer_code}
                        </Link>
                      </TD>
                      <TD>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {customer.full_name}
                        </Link>
                      </TD>
                      <TD className="tabular-nums text-slate-600">
                        {maskLast4(customer.mobile ?? null)
                          ? `•••••• ${maskLast4(customer.mobile ?? null)}`
                          : '—'}
                      </TD>
                      <TD className="text-slate-600">
                        {(customer.address_json as { current?: { district?: string } } | undefined)
                          ?.current?.district ?? '—'}
                      </TD>
                      <TD>
                        <Badge
                          tone={VERIFICATION_TONE[customer.verification_status ?? ''] ?? 'neutral'}
                        >
                          {customer.verification_status}
                        </Badge>
                      </TD>
                      <TD className="text-slate-500">
                        {formatIndianDate(customer.created_at?.slice(0, 10)) ?? '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
