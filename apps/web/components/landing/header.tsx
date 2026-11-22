'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { useTranslations } from '@/lib/i18n/client';
import { BharatfillLogo } from './bharatfill-logo';
import { LaunchCta } from './launch-dialog';

const NAV_LINKS = [
  { href: '/#features', labelKey: 'landing.header.nav.features' },
  { href: '/#how-it-works', labelKey: 'landing.header.nav.howItWorks' },
  { href: '/#where-it-works', labelKey: 'landing.header.nav.whereItWorks' },
  { href: '/#pricing', labelKey: 'landing.header.nav.pricing' },
  { href: '/tools', labelKey: 'landing.header.nav.tools' },
  { href: '/#faq', labelKey: 'landing.header.nav.faq' },
] as const;

/*
 * Layout (checked in en and hi; Hindi labels are the widest):
 *   < 1280px  logo + install button + menu toggle; links, language and sign-in live in the panel.
 *   ≥ 1280px  full row. The logo steps down so the six links, language, sign-in and the full
 *             install button fit inside max-w-7xl (aligned with the page sections below), with
 *             the links centred in whatever space is left. max-w-7xl caps the row, so it is the
 *             same width on every larger screen.
 */
export function Header() {
  const t = useTranslations();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    // The panel is xl:hidden, so close it when the viewport grows into the desktop row.
    const desktop = window.matchMedia('(min-width: 1280px)');
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onDesktop);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onDesktop);
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-xl transition-all shadow-sm">
      <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center shrink-0 py-1">
          {/* Below 360px the full-height logo leaves no room for the Hindi install button. */}
          <BharatfillLogo height={56} className="min-[360px]:hidden" />
          <BharatfillLogo height={72} className="hidden min-[360px]:flex sm:hidden" />
          <BharatfillLogo height={88} className="hidden sm:flex xl:hidden" />
          {/* Shares the row with every link from here, so it steps down until there is room. */}
          <BharatfillLogo height={72} className="hidden xl:flex" />
        </Link>

        {/* Navigation Links */}
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-5 xl:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-700 transition-colors hover:text-[#0066FF] whitespace-nowrap"
            >
              {t(link.labelKey)}
            </a>
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden xl:block">
            <LocaleSwitcher />
          </div>
          <Link
            href="/sign-in"
            className="hidden h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-[#0066FF] xl:inline-flex whitespace-nowrap"
          >
            {t('landing.header.signIn')}
          </Link>
          <LaunchCta
            href="https://chromewebstore.google.com"
            external
            className="group relative inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0055EE] via-[#0066FF] to-sky-500 py-1.5 pl-1.5 pr-1.5 min-[320px]:pr-3 sm:py-2 sm:pl-2 sm:pr-5 text-xs font-bold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/45 sm:text-sm whitespace-nowrap shrink-0"
          >
            <span className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-white">
              <Image
                src="/chrome.png"
                alt=""
                aria-hidden
                width={24}
                height={24}
                className="h-4 w-4 sm:h-6 sm:w-6 object-contain"
              />
            </span>
            <span className="hidden sm:inline">{t('landing.header.addToChrome')}</span>
            {/* Icon-only under 320px (e.g. fold cover screens); the label stays for screen readers. */}
            <span className="sr-only min-[320px]:not-sr-only sm:hidden">{t('landing.header.install')}</span>
            <ArrowRight aria-hidden size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" />
          </LaunchCta>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={isMenuOpen ? t('landing.header.closeMenu') : t('landing.header.openMenu')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 xl:hidden shrink-0"
          >
            {isMenuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Nav Panel — scrolls on short landscape phones instead of running off-screen. */}
      {isMenuOpen && (
        <nav
          id="mobile-nav-menu"
          className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-t border-slate-200 bg-white px-4 py-4 shadow-lg sm:max-h-[calc(100dvh-6rem)] sm:px-6 lg:px-8 xl:hidden"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-1">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#0066FF]"
                >
                  {t(link.labelKey)}
                </a>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 px-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <LocaleSwitcher />
              <Link
                href="/sign-in"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#0066FF]"
              >
                {t('landing.header.signIn')}
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
