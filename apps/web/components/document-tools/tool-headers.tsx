import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDownUp,
  ArrowLeft,
  CircleCheck,
  FilePlus2,
  FoldVertical,
  Info,
  Layers,
  RotateCcw,
  Scissors,
  type LucideIcon,
} from 'lucide-react';
import { Alert } from '@assistigo/ui';
import { PDF_ARTWORK, PDF_FEATURES, type PdfFeatureId } from '@/lib/document-tools/pdf-studio';
import { CARD_ARTWORK } from '@/lib/document-tools/pvc-card';
import type { getTranslations } from '@/lib/i18n/server';

/**
 * The header above each document tool, shared by the dashboard (`/document-tools/*`) and the
 * free public copies (`/tools/*`). The two differ only in where "back" goes and, on the public
 * pages, a search-friendly heading in place of the tool's dashboard name.
 *
 * Every picture here is stock artwork of made-up people and sample cards — never a customer's.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>['t'];

type HeaderProps = {
  t: Translate;
  backHref: string;
  backLabel: string;
  /** Defaults to the tool's dashboard title and description. */
  title?: string;
  description?: string;
};

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}

function BetaBadge({ t }: { t: Translate }) {
  return (
    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
      {t('documentTools.studio.beta')}
    </span>
  );
}

export function PhotoSignatureHeader({ t, backHref, backLabel, title, description }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <BackLink href={backHref} label={backLabel} />
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            {title ?? t('documentTools.hub.photoSignature.title')}
          </h1>
          <BetaBadge t={t} />
        </div>
        <p className="mt-1.5 max-w-xl text-sm text-slate-600">
          {description ?? t('documentTools.hub.photoSignature.description')}
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
}

const GRID_FEATURE_KEYS = [
  'documentTools.grid.features.autoCrop',
  'documentTools.grid.features.printReady',
  'documentTools.grid.features.multipleSizes',
  'documentTools.grid.features.highQuality',
] as const;

export function PassportGridHeader({ t, backHref, backLabel, title, description }: HeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-brand-50/70 px-5 py-5 shadow-sm sm:px-6">
      <div className="relative z-10 min-w-0 md:max-w-[62%]">
        <BackLink href={backHref} label={backLabel} />
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
          {title ?? t('documentTools.hub.passportGrid.title')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {description ?? t('documentTools.hub.passportGrid.description')}
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {GRID_FEATURE_KEYS.map((key) => (
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
}

/** Header and the masked-Aadhaar notice that sits under it. */
export function PvcCardHeader({ t, backHref, backLabel, title, description }: HeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <BackLink href={backHref} label={backLabel} />
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
              {title ?? t('documentTools.hub.pvcCard.title')}
            </h1>
            <BetaBadge t={t} />
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-slate-600">
            {description ?? t('documentTools.hub.pvcCard.description')}
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
    </>
  );
}

const PDF_FEATURE_ICONS: Record<PdfFeatureId, { icon: LucideIcon; className: string }> = {
  merge: { icon: FilePlus2, className: 'text-brand-600' },
  split: { icon: Scissors, className: 'text-brand-600' },
  reorder: { icon: ArrowDownUp, className: 'text-emerald-600' },
  rotate: { icon: RotateCcw, className: 'text-violet-600' },
  compress: { icon: FoldVertical, className: 'text-orange-500' },
  portalReady: { icon: CircleCheck, className: 'fill-emerald-500 text-white' },
};

export function PdfStudioHeader({
  t,
  backHref,
  backLabel,
  title,
  description,
  bundleHref,
  bundleLocked = false,
}: HeaderProps & {
  /** The PDF bundle button's target — the dashboard bundle, or sign-in on a public page. */
  bundleHref: string;
  /** Marks the button as needing an account. */
  bundleLocked?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-brand-50/70 px-5 py-5 shadow-sm sm:px-6">
      <div className="relative z-10 min-w-0 md:max-w-[62%]">
        <BackLink href={backHref} label={backLabel} />
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
          {title ?? t('documentTools.hub.pdfStudio.title')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {description ?? t('documentTools.hub.pdfStudio.description')}
        </p>
        <Link
          href={bundleHref}
          title={bundleLocked ? t('publicTools.gate.bundle') : undefined}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          <Layers className="h-4 w-4" aria-hidden />
          {t('documentTools.bundle.openFromStudio')}
          {bundleLocked ? (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              {t('publicTools.account.locked')}
            </span>
          ) : null}
        </Link>
      </div>

      <ul className="relative z-10 mt-4 flex flex-wrap gap-2">
        {PDF_FEATURES.map((feature) => {
          const { icon: Icon, className } = PDF_FEATURE_ICONS[feature.id];
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
}
