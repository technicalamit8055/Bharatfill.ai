import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CircleCheck,
  CreditCard,
  FileText,
  ImageIcon,
  LayoutGrid,
  Merge,
  Minimize2,
  Monitor,
  RotateCw,
  ShieldCheck,
  Split,
  type LucideIcon,
} from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import {
  BANNER_BENEFIT_KEYS,
  DOCUMENT_TOOL_CARDS,
  PDF_ACTION_KEYS,
  type DocumentToolId,
} from '@/lib/document-tools/hub';

export const metadata = { title: 'Document tools' };

type Translate = Awaited<ReturnType<typeof getTranslations>>['t'];

/**
 * One colour family per tool, written out in full so Tailwind can see every class. The card's
 * icon tile, arrow, chips and preview backdrop all come from the same family, which is what
 * lets an operator find "the green one" at a glance.
 */
const ACCENT: Record<
  DocumentToolId,
  { icon: LucideIcon; tile: string; arrow: string; chip: string; preview: string }
> = {
  photoSignature: {
    icon: ImageIcon,
    tile: 'bg-blue-100 text-blue-600',
    arrow: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
    chip: 'bg-blue-50 text-blue-700',
    preview: 'from-blue-50 via-sky-50 to-blue-100/70',
  },
  passportGrid: {
    icon: LayoutGrid,
    tile: 'bg-emerald-100 text-emerald-600',
    arrow: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white',
    chip: 'bg-emerald-50 text-emerald-700',
    preview: 'from-emerald-50 via-green-50 to-emerald-100/70',
  },
  pvcCard: {
    icon: CreditCard,
    tile: 'bg-orange-100 text-orange-600',
    arrow: 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white',
    chip: 'bg-orange-50 text-orange-700',
    preview: 'from-orange-50 via-amber-50 to-orange-100/70',
  },
  pdfStudio: {
    icon: FileText,
    tile: 'bg-violet-100 text-violet-600',
    arrow: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white',
    chip: 'bg-violet-50 text-violet-700',
    preview: 'from-violet-50 via-fuchsia-50 to-violet-100/70',
  },
};

const PDF_ACTION_ICONS: Record<(typeof PDF_ACTION_KEYS)[number], { icon: LucideIcon; tone: string }> = {
  'documentTools.hub.pdfActions.merge': { icon: Merge, tone: 'bg-rose-100 text-rose-600' },
  'documentTools.hub.pdfActions.split': { icon: Split, tone: 'bg-blue-100 text-blue-600' },
  'documentTools.hub.pdfActions.rotate': { icon: RotateCw, tone: 'bg-orange-100 text-orange-600' },
  'documentTools.hub.pdfActions.compress': { icon: Minimize2, tone: 'bg-emerald-100 text-emerald-600' },
};

/**
 * Document tools hub.
 * Master spec §13 — the entry point for the photo, signature, print and PDF tools.
 *
 * Four cards rather than a search box: there are only four tools, and an operator learns their
 * shapes within a day and comes straight back to the one they need. A future fifth tool grows
 * this grid, not a menu.
 *
 * Every picture on this page is stock artwork of made-up people and sample cards — no customer
 * document is ever shown here.
 */
