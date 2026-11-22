import type { Metadata } from 'next';
import Image from 'next/image';
import { CircleCheck, Monitor, ShieldCheck } from 'lucide-react';
import { PublicToolDetails } from '@/components/document-tools/public-tool-details';
import { ToolCardGrid } from '@/components/document-tools/tool-card-grid';
import type { DocumentToolId } from '@/lib/document-tools/hub';
import { PUBLIC_TOOLS, publicToolCopyKey } from '@/lib/document-tools/public-tools';
import { publicHubMetadata, visitorLooksSignedIn } from '@/lib/document-tools/public-tools.server';
import { absoluteUrl, itemListLd } from '@/lib/document-tools/structured-data';
import { getTranslations } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return publicHubMetadata(t);
}

const BENEFIT_KEYS = [
  'publicTools.benefits.free',
  'publicTools.benefits.private',
  'publicTools.benefits.presets',
  'publicTools.benefits.print',
] as const;

const PUBLIC_HREFS = Object.fromEntries(PUBLIC_TOOLS.map((tool) => [tool.id, tool.href])) as Record<
  DocumentToolId,
  string
>;

/**
 * The free document tools hub — the same four cards as the dashboard's `/document-tools`, each
 * opening the tool's public page. Below them, what a free account adds and the shared FAQ.
 */
export default async function PublicToolsHubPage() {
  const { t, locale } = await getTranslations();
  const signedIn = await visitorLooksSignedIn();

  const toolList = itemListLd(
    PUBLIC_TOOLS.map((tool) => ({
      name: t(publicToolCopyKey(tool.id, 'heading')),
      url: absoluteUrl(tool.href),
    })),
  );

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-[#f1f7ff] via-[#e9f2fe] to-[#dfecfd]">
        {/* Stock artwork of photos, a signature and a PDF — no real document. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[460px] select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_88%,transparent_100%)] md:block lg:right-[230px] xl:w-[520px]"
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

        <div className="relative flex min-h-[220px] items-center justify-between gap-6 px-6 py-8 sm:px-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              {t('publicTools.hub.eyebrow')}
            </span>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              {t('publicTools.hub.title')}
            </h1>
            <p className="mt-3 text-sm text-slate-600 sm:text-base">
              {t('publicTools.hub.subtitle')}
            </p>
          </div>

          <ul className="hidden w-[210px] shrink-0 space-y-3 lg:block">
            {BENEFIT_KEYS.map((key) => (
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

      <ToolCardGrid t={t} hrefs={PUBLIC_HREFS} />

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

      <PublicToolDetails t={t} locale={locale} signedIn={signedIn} extraJsonLd={[toolList]} />
    </>
  );
}
