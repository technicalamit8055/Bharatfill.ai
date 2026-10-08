import { Header } from '@/components/landing/header';
import { Hero } from '@/components/landing/hero';
import { InteractiveDemo } from '@/components/landing/interactive-demo';
import { HowItWorks } from '@/components/landing/how-it-works';
import { FeaturesGrid } from '@/components/landing/features-grid';
import { WhereItWorks } from '@/components/landing/where-it-works';
import { Pricing } from '@/components/landing/pricing';
import { FAQ } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';
import { LaunchDialogProvider } from '@/components/landing/launch-dialog';
import { launchState } from '@/lib/launch/state';
import { getPortalLogoSources } from '@/lib/landing/portal-logos.server';

export const metadata = {
  title: 'Bharatfill — AI Form Autofill Chrome Extension for CSCs & Applicants',
  description:
    'Bharatfill is an AI-powered Chrome extension that auto-fills web forms in one click. Store customer data once, then fill CRM fields, government portals, job applications, and tickets instantly.',
};

/**
 * Clean Light Theme Landing Page for Bharatfill.ai
 */
export default function LandingPage() {
  const { signupsOpen, channelUrl } = launchState();

  return (
    <LaunchDialogProvider signupsOpen={signupsOpen} channelUrl={channelUrl}>
      <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/20 selection:text-blue-900">
        <Header />
        <main>
          <Hero />
          <InteractiveDemo />
          <HowItWorks />
          <FeaturesGrid />
          <WhereItWorks logos={getPortalLogoSources()} />
          <Pricing />
          <FAQ />
        </main>
        <Footer />
      </div>
    </LaunchDialogProvider>
  );
}
