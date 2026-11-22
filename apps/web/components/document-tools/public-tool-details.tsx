import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  Layers,
  LockKeyhole,
  UserPlus,
  Wand2,
  FolderHeart,
  type LucideIcon,
} from 'lucide-react';
import { LaunchCta } from '@/components/landing/launch-dialog';
import type { DocumentToolId } from '@/lib/document-tools/hub';
import { PDF_BUNDLE_HREF } from '@/lib/document-tools/pdf-bundle';
import {
  ACCOUNT_FEATURES,
  PUBLIC_FAQ,
  SIGN_UP_HREF,
  accountFeatureHref,
  publicTool,
  publicToolCopyKey,
  type AccountFeature,
} from '@/lib/document-tools/public-tools';
import {
  absoluteUrl,
  faqPageLd,
  serializeJsonLd,
  webApplicationLd,
} from '@/lib/document-tools/structured-data';
import type { getTranslations } from '@/lib/i18n/server';

type Translate = Awaited<ReturnType<typeof getTranslations>>['t'];

const FEATURE_ICONS: Record<AccountFeature, LucideIcon> = {
  save: FolderHeart,
  bundle: Layers,
  autofill: Wand2,
  track: ClipboardList,
};

const STEP_FIELDS = ['stepOne', 'stepTwo', 'stepThree'] as const;

/**
 * Everything under the editor on a public tool page, and under the grid on the public hub: how
 * the tool works, what a free account adds, and the shared FAQ — plus the structured data that
 * describes them to search engines.
 *
 * The account section is the "force" half of the public tools: the tools are free, and every
 * feature that keeps a file somewhere leads to sign-up or sign-in from here.
 */
export function PublicToolDetails({
  t,
  locale,
  toolId,
  signedIn,
  /** The hub writes its own structured data for the whole list. */
  extraJsonLd = [],
}: {
  t: Translate;
  locale: string;
  toolId?: DocumentToolId;
  signedIn: boolean;
  extraJsonLd?: readonly Record<string, unknown>[];
}) {
  const faq = PUBLIC_FAQ.map((key) => ({
    key,
    question: t(`publicTools.faq.${key}.q`),
    answer: t(`publicTools.faq.${key}.a`),
  }));

  const jsonLd = [
    ...(toolId
      ? [
          webApplicationLd({
            name: t(publicToolCopyKey(toolId, 'heading')),
            description: t(publicToolCopyKey(toolId, 'metaDescription')),
            url: absoluteUrl(publicTool(toolId).href),
            inLanguage: locale,
          }),
        ]
      : []),
    ...extraJsonLd,
    faqPageLd(faq),
  ];

  // Account links return to the dashboard copy of the tool on this page, or the hub.
  const returnTo = toolId ? publicTool(toolId).appHref : '/document-tools';

  return (
    <div className="space-y-8">
      {toolId ? (
        <section
          aria-labelledby="how-it-works"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="how-it-works" className="text-lg font-semibold text-slate-900">
            {t('publicTools.steps.heading')}
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEP_FIELDS.map((field, index) => (
              <li key={field} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-slate-700">
                  {t(publicToolCopyKey(toolId, field))}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section
        aria-labelledby="free-account"
        className="rounded-2xl border border-brand-100 bg-gradient-to-br from-[#f1f7ff] via-white to-[#e9f2fe] p-5 sm:p-8"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-md bg-brand-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              {t('publicTools.account.eyebrow')}
            </span>
            <h2 id="free-account" className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              {t('publicTools.account.title')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
              {t('publicTools.account.body')}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            {signedIn ? (
              <Link href={returnTo} className={PRIMARY}>
                {t('publicTools.account.openDashboard')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <LaunchCta href={SIGN_UP_HREF} className={PRIMARY}>
                  <UserPlus className="h-4 w-4" aria-hidden />
                  {t('publicTools.account.signUp')}
                </LaunchCta>
                <Link href={accountFeatureHref(returnTo, false)} className={SECONDARY}>
                  {t('publicTools.account.signIn')}
                </Link>
              </>
            )}
          </div>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACCOUNT_FEATURES.map((feature) => {
            const Icon = FEATURE_ICONS[feature];
            const card = (
              <>
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    <LockKeyhole className="h-3 w-3" aria-hidden />
                    {t('publicTools.account.locked')}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">
                  {t(`publicTools.account.features.${feature}.title`)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {t(`publicTools.account.features.${feature}.body`)}
                </p>
              </>
            );
            return (
              <li key={feature}>
                {feature === 'bundle' ? (
                  // The one account feature that is itself a tool: it goes through sign-in and
                  // lands on the bundle, rather than on a page that would only redirect again.
                  <Link
                    href={accountFeatureHref(PDF_BUNDLE_HREF, signedIn)}
                    className="block h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    {card}
                  </Link>
                ) : (
                  <div className="h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    {card}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="tools-faq"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 id="tools-faq" className="text-lg font-semibold text-slate-900">
          {t('publicTools.faq.heading')}
        </h2>
        <div className="mt-3 divide-y divide-slate-100">
          {faq.map((item) => (
            <details key={item.key} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-900">
                {item.question}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        // Escaped by serializeJsonLd; built only from our own catalogue and translations.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </div>
  );
}

const PRIMARY =
  'inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const SECONDARY =
  'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
