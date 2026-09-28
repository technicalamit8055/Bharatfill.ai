import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDownUp,
  ArrowLeft,
  CircleCheck,
  FilePlus2,
  FoldVertical,
  RotateCcw,
  Scissors,
  type LucideIcon,
} from 'lucide-react';
import { PdfStudioEditor } from '@/components/document-tools/pdf-studio-editor';
import { requirePagePermission } from '@/lib/auth/session';
import { loadCustomerOptions } from '@/lib/document-tools/customer-options';
import { PDF_ARTWORK, PDF_FEATURES, type PdfFeatureId } from '@/lib/document-tools/pdf-studio';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'PDF studio' };

const FEATURE_ICONS: Record<PdfFeatureId, { icon: LucideIcon; className: string }> = {
  merge: { icon: FilePlus2, className: 'text-brand-600' },
  split: { icon: Scissors, className: 'text-brand-600' },
  reorder: { icon: ArrowDownUp, className: 'text-emerald-600' },
  rotate: { icon: RotateCcw, className: 'text-violet-600' },
  compress: { icon: FoldVertical, className: 'text-orange-500' },
  portalReady: { icon: CircleCheck, className: 'fill-emerald-500 text-white' },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PdfStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; preset?: string }>;
}) {
  const session = await requirePagePermission('documenttool.use');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const { customerId, preset } = await searchParams;

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
          {t('documentTools.hub.pdfStudio.title')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {t('documentTools.hub.pdfStudio.description')}
        </p>
      </div>

      <ul className="relative z-10 mt-4 flex flex-wrap gap-2">
        {PDF_FEATURES.map((feature) => {
          const { icon: Icon, className } = FEATURE_ICONS[feature.id];
          return (
            <li
              key={feature.id}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
            >
              <Icon className={`h-4 w-4 shrink-0 ${className}`} strokeWidth={2} aria-hidden />
              {t(feature.labelKey)}
            </li>
          );
        })}
      </ul>

      {/*
       * Stock artwork of a photo turning into a PDF, shot on white; `mix-blend-multiply` drops
       * the white so it sits on the card's gradient. Kept above the pill row so the pills never
       * sit on top of it.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-2 top-0 hidden h-[150px] w-[36%] select-none md:block"
      >
        <Image
          src={PDF_ARTWORK.headerVignette}
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 300px, 36vw"
          className="object-contain object-right mix-blend-multiply"
        />
      </div>
    </div>
  );

  return (
    <PdfStudioEditor
      header={header}
      customers={customers}
      defaultCustomerId={validCustomerId}
      defaultPresetCode={preset ?? null}
      today={todayIso()}
    />
  );
}
