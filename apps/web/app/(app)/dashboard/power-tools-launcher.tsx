import Link from 'next/link';
import { Card } from '@assistigo/ui';
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
    permission: 'document.upload',
  },
  {
    href: '/document-tools/photo-signature',
    titleKey: 'dashboard.tools.photo.title',
    specKey: 'dashboard.tools.photo.spec',
    icon: <CameraIcon />,
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/photo-signature',
    titleKey: 'dashboard.tools.signature.title',
    specKey: 'dashboard.tools.signature.spec',
    icon: <SignatureIcon />,
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/pdf-studio',
    titleKey: 'dashboard.tools.pdf.title',
    specKey: 'dashboard.tools.pdf.spec',
    icon: <PdfIcon />,
    permission: 'documenttool.use',
  },
  {
    href: '/documents/upload',
    titleKey: 'dashboard.tools.ocr.title',
    specKey: 'dashboard.tools.ocr.spec',
    icon: <UploadIcon />,
    permission: 'document.upload',
  },
  {
    href: '/document-tools/pvc-card',
    titleKey: 'dashboard.tools.pvc.title',
    specKey: 'dashboard.tools.pvc.spec',
    icon: <IdCardIcon />,
    permission: 'documenttool.use',
  },
  {
    href: '/document-tools/passport-grid',
    titleKey: 'dashboard.tools.grid.title',
    specKey: 'dashboard.tools.grid.spec',
    icon: <GridIcon />,
    permission: 'documenttool.use',
  },
  {
    href: '/form-library',
    titleKey: 'dashboard.tools.autofill.title',
    specKey: 'dashboard.tools.autofill.spec',
    icon: <FormIcon />,
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
    <Card
      title={t('dashboard.tools.title')}
      actions={
        <Link
          href="/document-tools"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          {t('dashboard.viewAll')}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      }
      className="[&>div]:p-2"
    >
      {/* Rows rather than tiles: an operator picks a tool by reading its spec, so the text leads
          and the icon is a quiet grey marker beside it. */}
      <ul className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((tool) => (
          <li key={tool.titleKey}>
            <Link
              href={tool.href}
              className="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="mt-0.5 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {tool.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{t(tool.titleKey)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                  {t(tool.specKey)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
