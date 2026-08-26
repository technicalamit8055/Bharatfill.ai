import { Alert } from '@assistigo/ui';
import { PvcCardEditor } from '@/components/document-tools/pvc-card-editor';
import { ToolPageHeader } from '@/components/document-tools/tool-shell';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'PVC card & Aadhaar masking' };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PvcCardPage({
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
        title={t('documentTools.hub.pvcCard.title')}
        description={t('documentTools.hub.pvcCard.description')}
        notice={<Alert tone="info">{t('documentTools.card.notice')}</Alert>}
      />
      <PvcCardEditor customers={customers} defaultCustomerId={validCustomerId} today={todayIso()} />
    </div>
  );
}
