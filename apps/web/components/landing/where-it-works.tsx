'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  ChartColumnBig,
  CodeXml,
  FileText,
  Globe,
  GraduationCap,
  Landmark,
  School,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { Reveal } from '@/components/landing/reveal';
import {
  PORTAL_CATEGORIES,
  portalsIn,
  type PortalCategory,
  type PortalKey,
} from '@/lib/landing/where-it-works';

/** There is no dedicated support channel yet; new portal requests start from an account. */
const REQUEST_SUPPORT_HREF = '/sign-up';

const LIST_ID = 'where-it-works-portals';

const BADGE = {
  stat: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  instant: 'bg-violet-50 text-violet-600 ring-violet-100',
  click: 'bg-blue-50 text-[#0066FF] ring-blue-100',
  supported: 'bg-orange-50 text-orange-500 ring-orange-100',
} as const;

const PORTAL_ART: Record<PortalKey, { icon: LucideIcon; tile: string; badge: string }> = {
  sscRailway: {
    icon: Landmark,
    tile: 'from-blue-50 to-blue-100/70 text-[#0066FF]',
    badge: BADGE.stat,
  },
  nsp: {
    icon: GraduationCap,
    tile: 'from-violet-50 to-violet-100/70 text-violet-600',
    badge: BADGE.stat,
  },
  stateRecruitment: {
    icon: ScrollText,
    tile: 'from-amber-50 to-amber-100/70 text-amber-500',
    badge: BADGE.stat,
  },
  workdayGreenhouse: {
    icon: BriefcaseBusiness,
    tile: 'from-purple-50 to-purple-100/70 text-purple-600',
    badge: BADGE.instant,
  },
  linkedinIndeed: {
    icon: Globe,
    tile: 'from-sky-50 to-sky-100/70 text-sky-600',
    badge: BADGE.click,
  },
  naukriShine: {
    icon: FileText,
    tile: 'from-pink-50 to-pink-100/70 text-pink-500',
    badge: BADGE.click,
  },
  admissions: {
    icon: School,
    tile: 'from-orange-50 to-orange-100/70 text-orange-500',
    badge: BADGE.stat,
  },
  salesforceZoho: {
    icon: ChartColumnBig,
    tile: 'from-emerald-50 to-emerald-100/70 text-emerald-600',
    badge: BADGE.supported,
  },
  customForms: {
    icon: CodeXml,
    tile: 'from-indigo-50 to-indigo-100/70 text-indigo-600',
    badge: BADGE.instant,
  },
};

/** Stagger for the "How it works" motion block in globals.css, shared by this section. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

/**
 * The PNGs are opaque with pale edges; feathering lets them sit in the wash. The building's right
 * edge fades least, because the start of its dashed arrow runs off that edge into `FlowArrow`.
 */
const BUILDING_MASK =
  '[mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_96%,transparent),linear-gradient(to_bottom,transparent,#000_14%,#000_80%,transparent)]';
const LAPTOP_MASK =
  '[mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent),linear-gradient(to_bottom,#000_88%,transparent)]';

/** Entrance and float timing per graphic; its arrow shares them so the two move as one. */
const BUILDING_MOTION = delay(350);
const LAPTOP_MOTION = { ...delay(450), '--wiw-float-delay': '-2.5s' } as CSSProperties;

/**
 * The dashed connector from each graphic towards the grid: the path in
 * public/home/where-arrow-left.svg, inlined so its dashes can flow. where-arrow-right.svg is the
 * same path mirrored, so the right one is this arrow flipped, which also flips its draw-in. The
 * flip sits on an inner span so it does not fight the entrance's `transform`.
 */
function FlowArrow({
  side,
  className,
  motion,
  ms,
}: {
  side: 'left' | 'right';
  className: string;
  motion: CSSProperties;
  ms: number;
}) {
  return (
    <span className={`hiw-zoom wiw-float absolute w-24 ${className}`} style={motion}>
      <span className={`block ${side === 'right' ? '-scale-x-100' : ''}`}>
        <svg
          viewBox="0 0 70 40"
          fill="none"
          stroke="#3B82F6"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hiw-draw block h-auto w-full"
          style={delay(ms)}
        >
          <path d="M4 35C15 15 45 8 62 18" strokeDasharray="4 4" className="wiw-flow" />
          <path d="M52 24L65 18L56 9" />
        </svg>
      </span>
    </span>
  );
}

