import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import type { CustomerRow } from '@/lib/supabase/database.types';
import { NewApplicationForm } from './new-application-form';

export const metadata = { title: 'New application' };

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('application.create');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const customerId = typeof params.customerId === 'string' ? params.customerId : undefined;
  const portalAdapterId =
    typeof params.portalAdapterId === 'string' ? params.portalAdapterId : undefined;
  const portalName = typeof params.portalName === 'string' ? params.portalName : undefined;
  const formName = typeof params.formName === 'string' ? params.formName : undefined;

  const [catalog, preselectedCustomer] = await Promise.all([
    loadAdapterCatalog(supabase, session.organization.id),
    customerId
      ? supabase
          .from('customers')
          .select('id, full_name, customer_code')
          .eq('id', customerId)
          .eq('organization_id', session.organization.id)
          .is('deleted_at', null)
          .maybeSingle()
          .then((result) => result.data as Pick<CustomerRow, 'id' | 'full_name' | 'customer_code'> | null)
      : Promise.resolve(null),
  ]);

  const adapters = catalog
    .filter((adapter) => adapter.persisted && adapter.status !== 'deprecated')
    .map((adapter) => ({
      id: adapter.id,
      portalName: adapter.portalName,
      formName: adapter.formName,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('applications.new')}</h1>
      </div>
      <NewApplicationForm
        adapters={adapters}
        preselectedCustomer={preselectedCustomer}
        defaultPortalAdapterId={portalAdapterId}
        defaultPortalName={portalName}
        defaultFormName={formName}
      />
    </div>
  );
}
