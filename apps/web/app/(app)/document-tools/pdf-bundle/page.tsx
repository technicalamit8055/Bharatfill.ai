import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PdfBundleEditor } from '@/components/document-tools/pdf-bundle-editor';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'PDF bundle' };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Several of a customer's stored documents as one PDF under a size limit.
 *
 * The page needs `documenttool.use`. Reading the documents also needs `document.view` and
 * `document.download`. Those are checked here only to explain an empty screen; the list and
 * signed-URL routes enforce them again, as does RLS.
 */
export default async function PdfBundlePage({
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
  const canReadDocuments =
    session.permissions.has('document.view') && session.permissions.has('document.download');

  const header = (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-brand-50/70 px-5 py-5 shadow-sm sm:px-6">
      <Link
        href="/document-tools/pdf-studio"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t('documentTools.hub.pdfStudio.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
        {t('documentTools.bundle.title')}
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
        {t('documentTools.bundle.description')}
      </p>
    </div>
  );

  return (
    <PdfBundleEditor
      header={header}
      customers={customers}
      defaultCustomerId={validCustomerId}
      canReadDocuments={canReadDocuments}
      today={todayIso()}
    />
  );
}
