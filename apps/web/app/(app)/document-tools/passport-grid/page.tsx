import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { PassportGridEditor } from '@/components/document-tools/passport-grid-editor';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Passport photo grid' };

const FEATURE_KEYS = [
  'documentTools.grid.features.autoCrop',
  'documentTools.grid.features.printReady',
  'documentTools.grid.features.multipleSizes',
  'documentTools.grid.features.highQuality',
] as const;

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

  const header = (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-brand-50/70 px-5 py-5 shadow-sm sm:px-6">
      <div className="relative z-10 min-w-0 md:max-w-[62%]">
        <Link
          href="/document-tools"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('documentTools.title')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
          {t('documentTools.hub.passportGrid.title')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {t('documentTools.hub.passportGrid.description')}
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <CircleCheck
                className="h-4 w-4 shrink-0 fill-emerald-500 text-white"
                strokeWidth={2.2}
                aria-hidden
              />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      {/*
        * Stock artwork of a made-up person, shot on a pale backdrop; `mix-blend-multiply` drops
        * the backdrop so the sheets sit on the card's gradient.
        */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] select-none md:block"
      >
        <Image
          src="/document-tools/passport-grid-header-vignette.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 320px, 38vw"
          className="object-contain object-right mix-blend-multiply"
        />
      </div>
    </div>
  );

  return (
    <PassportGridEditor
      header={header}
      customers={customers}
      defaultCustomerId={validCustomerId}
      today={todayIso()}
    />
  );
}
