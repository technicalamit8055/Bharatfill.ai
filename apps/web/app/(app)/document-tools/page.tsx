import Image from 'next/image';
import { CircleCheck, Monitor, ShieldCheck } from 'lucide-react';
import { ToolCardGrid } from '@/components/document-tools/tool-card-grid';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { BANNER_BENEFIT_KEYS, DOCUMENT_TOOL_CARDS } from '@/lib/document-tools/hub';

export const metadata = { title: 'Document tools' };

/** Each card opens the dashboard copy of its tool. */
const APP_HREFS = Object.fromEntries(
  DOCUMENT_TOOL_CARDS.map((card) => [card.id, card.href]),
) as Record<(typeof DOCUMENT_TOOL_CARDS)[number]['id'], string>;

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
            <p className="mt-3 text-sm text-slate-600 sm:text-base">
              {t('documentTools.subtitle')}
            </p>
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

      <ToolCardGrid t={t} hrefs={APP_HREFS} />

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
