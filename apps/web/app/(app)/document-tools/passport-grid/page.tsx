import { PassportGridEditor } from '@/components/document-tools/passport-grid-editor';
import { ToolPageHeader } from '@/components/document-tools/tool-shell';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Passport photo grid' };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PassportGridPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const session = await requirePagePermission('documenttool.use');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const { customerId } = await searchParams;

  const customers = await loadCustomerOptions(supabase, session.organization.id);
  const validCustomerId = customers.some((customer) => customer.id === customerId)
    ? (customerId ?? null)
    : null;

  return (
    <div className="space-y-4">
      <ToolPageHeader
        title={t('documentTools.hub.passportGrid.title')}
        description={t('documentTools.hub.passportGrid.description')}
      />
      <PassportGridEditor
        customers={customers}
        defaultCustomerId={validCustomerId}
        today={todayIso()}
      />
    </div>
  );
}
