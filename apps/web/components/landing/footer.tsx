import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Globe, ShieldCheck, Users, Zap, type LucideIcon } from 'lucide-react';
import type { Translator } from '@/lib/i18n';
import { getTranslations } from '@/lib/i18n/server';
import { BharatfillLogo } from '@/components/landing/bharatfill-logo';
import { LaunchCta } from '@/components/landing/launch-dialog';
import { Reveal } from '@/components/landing/reveal';
import {
  FOOTER_LEGAL_LINKS,
  FOOTER_PILLARS,
  FOOTER_PRODUCT_LINKS,
  FOOTER_SOCIALS,
  FOOTER_TRUST,
  type FooterPillar,
  type FooterSocial,
  type FooterTrust,
} from '@/lib/landing/footer';

const CHROME_STORE_URL = 'https://chromewebstore.google.com';

/** Stagger for the "How it works" motion block in globals.css, shared by this section. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

const TRUST_ART: Record<FooterTrust, { icon: LucideIcon; tile: string; glyph: string }> = {
  noCard: {
    icon: Check,
    tile: 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm shadow-emerald-500/30',
    glyph: 'text-white',
  },
  trusted: { icon: Users, tile: 'bg-violet-100', glyph: 'fill-violet-500 text-violet-600' },
  setup: { icon: Zap, tile: 'bg-amber-100/80', glyph: 'fill-amber-400 text-amber-500' },
};

const PILLAR_ART: Record<FooterPillar, { icon: LucideIcon; glyph: string }> = {
  secure: { icon: ShieldCheck, glyph: 'text-sky-400' },
  trusted: { icon: Users, glyph: 'text-violet-400' },
  fast: { icon: Zap, glyph: 'fill-amber-400 text-amber-400' },
};

const GLYPH = 'h-[18px] w-[18px]';

/** Brand marks, drawn inline: lucide no longer ships brand icons. */
const SOCIAL_GLYPHS: Record<FooterSocial, ReactNode> = {
  youtube: (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={GLYPH}>
      <path
        fillRule="evenodd"
        d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.87.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z"
      />
    </svg>
  ),
  linkedin: (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={GLYPH}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  ),
  x: (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.6l5.24 6.93ZM17.61 20.64h2.04L6.49 3.24H4.3Z"
      />
    </svg>
  ),
  instagram: (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={GLYPH}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="0.4" fill="currentColor" />
    </svg>
  ),
};

/*
 * The two badges redraw public/home/cta-badge-{filled,accuracy}.svg in markup: the files bake
 * their words in English, and here the words come from the catalogue.
 */
const BADGE =
  'flex items-center gap-3 rounded-2xl border border-slate-100 bg-white py-2.5 pr-5 shadow-[0_8px_16px_rgba(0,102,255,0.10),0_2px_6px_rgba(15,23,42,0.05)] sm:gap-3.5 sm:py-3';

function FilledBadge({ title, caption }: { title: string; caption: string }) {
  return (
    <div className={`${BADGE} pl-2.5 sm:pl-3`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 sm:h-10 sm:w-10">
        <Check aria-hidden size={20} strokeWidth={3} className="text-white" />
      </span>
      <p className="font-heading whitespace-nowrap leading-tight">
        <span className="block text-sm font-bold text-slate-900 sm:text-[15px]">{title}</span>
        <span className="block text-xs font-semibold text-slate-600 sm:text-[13px]">{caption}</span>
      </p>
    </div>
  );
}

/** Rising bars, tallest last, like the chart glyph in the source badge. */
const BAR_HEIGHTS = ['h-[46%]', 'h-[73%]', 'h-full'] as const;

function AccuracyBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${BADGE} pl-4`}>
      <span aria-hidden className="flex h-6 items-end gap-[3px] sm:h-7">
        {BAR_HEIGHTS.map((height) => (
          <span
            key={height}
            className={`w-1.5 rounded-full bg-gradient-to-t from-[#0066FF] to-sky-400 ${height}`}
          />
        ))}
      </span>
      <p className="font-heading whitespace-nowrap leading-tight">
        <span className="block text-base font-extrabold text-slate-900 sm:text-lg">{value}</span>
        <span className="block text-xs font-semibold text-slate-500 sm:text-[13px]">{label}</span>
      </p>
    </div>
  );
}

