import Link from 'next/link';
import type { Permission } from '@assistigo/core';
import type { Translator } from '@/lib/i18n';
import {
  ArrowRightIcon,
  CameraIcon,
  FormIcon,
  GridIcon,
  IdCardIcon,
  PdfIcon,
  QrIcon,
  SignatureIcon,
  UploadIcon,
} from './icons';

type Tool = {
  href: string;
  titleKey: string;
  specKey: string;
  icon: React.ReactNode;
  accent: string;
  permission?: Permission;
};

/**
 * The counter's power tools — the six jobs an operator does between forms.
 *
 * Every tile points at a route that exists today. The size and dimension presets in the
 * subtitles are the portal requirements the tools already implement, not aspirations: an
 * operator picks a tile by recognising the spec, so a wrong number here sends them to the
 * wrong tool.
 */
const TOOLS: Tool[] = [
  {
    /*
     * Opens the dialog the hero pill opens, via the search param that component reads — so both
     * entry points share one dialog and one session, rather than each keeping their own.
     */
    href: '/dashboard?drop=1',
    titleKey: 'dashboard.tools.walkInDrop.title',
    specKey: 'dashboard.tools.walkInDrop.spec',
    icon: <QrIcon />,
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    permission: 'document.upload',
  },
  {
    href: '/document-tools/photo-signature',
    titleKey: 'dashboard.tools.photo.title',
    specKey: 'dashboard.tools.photo.spec',
    icon: <CameraIcon />,
    accent: 'bg-sky-50 text-sky-700 ring-sky-100',
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/photo-signature',
    titleKey: 'dashboard.tools.signature.title',
    specKey: 'dashboard.tools.signature.spec',
    icon: <SignatureIcon />,
    accent: 'bg-violet-50 text-violet-700 ring-violet-100',
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/pdf-studio',
    titleKey: 'dashboard.tools.pdf.title',
    specKey: 'dashboard.tools.pdf.spec',
    icon: <PdfIcon />,
    accent: 'bg-rose-50 text-rose-700 ring-rose-100',
    permission: 'documenttool.use',
  },
  {
    href: '/documents/upload',
    titleKey: 'dashboard.tools.ocr.title',
    specKey: 'dashboard.tools.ocr.spec',
    icon: <UploadIcon />,
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    permission: 'document.upload',
  },
  {
    href: '/document-tools/pvc-card',
    titleKey: 'dashboard.tools.pvc.title',
    specKey: 'dashboard.tools.pvc.spec',
    icon: <IdCardIcon />,
    accent: 'bg-amber-50 text-amber-700 ring-amber-100',
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/passport-grid',
    titleKey: 'dashboard.tools.grid.title',
    specKey: 'dashboard.tools.grid.spec',
    icon: <GridIcon />,
    accent: 'bg-slate-100 text-slate-700 ring-slate-200',
    permission: 'documenttool.use',
  },
  {
    href: '/form-library',
    titleKey: 'dashboard.tools.autofill.title',
    specKey: 'dashboard.tools.autofill.spec',
    icon: <FormIcon />,
    accent: 'bg-brand-50 text-brand-700 ring-brand-100',
    permission: 'fill.run',
  },
];

export function PowerToolsLauncher({
  permissions,
  t,
}: {
  permissions: ReadonlySet<string>;
  t: Translator;
}) {
  const visible = TOOLS.filter((tool) => !tool.permission || permissions.has(tool.permission));
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="power-tools-heading" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="power-tools-heading" className="text-sm font-semibold text-slate-900">
          {t('dashboard.tools.title')}
        </h2>
        <Link
          href="/document-tools"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
        >
          {t('dashboard.viewAll')}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Eight tiles since the walk-in drop joined, so the widest breakpoint gains a column
          rather than wrapping one tile onto a second row on its own. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {visible.map((tool, index) => (
          <Link
            key={tool.titleKey}
            href={tool.href}
            className="group flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm command-tile animate-fade-in-up hover:border-brand-200"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${tool.accent}`}
            >
              {tool.icon}
            </span>
            <span className="text-sm font-medium leading-snug text-slate-900">
              {t(tool.titleKey)}
            </span>
            <span className="text-[11px] leading-snug text-slate-500">{t(tool.specKey)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