/**
 * The building and laptop flanking the header. They are placed from the centre line, just
 * outside the title, so they stay beside it at any desktop width; the section clips any overhang.
 * Each wrapper carries the blend, the entrance and the float itself (see globals.css).
 *
 * The arrows are positioned in the same terms. The path starts at (5.7%, 87.5%) of its 6rem box,
 * i.e. 0.34rem in and 3rem down. The left one picks up the dash baked into the building art as it
 * nears the right edge (97% across, 40.6% down the 3:2 artwork); the right one leaves the laptop's
 * lower left.
 */
function SideGraphics() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden [--wiw-building-w:clamp(14rem,19vw,23rem)] [--wiw-gutter:max(25rem,30vw)] [--wiw-laptop-w:clamp(14rem,20vw,25rem)] xl:block"
    >
      <div
        className={`hiw-zoom wiw-float absolute right-[calc(50%_+_var(--wiw-gutter))] top-2 w-[var(--wiw-building-w)] mix-blend-multiply ${BUILDING_MASK}`}
        style={BUILDING_MOTION}
      >
        <Image
          src="/home/where-it-works-building.png"
          alt=""
          width={1536}
          height={1024}
          sizes="(min-width: 1536px) 23rem, 19vw"
          className="block h-auto w-full"
        />
      </div>

      <div
        className={`hiw-zoom wiw-float absolute -top-2 left-[calc(50%_+_var(--wiw-gutter))] w-[var(--wiw-laptop-w)] mix-blend-multiply ${LAPTOP_MASK}`}
        style={LAPTOP_MOTION}
      >
        <Image
          src="/home/where-it-works-laptop.png"
          alt=""
          width={1200}
          height={896}
          sizes="(min-width: 1536px) 25rem, 20vw"
          className="block h-auto w-full"
        />
        {/* Centred on the cursor tip in the artwork, so the click rays glow and ripple. */}
        <span className="absolute left-[48.9%] top-[51.3%] aspect-square w-[14%] -translate-x-1/2 -translate-y-1/2">
          <span className="wiw-sparkle absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.6),rgba(56,189,248,0.18)_60%,transparent)]" />
          <span className="wiw-ripple absolute inset-0 rounded-full border-2 border-sky-400/70" />
        </span>
      </div>

      {/* Too close to the title below 2xl; there the building's own dash stands alone. */}
      <FlowArrow
        side="left"
        motion={BUILDING_MOTION}
        ms={1000}
        className="right-[calc(50%_+_var(--wiw-gutter)_+_var(--wiw-building-w)*0.03_-_5.66rem)] top-[calc(var(--wiw-building-w)*0.2707_-_2.5rem)] hidden 2xl:block"
      />
      <FlowArrow
        side="right"
        motion={LAPTOP_MOTION}
        ms={1100}
        className="left-[calc(50%_+_var(--wiw-gutter)_+_var(--wiw-laptop-w)*0.08_-_5.66rem)] top-[calc(var(--wiw-laptop-w)*0.448_-_3.5rem)] hidden 2xl:block"
      />
    </div>
  );
}

