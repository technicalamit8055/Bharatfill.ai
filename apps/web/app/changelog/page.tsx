import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { LaunchDialogProvider } from '@/components/landing/launch-dialog';
import { getTranslations } from '@/lib/i18n/server';
import { launchState } from '@/lib/launch/state';
import { ChangelogExplorer } from '@/components/landing/changelog-explorer';
import { buildChangelogView, parseChangelogFilter } from '@/lib/landing/changelog';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return {
    title: t('landing.changelog.meta.title'),
    description: t('landing.changelog.meta.description'),
  };
}

/**
 * The release notes read like product documentation, so they use Inter (neutral, high legibility)
 * instead of the landing page's display face. Devanagari still falls back to Noto Sans for Hindi.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const DOC_FONT = {
  fontFamily: 'var(--font-inter), var(--font-devanagari), ui-sans-serif, system-ui, sans-serif',
  fontFeatureSettings: "'cv11', 'ss01'",
};

/**
 * Public release notes. Entries are data in lib/landing/changelog.ts; copy is in
 * `landing.changelog.*`; the interactive list is components/landing/changelog-explorer.tsx.
 * Each release keeps an anchor so a single entry can be linked to.
 */
export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, t } = await getTranslations();
  const { signupsOpen, channelUrl } = launchState();
  const prefix = 'landing.changelog';

  // A shared filtered link (?q=…&area=…&tag=…) renders filtered on the server, not after load.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  const initialFilter = parseChangelogFilter(params);
  const releases = buildChangelogView(t, locale);

  return (
    <LaunchDialogProvider signupsOpen={signupsOpen} channelUrl={channelUrl}>
      <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/20 selection:text-blue-900">
        <Header />
        <main
          className={`${inter.variable} px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8`}
          style={DOC_FONT}
        >
          <div className="mx-auto max-w-4xl">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-600 transition-colors hover:text-[#0066FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]"
            >
              <ArrowLeft aria-hidden size={16} />
              {t(`${prefix}.back`)}
            </Link>

            <header className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0055EE]">
                {t(`${prefix}.eyebrow`)}
              </p>
              <h1
                className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-4xl"
                style={DOC_FONT}
              >
                {t(`${prefix}.title`)}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {t(`${prefix}.subtitle`)}
              </p>
            </header>

            <ChangelogExplorer releases={releases} initialFilter={initialFilter} />
          </div>
        </main>
        <Footer />
      </div>
    </LaunchDialogProvider>
  );
}
