import { Footer } from '@/components/landing/footer';
import { Header } from '@/components/landing/header';
import { LaunchDialogProvider } from '@/components/landing/launch-dialog';
import { launchState } from '@/lib/launch/state';

/**
 * The free, signed-out document tools (lib/document-tools/public-tools.ts).
 *
 * Wrapped in the landing site's header and footer rather than the dashboard shell: a visitor
 * arriving from a search has no organization, and these pages are the site's front door for them.
 * The launch provider makes every "Create free account" button open the early-access dialog
 * while sign-ups are closed.
 */
export default function PublicToolsLayout({ children }: { children: React.ReactNode }) {
  const { signupsOpen, channelUrl } = launchState();

  return (
    <LaunchDialogProvider signupsOpen={signupsOpen} channelUrl={channelUrl}>
      <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/20 selection:text-blue-900">
        <Header />
        <main className="mx-auto w-full max-w-[1400px] space-y-8 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <Footer />
      </div>
    </LaunchDialogProvider>
  );
}
