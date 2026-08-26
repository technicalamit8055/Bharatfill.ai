import { PhotoSignatureEditor } from '@/components/document-tools/photo-signature-editor';
import { ToolPageHeader } from '@/components/document-tools/tool-shell';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Photo & signature studio' };

/** ISO date only — a full timestamp would make the filename change every re-render. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PhotoSignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; documentId?: string; preset?: string }>;
}) {
  const session = await requirePagePermission('documenttool.use');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const { customerId, documentId, preset } = await searchParams;

  const customers = await loadCustomerOptions(supabase, session.organization.id);
  const validCustomerId = customers.some((customer) => customer.id === customerId)
    ? (customerId ?? null)
    : null;

  return (
    <div className="space-y-4">
      <ToolPageHeader
        title={t('documentTools.hub.photoSignature.title')}
        description={t('documentTools.hub.photoSignature.description')}
      />
      <PhotoSignatureEditor
        customers={customers}
        defaultCustomerId={validCustomerId}
        defaultPresetCode={preset ?? null}
        sourceDocumentId={documentId ?? null}
        today={todayIso()}
      />
    </div>
  );
}