export function WhereItWorks() {
  const t = useTranslations();
  const [category, setCategory] = useState<PortalCategory>('all');
  // Until the first switch the cards use the scroll-in entrance; after it, each switch remounts
  // them so they fade and scale back in.
  const [hasFiltered, setHasFiltered] = useState(false);
  const titleBefore = t('landing.whereItWorks.titleBefore');
  const titleAfter = t('landing.whereItWorks.titleAfter');

  function select(next: PortalCategory) {
    if (next === category) return;
    setCategory(next);
    setHasFiltered(true);
  }

  return (
    <section
      id="where-it-works"
      className="relative isolate overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-white via-blue-50/50 to-white py-20 lg:py-24"
    >
      {/* Soft background washes */}
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-32 bottom-0 -z-10 h-[24rem] w-[24rem] rounded-full bg-orange-100/50 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -right-24 top-1/3 -z-10 h-[26rem] w-[26rem] rounded-full bg-emerald-100/40 blur-3xl [animation-delay:-4s]"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute left-1/2 top-10 -z-10 h-[22rem] w-[40rem] -translate-x-1/2 rounded-full bg-blue-100/50 blur-3xl [animation-delay:-2s]"
      />

      {/* ── Header, flanked by the graphics on desktop ──────────────── */}
      <Reveal className="relative">
        <SideGraphics />

        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <span className="hiw-rise inline-block rounded-full border border-blue-100 bg-blue-50/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0066FF] shadow-sm sm:text-sm">
            {t('landing.whereItWorks.pill')}
          </span>
          <h2
            className="hiw-rise font-heading mt-5 text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem]"
            style={delay(100)}
          >
            {titleBefore && <>{titleBefore} </>}
            <span className="bg-gradient-to-r from-[#0066FF] to-[#2EA3FF] bg-clip-text text-transparent">
              {t('landing.whereItWorks.titleHighlight')}
            </span>
            {titleAfter && <> {titleAfter}</>}
          </h2>
          <p
            className="hiw-rise mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg"
            style={delay(200)}
          >
            {t('landing.whereItWorks.subtitle')}
          </p>

          {/*
           * On phones the chips are one swipeable row running to the screen edges (a wrapped row
           * stacked them four deep); the vertical padding keeps the focus ring and active shadow
           * clear of the scroller's clip. From sm they wrap and centre.
           */}
          <div
            role="group"
            aria-label={t('landing.whereItWorks.filterLabel')}
            className="hiw-rise -mx-4 mt-6 flex snap-x items-center gap-2.5 overflow-x-auto px-4 pb-4 pt-2 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:flex-wrap sm:justify-center sm:gap-3 sm:overflow-visible sm:p-0 [&::-webkit-scrollbar]:hidden"
            style={delay(300)}
          >
            {PORTAL_CATEGORIES.map((id) => {
              const active = id === category;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  aria-controls={LIST_ID}
                  onClick={() => select(id)}
                  className={`shrink-0 snap-start scroll-ml-4 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2 sm:px-5 sm:text-[15px] ${
                    active
                      ? 'border-[#0066FF] bg-[#0066FF] text-white shadow-lg shadow-blue-500/30'
                      : 'border-slate-200 bg-white/80 text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#0066FF] hover:shadow-md'
                  }`}
                >
                  {t(`landing.whereItWorks.categories.${id}`)}
                </button>
              );
            })}
          </div>
        </div>
      </Reveal>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 2xl:max-w-[96rem]">
        {/* ── Portal cards ─────────────────────────────────────────── */}
        <Reveal className="mt-12">
          <ul id={LIST_ID} className="flex flex-wrap justify-center gap-5">
            {portalsIn(category).map(({ key }, index) => {
              const { icon: Icon, tile, badge } = PORTAL_ART[key];
              const caption = t(`landing.whereItWorks.portals.${key}.badgeCaption`);
              return (
                <li
                  key={`${category}:${key}`}
                  className={`w-full md:w-[calc((100%_-_1.25rem)/2)] xl:w-[calc((100%_-_2.5rem)/3)] ${
                    hasFiltered ? 'wiw-card-in' : 'hiw-zoom'
                  }`}
                  style={delay(hasFiltered ? index * 60 : index * 80)}
                >
                  <div className="group flex h-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/70 lg:gap-4 lg:p-5">
                    {/* Dropped under 320px, where it would leave the title a word per line. */}
                    <span
                      className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-110 min-[320px]:flex lg:h-14 lg:w-14 ${tile}`}
                    >
                      <Icon aria-hidden size={26} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-base font-bold leading-snug text-slate-900 lg:text-[17px]">
                        {t(`landing.whereItWorks.portals.${key}.title`)}
                      </h3>
                      <p className="mt-0.5 text-sm leading-snug text-slate-500">
                        {t(`landing.whereItWorks.portals.${key}.subtitle`)}
                      </p>
                    </div>
                    <span
                      className={`flex min-w-[4.5rem] max-w-[5.75rem] shrink-0 flex-col items-center rounded-xl px-2.5 py-2 text-center leading-tight ring-1 ${badge}`}
                    >
                      <span className="text-sm font-bold lg:text-[15px]">
                        {t(`landing.whereItWorks.portals.${key}.badge`)}
                      </span>
                      {caption && <span className="text-xs font-medium">{caption}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>

        {/* ── Custom portal callout ────────────────────────────────── */}
        <Reveal className="hiw-rise mx-auto mt-10 max-w-[52rem]" style={delay(150)}>
          <div className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-center shadow-lg shadow-slate-200/50 sm:flex-row sm:gap-5 sm:py-4 sm:pl-5 sm:pr-4 sm:text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-[#0066FF] text-white shadow-md shadow-blue-500/30">
              <Settings
                aria-hidden
                size={22}
                className="transition-transform duration-500 group-hover:rotate-90"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                {t('landing.whereItWorks.callout.title')}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {t('landing.whereItWorks.callout.body')}
              </p>
            </div>
            <Link
              href={REQUEST_SUPPORT_HREF}
              className="group/cta inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#0066FF] px-5 py-2.5 text-sm font-semibold text-[#0066FF] transition-colors duration-300 hover:bg-[#0066FF] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2"
            >
              {t('landing.whereItWorks.callout.action')}
              <ArrowRight
                aria-hidden
                size={16}
                className="transition-transform duration-300 group-hover/cta:translate-x-1"
              />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
