import Link from 'next/link';
import { Card } from '@assistigo/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';

export const metadata = { title: 'Document tools' };

const TOOLS = [
  {
    href: '/document-tools/photo-signature',
    icon: '🪪',
    titleKey: 'documentTools.hub.photoSignature.title',
    descriptionKey: 'documentTools.hub.photoSignature.description',
  },
  {
    href: '/document-tools/passport-grid',
    icon: '🖼️',
    titleKey: 'documentTools.hub.passportGrid.title',
    descriptionKey: 'documentTools.hub.passportGrid.description',
  },
  {
    href: '/document-tools/pvc-card',
    icon: '💳',
    titleKey: 'documentTools.hub.pvcCard.title',
    descriptionKey: 'documentTools.hub.pvcCard.description',
  },
  {
    href: '/document-tools/pdf-studio',
    icon: '📄',
    titleKey: 'documentTools.hub.pdfStudio.title',
    descriptionKey: 'documentTools.hub.pdfStudio.description',
  },
] as const;

/**
 * Document tools hub.
 * Master spec §13 — the entry point for the photo, signature, print and PDF tools.
 *
 * Four cards rather than a search box: there are only four tools, and an operator learns their
 * shapes within a day and comes straight back to the one they need. A future fifth tool grows
 * this grid, not a menu.
 */
export default async function DocumentToolsHubPage() {
  await requirePagePermission('documenttool.use');
  const { t } = await getTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('documentTools.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('documentTools.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-2">
                <span aria-hidden className="text-2xl">
                  {tool.icon}
                </span>
                <h2 className="text-sm font-semibold text-slate-900">{t(tool.titleKey)}</h2>
                <p className="text-sm text-slate-500">{t(tool.descriptionKey)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card title={t('documentTools.hub.privacyTitle')}>
        <p className="text-sm text-slate-600">{t('documentTools.hub.privacyBody')}</p>
      </Card>
    </div>
  );
}
