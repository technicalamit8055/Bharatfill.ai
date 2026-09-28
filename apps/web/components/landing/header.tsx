'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { useTranslations } from '@/lib/i18n/client';
import { BharatfillLogo } from './bharatfill-logo';

const NAV_LINKS = [
  { href: '#features', labelKey: 'landing.header.nav.features' },
  { href: '#how-it-works', labelKey: 'landing.header.nav.howItWorks' },
  { href: '#where-it-works', labelKey: 'landing.header.nav.whereItWorks' },
  { href: '#pricing', labelKey: 'landing.header.nav.pricing' },
  { href: '#faq', labelKey: 'landing.header.nav.faq' },
] as const;

export function Header() {
  const t = useTranslations();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-xl transition-all shadow-sm">
      <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center shrink-0 py-1">
          <BharatfillLogo height={72} className="sm:hidden" />
          <BharatfillLogo height={96} className="hidden sm:flex" />
        </Link>

        {/* Navigation Links */}
        <nav className="hidden items-center gap-6 xl:flex 2xl:gap-9">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-slate-700 transition-colors hover:text-[#0066FF] whitespace-nowrap"
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
            className="hidden h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-[#0066FF] xl:inline-flex whitespace-nowrap"
          >
            {t('landing.header.signIn')}
          </Link>
          <a
            href="https://chromewebstore.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0055EE] via-[#0066FF] to-sky-500 py-1.5 pl-1.5 pr-3 sm:py-2 sm:pl-2 sm:pr-5 text-xs font-bold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/45 sm:text-sm whitespace-nowrap shrink-0"
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
            <span className="sm:hidden">{t('landing.header.install')}</span>
            <ArrowRight aria-hidden size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" />
          </a>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={isMenuOpen ? t('landing.header.closeMenu') : t('landing.header.openMenu')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 xl:hidden shrink-0"
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

      {/* Mobile Nav Panel */}
      {isMenuOpen && (
        <nav
          id="mobile-nav-menu"
          className="border-t border-slate-200 bg-white px-4 py-4 shadow-lg xl:hidden"
        >
          <div className="flex flex-col gap-1">
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
            <div className="mt-2 px-3">
              <LocaleSwitcher />
            </div>
            <Link
              href="/sign-in"
              onClick={() => setIsMenuOpen(false)}
              className="mt-2 rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#0066FF]"
            >
              {t('landing.header.signIn')}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
