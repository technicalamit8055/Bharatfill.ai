import type { Metadata, Viewport } from 'next';
import { Kalam, Outfit, Plus_Jakarta_Sans, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { siteUrl } from '@/lib/document-tools/structured-data';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-devanagari',
  display: 'swap',
});

/**
 * Handwriting for the landing page's doodles. It covers Latin and Devanagari, so the Hindi notes
 * are hand-lettered too. Not preloaded: only the pricing section uses it, and only on wide screens.
 */
const hand = Kalam({
  subsets: ['latin', 'devanagari'],
  weight: ['700'],
  variable: '--font-hand',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs (the public /tools pages set both).
  metadataBase: siteUrl(),
  title: {
    default: 'Bharatfill — AI form filling for CSCs and cyber cafes',
    template: '%s · Bharatfill',
  },
  description:
    'Save a customer once. Extract details from Indian documents, fill supported online forms after review, prepare photos and PDFs, and track every application.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d54f0',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${outfit.variable} ${jakarta.variable} ${devanagari.variable} ${hand.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
