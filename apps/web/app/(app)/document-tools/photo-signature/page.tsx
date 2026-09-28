import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { findPreset } from '@assistigo/document-tools';
import { PhotoSignatureEditor } from '@/components/document-tools/photo-signature-editor';
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

  // A deep link (e.g. the extension's document attachment helper) can point at a signature
  // preset; the editor needs to open in the matching mode or the preset picker filters it out.
  const resolvedPreset = preset ? findPreset(preset) : null;

  const header = (
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
            {t('documentTools.hub.photoSignature.title')}
          </h1>
          <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            {t('documentTools.studio.beta')}
          </span>
        </div>
        <p className="mt-1.5 max-w-xl text-sm text-slate-600">
          {t('documentTools.hub.photoSignature.description')}
        </p>
      </div>

      {/*
        * Stock artwork of a made-up person, shot on white; `mix-blend-multiply` drops the white
        * so it sits on the page background. The frame crops the artwork's empty margins.
        */}
      <div
        aria-hidden
        className="relative hidden h-[130px] w-[230px] shrink-0 select-none overflow-hidden md:block lg:h-[150px] lg:w-[270px]"
      >
        <Image
          src="/document-tools/photo-studio-header-vignette.png"
          alt=""
          fill
          priority
          sizes="270px"
          className="object-cover mix-blend-multiply"
        />
      </div>
    </div>
  );

  return (
    <PhotoSignatureEditor
      header={header}
      customers={customers}
      defaultCustomerId={validCustomerId}
      defaultPresetCode={preset ?? null}
      defaultMode={resolvedPreset?.category === 'signature' ? 'signature' : 'photo'}
      sourceDocumentId={documentId ?? null}
      today={todayIso()}
    />
  );
}