/**
 * The art is opaque with a white ground. Below xl it sits under the copy as a framed picture;
 * from xl it bleeds off the card's right, top and bottom edges, reaches a little under the copy
 * and feathers into the card on the left, with the blend on the same element as its entrance so
 * no ancestor isolates it. Two columns wait for xl: at lg the copy column is too narrow for the
 * title, and the stage too narrow for the scene.
 */
const STAGE_ART =
  'xl:absolute xl:inset-0 xl:aspect-auto xl:rounded-none xl:shadow-none xl:ring-0 xl:mix-blend-multiply xl:[mask-image:linear-gradient(to_right,transparent,#000_26%)]';

function MockupStage({
  label,
  filled,
  accuracy,
}: {
  label: string;
  filled: { title: string; caption: string };
  accuracy: { value: string; label: string };
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto w-full max-w-xl xl:-my-12 xl:-ml-10 xl:-mr-12 xl:min-h-[27rem] xl:w-auto xl:max-w-none"
    >
      <div
        className={`hiw-zoom relative aspect-[16/10] overflow-hidden rounded-2xl shadow-xl shadow-blue-900/10 ring-1 ring-white ${STAGE_ART}`}
        style={delay(200)}
      >
        <Image
          src="/home/cta-laptop-workspace.png"
          alt=""
          fill
          // From xl `object-cover` scales the art to the card's height, wider than the stage.
          sizes="(min-width: 1280px) 60rem, (min-width: 640px) 36rem, 100vw"
          className="object-cover object-[62%_50%]"
        />
      </div>

      {/* Each badge: entrance on the wrapper, float and tilt inside (see globals.css). */}
      <div
        className="hiw-pop absolute left-3 top-4 sm:left-6 sm:top-6 xl:left-[16%] xl:top-[28%]"
        style={delay(750)}
      >
        <div className="ftr-float relative -rotate-[5deg]">
          <FilledBadge {...filled} />
          <span aria-hidden className="hiw-pop absolute -left-8 -top-8" style={delay(1000)}>
            <span className="block rotate-[225deg]">
              <Image
                src="/home/heading-accents.svg"
                alt=""
                width={32}
                height={32}
                unoptimized
                className="hero-twinkle h-8 w-8"
              />
            </span>
          </span>
        </div>
      </div>
      <div
        className="hiw-pop absolute bottom-4 right-3 sm:bottom-6 sm:right-6 xl:bottom-auto xl:right-[4%] xl:top-[46%]"
        style={delay(900)}
      >
        <div className="ftr-float-far">
          <AccuracyBadge {...accuracy} />
        </div>
      </div>
    </div>
  );
}