export default async function DocumentToolsHubPage() {
  await requirePagePermission('documenttool.use');
  const { t } = await getTranslations();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#f1f7ff] via-[#e9f2fe] to-[#dfecfd]">
        {/*
          * The photo / signature / PDF artwork, right-aligned and held clear of the benefits
          * column on wide screens. Its left edge is already pale blue, and the mask fades both
          * seams so the tricolour ribbon never runs under the checklist text.
          */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[460px] select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_88%,transparent_100%)] md:block lg:right-[210px] xl:right-[230px] xl:w-[520px]"
        >
          <Image
            src="/document-tools/document-tools-banner-hero.png"
            alt=""
            width={1376}
            height={768}
            priority
            sizes="(min-width: 1280px) 620px, 540px"
            className="absolute right-0 top-1/2 h-[135%] w-auto max-w-none -translate-y-1/2"
          />
        </div>

        <div className="relative flex min-h-[200px] items-center justify-between gap-6 px-6 py-7 sm:px-8">
          <div className="max-w-md">
            <span className="inline-flex items-center rounded-md bg-brand-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              {t('documentTools.title')}
            </span>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              <span className="block">{t('documentTools.hub.headlineLead')}</span>
              <span className="block">
                {t('documentTools.hub.headlineJoin')}{' '}
                <span className="text-brand-600">{t('documentTools.hub.headlineHighlight')}</span>
              </span>
            </h1>
            <p className="mt-3 text-sm text-slate-600 sm:text-base">{t('documentTools.subtitle')}</p>
          </div>

          <ul className="hidden w-[190px] shrink-0 space-y-3 lg:block xl:w-[210px]">
            {BANNER_BENEFIT_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-2.5 text-sm text-slate-700">
                <CircleCheck
                  className="h-5 w-5 shrink-0 fill-emerald-500 text-white"
                  strokeWidth={2.2}
                  aria-hidden
                />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {DOCUMENT_TOOL_CARDS.map((tool) => {
          const accent = ACCENT[tool.id];
          const Icon = accent.icon;
          const title = t(tool.titleKey);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              aria-label={t('documentTools.hub.openTool', { tool: title })}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${accent.tile}`}
                  >
                    <Icon className="h-7 w-7" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${accent.arrow}`}
                  >
                    <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {t(tool.descriptionKey)}
                </p>

                <ul className="mt-4 flex flex-wrap gap-2">
                  {tool.tagKeys.map((key) => (
                    <li
                      key={key}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${accent.chip}`}
                    >
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                aria-hidden
                className={`relative h-40 overflow-hidden bg-gradient-to-br ${accent.preview}`}
              >
                <ToolPreview id={tool.id} t={t} />
              </div>
            </Link>
          );
        })}
      </div>

      <section className="flex flex-col gap-5 rounded-2xl border border-brand-100 bg-gradient-to-r from-[#f3f8ff] to-white p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Monitor className="h-7 w-7" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {t('documentTools.hub.privacyTitle')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {t('documentTools.hub.privacyBody')}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <ShieldCheck className="h-10 w-10 text-emerald-600" strokeWidth={1.8} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {t('documentTools.hub.privacyBadgeTitle')}
            </p>
            <p className="text-xs text-slate-500">{t('documentTools.hub.privacyBadgeBody')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The illustration at the foot of each card. Decorative — the card's title and chips already
 * say what the tool does — so the wrapper is `aria-hidden` and every image has empty alt text.
 *
 * The photo-sheet and PVC artworks are shot on white; `mix-blend-multiply` drops that white so
 * they sit on the card's tinted backdrop rather than in a pale box.
 */
function ToolPreview({ id, t }: { id: DocumentToolId; t: Translate }) {
  switch (id) {
    case 'photoSignature':
      return (
        <div className="absolute inset-0 flex items-end justify-center gap-0 pb-3">
          <div className="relative mb-1 h-[124px] w-[100px] rounded-sm border-2 border-dashed border-blue-400 bg-white p-1 shadow-md">
            <Image
              src="/home/thumb-photo.png"
              alt=""
              width={240}
              height={300}
              sizes="100px"
              className="h-full w-full rounded-[2px] object-cover"
            />
            {/* Crop handles at the four corners. */}
            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-[2px] bg-blue-500" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-[2px] bg-blue-500" />
            <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-[2px] bg-blue-500" />
            <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-[2px] bg-blue-500" />
          </div>
          <div className="-ml-3 mb-4 w-[124px] -rotate-3 overflow-hidden rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
            <Image
              src="/home/thumb-signature.png"
              alt=""
              width={390}
              height={250}
              sizes="124px"
              className="h-auto w-full"
            />
          </div>
        </div>
      );

    case 'passportGrid':
      return (
        <Image
          src="/document-tools/tool-preview-photo-grid.png"
          alt=""
          width={1200}
          height={896}
          sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 90vw"
          className="absolute left-1/2 top-2 h-auto w-[92%] max-w-[320px] -translate-x-1/2 -rotate-2 mix-blend-multiply"
        />
      );

    case 'pvcCard':
      return (
        <Image
          src="/document-tools/tool-preview-pvc-card.png"
          alt=""
          width={1200}
          height={896}
          sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 90vw"
          className="absolute left-1/2 top-1/2 h-auto w-[96%] max-w-[330px] -translate-x-1/2 -translate-y-[46%] mix-blend-multiply"
        />
      );

    case 'pdfStudio':
      return (
        <div className="absolute inset-0 flex items-center justify-center gap-3 px-4">
          <span className="flex h-[88px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/30">
            <FileText className="h-7 w-7" strokeWidth={1.8} />
            <span className="text-xs font-bold tracking-wide">PDF</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-violet-400" strokeWidth={2} />
          <ul className="min-w-0 space-y-1.5">
            {PDF_ACTION_KEYS.map((key) => {
              const { icon: ActionIcon, tone } = PDF_ACTION_ICONS[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/70"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${tone}`}>
                    <ActionIcon className="h-3 w-3" strokeWidth={2.2} />
                  </span>
                  <span className="truncate">{t(key)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      );
  }
}
