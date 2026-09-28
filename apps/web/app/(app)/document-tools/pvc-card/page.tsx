import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import { Alert } from '@assistigo/ui';
import { PvcCardEditor } from '@/components/document-tools/pvc-card-editor';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { CARD_ARTWORK } from '@/lib/document-tools/pvc-card';
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
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/document-tools"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('documentTools.title')}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
              {t('documentTools.hub.pvcCard.title')}
            </h1>
            <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              {t('documentTools.studio.beta')}
            </span>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-slate-600">
            {t('documentTools.hub.pvcCard.description')}
          </p>
        </div>

        {/*
          * Stock artwork of made-up cards with a fictional name and an already-masked number,
          * shot on white; `mix-blend-multiply` drops the white so it sits on the page background.
          */}
        <div
          aria-hidden
          className="relative hidden h-[130px] w-[232px] shrink-0 select-none md:block lg:h-[160px] lg:w-[286px]"
        >
          <Image
            src={CARD_ARTWORK.headerVignette}
            alt=""
            fill
            priority
            sizes="286px"
            className="object-contain mix-blend-multiply"
          />
        </div>
      </div>

      <Alert tone="info" className="rounded-xl">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 fill-brand-600 text-white" aria-hidden />
          <p>{t('documentTools.card.notice')}</p>
        </div>
      </Alert>

      <PvcCardEditor customers={customers} defaultCustomerId={validCustomerId} today={todayIso()} />
    </div>
  );
}