function CtaBanner({ t }: { t: Translator }) {
  const titleBefore = t('landing.footer.cta.titleBefore');
  const titleAfter = t('landing.footer.cta.titleAfter');

  return (
    <section
      aria-labelledby="footer-cta-title"
      className="bg-gradient-to-b from-white to-slate-50 px-4 pb-6 pt-12 sm:px-6 sm:pt-16 lg:px-8 2xl:px-14"
    >
      <Reveal className="relative isolate mx-auto max-w-[104rem] overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50/70 via-white to-sky-50/40 p-5 shadow-xl shadow-blue-500/5 sm:p-10 xl:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 -z-10 h-96 w-[36rem] rounded-full bg-sky-100/70 blur-3xl"
        />
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute -top-32 left-1/4 -z-10 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl"
        />

        <div className="grid items-center gap-10 xl:grid-cols-[1.05fr_1fr] xl:items-stretch xl:gap-6">
          {/* ── Left: copy ─────────────────────────────────────────── */}
          <div className="relative z-10 min-w-0 text-center xl:self-center xl:text-left">
            <span className="hiw-rise inline-flex items-center gap-2 rounded-full bg-blue-100/70 px-4 py-2 text-sm font-bold text-[#0066FF] ring-1 ring-blue-100">
              <Zap aria-hidden size={16} className="fill-amber-400 text-amber-500" />
              {t('landing.footer.cta.pill')}
            </span>

            <h2
              id="footer-cta-title"
              className="hiw-rise font-heading mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl xl:text-[3.25rem] 2xl:text-6xl"
              style={delay(100)}
            >
              {titleBefore && <>{titleBefore} </>}
              <span className="bg-gradient-to-r from-[#0055EE] via-[#0066FF] to-[#1E90FF] bg-clip-text text-transparent xl:block">
                {t('landing.footer.cta.titleHighlight')}
              </span>
              {titleAfter && <> {titleAfter}</>}
            </h2>

            <p
              className="hiw-rise mx-auto mt-5 max-w-[38rem] text-base leading-relaxed text-slate-600 sm:text-lg xl:mx-0 2xl:max-w-[40rem] 2xl:text-xl"
              style={delay(200)}
            >
              {t('landing.footer.cta.subtitle')}
            </p>

            <div
              className="hiw-rise mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center xl:justify-start"
              style={delay(300)}
            >
              <LaunchCta
                href={CHROME_STORE_URL}
                external
                className="group inline-flex h-[3.75rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#0055EE] via-[#0066FF] to-sky-500 pl-3 pr-5 text-[15px] font-bold text-white sm:text-base shadow-md shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2 sm:w-auto sm:whitespace-nowrap"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                  <Image
                    src="/chrome.png"
                    alt=""
                    aria-hidden
                    width={28}
                    height={28}
                    className="h-6 w-6 object-contain"
                  />
                </span>
                <span>{t('landing.footer.cta.primary')}</span>
                {/* Dropped on the narrowest phones so the label stays on one line. */}
                <ArrowRight
                  aria-hidden
                  size={20}
                  className="hidden shrink-0 transition-transform group-hover:translate-x-1 min-[400px]:block"
                />
              </LaunchCta>
              <LaunchCta
                href="/sign-up"
                className="inline-flex h-[3.75rem] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-9 text-base font-bold text-[#0066FF] shadow-sm transition-all duration-300 hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2 sm:w-auto sm:whitespace-nowrap"
              >
                {t('landing.footer.cta.secondary')}
              </LaunchCta>
            </div>

            {/*
             * Stacked on phones, a centred row from sm. From xl the row is left-aligned and each
             * point gets a divider in the gap before it; the list clips the one before whichever
             * point starts a line, so a wrapped row never opens on a stray rule.
             */}
            <ul
              aria-label={t('landing.footer.cta.trust.label')}
              className="hiw-rise mx-auto mt-8 flex w-fit flex-col items-start gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-6 xl:mx-0 xl:justify-start xl:overflow-hidden"
              style={delay(400)}
            >
              {FOOTER_TRUST.map((key) => {
                const { icon: Icon, tile, glyph } = TRUST_ART[key];
                return (
                  <li
                    key={key}
                    className="relative flex items-center gap-2.5 text-sm font-medium text-slate-700 xl:before:absolute xl:before:-left-3 xl:before:top-1/2 xl:before:h-6 xl:before:w-px xl:before:-translate-y-1/2 xl:before:bg-slate-200"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tile}`}
                    >
                      <Icon
                        aria-hidden
                        size={key === 'noCard' ? 16 : 17}
                        strokeWidth={key === 'noCard' ? 3.2 : 2}
                        className={glyph}
                      />
                    </span>
                    {t(`landing.footer.cta.trust.${key}`)}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Right: laptop and badges ───────────────────────────── */}
          <MockupStage
            label={t('landing.footer.cta.mockup.label')}
            filled={{
              title: t('landing.footer.cta.mockup.filledTitle'),
              caption: t('landing.footer.cta.mockup.filledCaption'),
            }}
            accuracy={{
              value: t('landing.footer.cta.mockup.accuracyValue'),
              label: t('landing.footer.cta.mockup.accuracyLabel'),
            }}
          />
        </div>
      </Reveal>
    </section>
  );
}

const FOOTER_LINK =
  'inline-block rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:text-[15px]';

function LinkColumn({
  id,
  title,
  links,
  className,
  ms,
}: {
  id: string;
  title: string;
  links: readonly { href: string; label: string }[];
  className: string;
  ms: number;
}) {
  return (
    <nav aria-labelledby={id} className={`hiw-rise ${className}`} style={delay(ms)}>
      <h2 id={id} className="font-heading text-base font-bold text-white">
        {title}
      </h2>
      <ul className="mt-4 space-y-1.5">
        {links.map(({ href, label }) => (
          <li key={href}>
            {/* Section anchors stay plain links; routes go through the router. */}
            {href.startsWith('#') ? (
              <a href={href} className={FOOTER_LINK}>
                {label}
              </a>
            ) : (
              <Link href={href} className={FOOTER_LINK}>
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * From md to xl the card spans the grid, its pillars beside the heading rather than under it.
 * From xl it matches the brand column's height, the pillars sitting along its bottom.
 */
function DigitalCard({ t }: { t: Translator }) {
  return (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 md:flex md:items-center md:justify-between md:gap-10 xl:flex-col xl:items-stretch xl:gap-6 xl:p-5 2xl:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0066FF]/15 ring-1 ring-[#0066FF]/25">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#1E90FF] to-[#0055EE] shadow-lg shadow-blue-500/30">
            <Globe aria-hidden size={22} className="text-white" />
          </span>
        </span>
        <div className="min-w-0">
          <p className="font-heading text-base font-bold text-white 2xl:text-[17px]">
            {t('landing.footer.digital.title')}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            {t('landing.footer.digital.body')}
          </p>
        </div>
      </div>
      <ul
        aria-label={t('landing.footer.digital.pillars.label')}
        className="mt-6 grid grid-cols-3 divide-x divide-white/10 md:mt-0 md:w-80 md:shrink-0 xl:w-auto xl:pb-1"
      >
        {FOOTER_PILLARS.map((key) => {
          const { icon: Icon, glyph } = PILLAR_ART[key];
          return (
            <li key={key} className="flex flex-col items-center gap-2 px-2 text-center">
              <Icon aria-hidden size={28} strokeWidth={1.9} className={glyph} />
              <span className="text-sm font-medium text-slate-300">
                {t(`landing.footer.digital.pillars.${key}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/*
 * Phones: the brand, then the two link columns side by side, then the card. md: brand and links
 * share a row, the card spans the next. xl: all four in one row.
 */
function SiteFooter({ t }: { t: Translator }) {
  return (
    <footer className="relative isolate overflow-hidden bg-[#0B1528] text-slate-300">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 -z-10 h-[28rem] w-[40rem] rounded-full bg-blue-600/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-24 -z-10 h-[24rem] w-[32rem] rounded-full bg-sky-500/[0.07] blur-3xl"
      />

      <Reveal className="mx-auto max-w-[96rem] px-4 pb-8 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-12 xl:gap-x-8">
          {/* ── Brand ──────────────────────────────────────────────── */}
          <div className="hiw-rise col-span-2 md:col-span-5 xl:col-span-4">
            {/* The negative margins trim the transparent padding baked into the logo art. */}
            <Link
              href="/"
              className="-mb-3 -ml-3 -mt-4 inline-block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <BharatfillLogo tone="dark" height={96} priority={false} />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300 sm:text-[15px]">
              {t('landing.footer.tagline')}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <span aria-hidden className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
              </span>
              {t('landing.footer.status')}
            </p>
            <ul aria-label={t('landing.footer.socials.label')} className="mt-6 flex gap-3">
              {FOOTER_SOCIALS.map(({ key, href }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t(`landing.footer.socials.${key}`)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white ring-1 ring-white/15 transition-all duration-300 hover:scale-[1.02] hover:bg-[#0066FF] hover:shadow-lg hover:shadow-blue-500/30 hover:ring-[#0066FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    {SOCIAL_GLYPHS[key]}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Links ──────────────────────────────────────────────── */}
          <LinkColumn
            id="footer-product"
            title={t('landing.footer.product.title')}
            links={FOOTER_PRODUCT_LINKS.map(({ key, href }) => ({
              href,
              label: t(`landing.footer.product.${key}`),
            }))}
            className="md:col-span-3 xl:col-span-2"
            ms={100}
          />
          <LinkColumn
            id="footer-legal"
            title={t('landing.footer.legal.title')}
            links={FOOTER_LEGAL_LINKS.map(({ key, href }) => ({
              href,
              label: t(`landing.footer.legal.${key}`),
            }))}
            className="md:col-span-4 xl:col-span-3"
            ms={200}
          />

          {/* ── Built for a Digital World ──────────────────────────── */}
          <div className="hiw-zoom col-span-2 md:col-span-12 xl:col-span-3" style={delay(300)}>
            <DigitalCard t={t} />
          </div>
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────── */}
        <div
          className="hiw-rise mt-12 flex flex-col-reverse gap-3 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-slate-400 md:flex-row md:items-center md:justify-between md:gap-8 md:text-left"
          style={delay(400)}
        >
          <p className="shrink-0">
            {t('landing.footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <p className="max-w-2xl text-balance md:text-right">{t('landing.footer.disclaimer')}</p>
        </div>
      </Reveal>
    </footer>
  );
}

/** The closing CTA banner, then the site footer. */
export async function Footer() {
  const { t } = await getTranslations();

  return (
    <>
      <CtaBanner t={t} />
      <SiteFooter t={t} />
    </>
  );
}
