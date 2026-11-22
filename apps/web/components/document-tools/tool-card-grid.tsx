import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  FileText,
  ImageIcon,
  LayoutGrid,
  Merge,
  Minimize2,
  RotateCw,
  Split,
  type LucideIcon,
} from 'lucide-react';
import {
  DOCUMENT_TOOL_CARDS,
  PDF_ACTION_KEYS,
  type DocumentToolId,
} from '@/lib/document-tools/hub';
import type { getTranslations } from '@/lib/i18n/server';

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

const PDF_ACTION_ICONS: Record<
  (typeof PDF_ACTION_KEYS)[number],
  { icon: LucideIcon; tone: string }
> = {
  'documentTools.hub.pdfActions.merge': { icon: Merge, tone: 'bg-rose-100 text-rose-600' },
  'documentTools.hub.pdfActions.split': { icon: Split, tone: 'bg-blue-100 text-blue-600' },
  'documentTools.hub.pdfActions.rotate': { icon: RotateCw, tone: 'bg-orange-100 text-orange-600' },
  'documentTools.hub.pdfActions.compress': {
    icon: Minimize2,
    tone: 'bg-emerald-100 text-emerald-600',
  },
};

/**
 * The four tool cards. Shared by the dashboard hub and the public `/tools` hub, which differ only
 * in where each card opens.
 */
export function ToolCardGrid({
  t,
  hrefs,
}: {
  t: Translate;
  hrefs: Record<DocumentToolId, string>;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {DOCUMENT_TOOL_CARDS.map((tool) => {
        const accent = ACCENT[tool.id];
        const Icon = accent.icon;
        const title = t(tool.titleKey);
        return (
          <Link
            key={tool.id}
            href={hrefs[tool.id]}
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
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${tone}`}
                  >
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
