import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock,
  Headset,
  ShieldCheck,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from '@/lib/i18n/server';
import { Reveal } from '@/components/landing/reveal';
import {
  PRICING_ASSURANCES,
  PRICING_BADGES,
  PRICING_PLANS,
  formatPlanPrice,
  type PricingAssurance,
  type PricingBadge,
  type PricingPlanKey,
} from '@/lib/landing/pricing';

/** Stagger for the "How it works" motion block in globals.css, shared by this section. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

/**
 * The three blue strokes off the title's last word, whichever half of the title that is.
 * Entrance, tilt and twinkle each sit on their own element: all three use `transform`.
 */
function TitleAccent() {
  return (
    <span
      aria-hidden
      className="hiw-pop absolute -right-9 -top-6 hidden sm:block lg:-right-11 lg:-top-7"
      style={delay(600)}
    >
      <span className="block -rotate-[35deg]">
        <Image
          src="/home/heading-accents.svg"
          alt=""
          width={32}
          height={32}
          unoptimized
          className="hero-twinkle h-9 w-9 lg:h-11 lg:w-11"
        />
      </span>
    </span>
  );
}

function IconTile({ icon: Icon, tile }: { icon: LucideIcon; tile: string }) {
  return (
    <span
      className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ring-1 ${tile}`}
    >
      <Icon aria-hidden size={26} className="fill-current" />
    </span>
  );
}

const PLAN_ART: Record<
  PricingPlanKey,
  { icon: ReactNode; card: string; tag: string; price: string; cta: string }
> = {
  starter: {
    icon: (
      <IconTile icon={UserRound} tile="from-blue-50 to-blue-100 text-[#0066FF] ring-blue-100" />
    ),
    card: 'border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 hover:border-blue-200 hover:shadow-slate-300/60',
    tag: 'bg-blue-50 text-[#0066FF] ring-blue-100',
    price: 'bg-slate-50 ring-slate-100',
    cta: 'border-[1.5px] border-[#0066FF] text-[#0066FF] hover:bg-[#0066FF] hover:text-white focus-visible:ring-[#0066FF]',
  },
  pro: {
    icon: (
      <Image
        src="/home/pricing-crown.svg"
        alt=""
        width={48}
        height={48}
        unoptimized
        className="h-14 w-14"
      />
    ),
    card: 'border-2 border-[#3B82F6] bg-gradient-to-b from-blue-50/80 via-white to-white shadow-xl shadow-blue-500/15 hover:shadow-blue-500/25',
    tag: 'bg-blue-50 text-[#0066FF] ring-blue-100',
    price: 'bg-blue-50/80 ring-blue-100/80',
    cta: 'bg-gradient-to-r from-[#0066FF] to-[#1E90FF] text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:brightness-110 focus-visible:ring-[#0066FF]',
  },
  csc: {
    icon: (
      <IconTile icon={Users} tile="from-violet-50 to-violet-100 text-violet-600 ring-violet-100" />
    ),
    card: 'border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 hover:border-violet-200 hover:shadow-violet-200/50',
    tag: 'bg-violet-50 text-violet-600 ring-violet-100',
    price: 'bg-violet-50/80 ring-violet-100',
    cta: 'border-[1.5px] border-violet-500 text-violet-700 hover:border-violet-600 hover:bg-violet-600 hover:text-white focus-visible:ring-violet-500',
  },
};

const BADGE_ART: Record<PricingBadge, { icon: LucideIcon; tile: string; glyph: string }> = {
  secure: { icon: ShieldCheck, tile: 'bg-emerald-50', glyph: 'fill-emerald-500 text-white' },
  faster: { icon: Zap, tile: 'bg-amber-50', glyph: 'fill-amber-400 text-amber-500' },
  trusted: { icon: Users, tile: 'bg-violet-50', glyph: 'fill-violet-500 text-violet-600' },
};

function AssuranceTile({ icon: Icon, tile }: { icon: LucideIcon; tile: string }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ${tile}`}
    >
      <Icon aria-hidden size={24} strokeWidth={2.2} />
    </span>
  );
}

const ASSURANCE_ART: Record<PricingAssurance, ReactNode> = {
  lockIn: <AssuranceTile icon={Clock} tile="bg-orange-50 text-orange-500 ring-orange-100" />,
  privacy: (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
      <ShieldCheck aria-hidden size={26} className="fill-emerald-500 text-white" />
    </span>
  ),
  support: <AssuranceTile icon={Headset} tile="bg-violet-50 text-violet-600 ring-violet-100" />,
  india: (
    <Image
      src="/home/pricing-flag-india.svg"
      alt=""
      width={48}
      height={48}
      unoptimized
      className="h-12 w-12 shrink-0"
    />
  ),
};

/*
 * The doodle, the sticky note and the "fill forms in seconds" card redraw
 * public/home/pricing-{doodle-note,sticky-note,fill-seconds-card}.svg in markup: the files bake
 * their words in English, and here the words come from the catalogue. It also lets the cursor's
 * rays sparkle on their own.
 */

/** The handwritten note left of the title, with its swoop arrow down towards the plans. */
function DoodleNote({ text }: { text: string }) {
  return (
    <div className="relative pr-10">
      <p className="font-hand -rotate-[8deg] text-balance text-[1.35rem] font-bold leading-[1.2] text-[#0066FF] [text-shadow:0_2px_6px_rgba(0,102,255,0.15)] 2xl:text-2xl">
        {text}
      </p>
      <svg
        viewBox="158 58 40 90"
        fill="none"
        stroke="#0066FF"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hiw-draw absolute right-0 top-[30%] h-auto w-9"
        style={delay(900)}
      >
        <path d="M165 62C185 70 195 90 190 115C186 128 178 138 170 144" />
        <path d="M162 135L170 144L179 137" />
      </svg>
    </div>
  );
}

const STICKY_LINE_TILT = ['-rotate-[1.5deg]', '-rotate-[0.5deg]', 'rotate-1'] as const;

/** Three handwritten lines on a yellow note, tilted back 5°. */
function StickyNote({ lines }: { lines: readonly [string, string, string] }) {
  return (
    <div className="relative -rotate-[5deg] rounded-md rounded-br-[1.75rem] bg-gradient-to-br from-[#FFFBEB] via-[#FEF08A] to-[#FDE047] px-4 pb-7 pt-7 text-center shadow-[2px_10px_16px_-4px_rgba(15,23,42,0.2),1px_2px_4px_rgba(15,23,42,0.08)]">
      {/* The adhesive strip. */}
      <span className="absolute inset-x-0 top-0 h-6 rounded-t-md bg-white/25" />
      <div className="font-hand text-xl font-bold leading-[1.45] text-slate-800 2xl:text-[1.4rem]">
        {lines.map((line, index) => (
          <p key={index} className={STICKY_LINE_TILT[index]}>
            {line}
          </p>
        ))}
      </div>
      <svg
        viewBox="48 158 114 8"
        fill="none"
        className="absolute bottom-4 left-1/2 h-auto w-3/5 -translate-x-1/2"
      >
        <path
          d="M50 162C70 160 120 161 160 163"
          stroke="#F59E0B"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.6}
        />
      </svg>
    </div>
  );
}

/** The floating card by the service-centre plan. Its cursor points into it from the bottom right. */
function FillSecondsCard({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="relative flex rotate-2 items-center gap-3.5 rounded-2xl border-[1.5px] border-blue-100 bg-white py-3 pl-3.5 pr-7 shadow-[0_8px_20px_rgba(0,102,255,0.12),0_2px_8px_rgba(15,23,42,0.06)]">
      <span className="relative h-11 w-[2.125rem] shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-blue-500 to-blue-700">
        <span className="absolute right-0 top-0 h-3 w-3 bg-blue-300/60 [clip-path:polygon(0_0,100%_100%,0_100%)]" />
        <span className="absolute left-[20%] top-[34%] h-[3px] w-[59%] rounded-full bg-white" />
        <span className="absolute left-[20%] top-[50%] h-[3px] w-[47%] rounded-full bg-white" />
        <span className="absolute left-[20%] top-[66%] h-[3px] w-[35%] rounded-full bg-white" />
      </span>
      <p className="font-heading leading-tight">
        <span className="block text-[15px] font-extrabold text-[#0066FF]">{title}</span>
        <span className="block text-sm font-bold text-slate-900">{caption}</span>
      </p>

      {/* A 40×34 box in the artwork's units, with the pointer's tip at (2, 6). */}
      <span className="absolute -right-2 top-[calc(64%_-_6px)] h-[34px] w-10">
        <span className="absolute left-[2px] top-[6px] h-7 w-7 -translate-x-1/2 -translate-y-1/2">
          <span className="wiw-ripple absolute inset-0 rounded-full border-2 border-blue-400/60" />
        </span>
        <svg viewBox="-2 -6 40 34" fill="none" className="absolute inset-0 h-full w-full">
          <path
            d="M0 0L18 12L10 14L15 24L10 26L5 16L0 20Z"
            fill="#0066FF"
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </svg>
        <span className="wiw-sparkle absolute inset-0 origin-[70%_45%]">
          <svg
            viewBox="-2 -6 40 34"
            fill="none"
            stroke="#0066FF"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-full w-full"
          >
            <path d="M24 0L30 -4" />
            <path d="M28 8L35 9" />
            <path d="M25 18L32 22" />
          </svg>
        </span>
      </span>
    </div>
  );
}

/**
 * The doodle and the sticky note either side of the title, placed from the centre line just
 * outside it so they stay beside it at any desktop width; the section clips any overhang.
 */
function HeaderDoodles({
  doodle,
  stickyLines,
}: {
  doodle: string;
  stickyLines: readonly [string, string, string];
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      <div
        className="hiw-zoom absolute right-[calc(50%_+_27rem)] top-6 w-[clamp(11rem,13vw,14rem)]"
        style={delay(350)}
      >
        <DoodleNote text={doodle} />
      </div>
      <div
        className="hiw-zoom absolute -top-3 left-[calc(50%_+_29rem)] w-[clamp(9rem,11vw,11.5rem)]"
        style={delay(450)}
      >
        <div className="prc-float">
          <StickyNote lines={stickyLines} />
        </div>
      </div>
    </div>
  );
}

const RIBBON =
  'pointer-events-none absolute -z-10 hidden h-auto w-[clamp(12rem,18vw,22rem)] opacity-70 [mask-image:linear-gradient(to_bottom,#000_62%,transparent_92%)] lg:block';

/**
 * Washes, the faint monuments skyline and the tricolour ribbons. Each sits straight in the
 * isolated section, so the opaque skyline's multiply blends with the section's gradient.
 * The glows are sized and centred without `transform`, which their `.hero-glow` loop owns.
 */
function Backdrop() {
  return (
    <>
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-32 top-1/3 -z-10 h-[24rem] w-[24rem] rounded-full bg-orange-100/40 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -right-24 top-10 -z-10 h-[26rem] w-[26rem] rounded-full bg-emerald-100/40 blur-3xl [animation-delay:-4s]"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto h-[22rem] w-full max-w-[44rem] rounded-full bg-blue-100/50 blur-3xl [animation-delay:-2s]"
      />

      {/* Cropped above the artwork's own ribbon and caption, and faded out before them. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-28 -z-10 aspect-[1376/520] opacity-[0.18] mix-blend-multiply [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
      >
        <Image
          src="/home/monuments-skyline.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>

      {/* The ribbons' paths run past the bottom of their artwork; the fade hides the cut. */}
      <Image
        src="/home/pricing-tricolor-left.svg"
        alt=""
        width={360}
        height={700}
        unoptimized
        className={`left-0 top-[26%] ${RIBBON}`}
      />
      <Image
        src="/home/pricing-tricolor-right.svg"
        alt=""
        width={360}
        height={700}
        unoptimized
        className={`right-0 top-[4%] ${RIBBON}`}
      />
    </>
  );
}

/** The five rows a plan card spans; see the plans grid. */
const PLAN_ROWS = 'lg:row-span-5 lg:grid lg:grid-rows-subgrid';

/*
 * From this width there is room beside the 76rem plan grid for the badge stack on the left and
 * the floating card on the right. Below it the badges sit above the grid and the card is hidden.
 * Both are positioned from the centre line: the grid's edges are at 50% ± 38rem.
 */
const BADGE_STACK =
  'mb-10 min-[1680px]:absolute min-[1680px]:right-[calc(50%_+_39.25rem)] min-[1680px]:top-32 min-[1680px]:mb-0 min-[1680px]:w-44';
const FILL_CARD =
  'pointer-events-none absolute bottom-[7.5rem] left-[calc(50%_+_36.5rem)] z-10 hidden w-52 min-[1680px]:block';

export async function Pricing() {
  const { t, locale } = await getTranslations();
  const titleBefore = t('landing.pricing.titleBefore');
  const titleAfter = t('landing.pricing.titleAfter');

  return (
    <section
      id="pricing"
      className="relative isolate overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-white via-sky-50/60 to-white py-20 lg:py-24"
    >
      <Backdrop />

      {/* ── Header, flanked by the doodles on desktop ───────────────── */}
      <Reveal className="relative">
        <HeaderDoodles
          doodle={t('landing.pricing.doodle')}
          stickyLines={[
            t('landing.pricing.stickyNote.line1'),
            t('landing.pricing.stickyNote.line2'),
            t('landing.pricing.stickyNote.line3'),
          ]}
        />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          {/* Letter-spacing pulls Devanagari conjuncts and matras apart, so Hindi keeps none. */}
          <span className="hiw-rise inline-block rounded-full border border-blue-100 bg-blue-50/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0066FF] shadow-sm sm:text-sm [html[lang=hi]_&]:tracking-normal">
            {t('landing.pricing.pill')}
          </span>
          <h2
            className="hiw-rise font-heading mt-5 text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem]"
            style={delay(100)}
          >
            {titleBefore && <>{titleBefore} </>}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[#0066FF] to-[#2EA3FF] bg-clip-text text-transparent">
                {t('landing.pricing.titleHighlight')}
              </span>
              {!titleAfter && <TitleAccent />}
            </span>
            {titleAfter && (
              <>
                {' '}
                <span className="relative inline-block">
                  {titleAfter}
                  <TitleAccent />
                </span>
              </>
            )}
          </h2>
          <p
            className="hiw-rise mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg"
            style={delay(200)}
          >
            {t('landing.pricing.subtitle')}
          </p>
        </div>
      </Reveal>

      <div className="relative mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Trust badges: a row above the plans, a stack beside them on wide screens ── */}
        <Reveal className={BADGE_STACK}>
          <ul
            aria-label={t('landing.pricing.badges.label')}
            className="flex flex-wrap justify-center gap-3 min-[1680px]:flex-col"
          >
            {PRICING_BADGES.map((key, index) => {
              const { icon: Icon, tile, glyph } = BADGE_ART[key];
              return (
                <li
                  key={key}
                  className="hiw-pop flex items-center gap-3 rounded-2xl border border-white bg-white/90 py-2.5 pl-2.5 pr-4 shadow-lg shadow-slate-200/60 ring-1 ring-slate-100 backdrop-blur-sm"
                  style={delay(300 + index * 110)}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tile}`}
                  >
                    <Icon aria-hidden size={22} className={glyph} />
                  </span>
                  <span className="text-sm font-semibold leading-tight text-slate-800">
                    {t(`landing.pricing.badges.${key}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>

        {/* ── Plans ───────────────────────────────────────────────── */}
        {/*
         * From lg each plan's header, price, description, features and CTA are a row shared across
         * the three cards (a subgrid through the li and its Reveal), so a tag wrapping under a long
         * plan name still leaves the price panels and buttons in line. The featured card overhangs
         * its rows by 0.75rem at either end.
         */}
        <ul className="mx-auto grid max-w-xl grid-cols-1 gap-10 lg:max-w-none lg:grid-cols-3 lg:gap-x-5 lg:gap-y-0 xl:gap-x-7">
          {PRICING_PLANS.map(({ key, priceInr, period, featured, href, features }, index) => {
            const art = PLAN_ART[key];
            const base = index * 120;
            const tag = t(`landing.pricing.plans.${key}.tag`);
            const note = t(`landing.pricing.plans.${key}.note`);
            return (
              <li key={key} className={PLAN_ROWS}>
                <Reveal className={PLAN_ROWS}>
                  <div
                    className={`hiw-zoom group relative flex flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl sm:p-7 ${PLAN_ROWS} ${featured ? 'lg:-my-3' : ''} ${art.card}`}
                    style={delay(base)}
                  >
                    {featured && (
                      <>
                        <span
                          aria-hidden
                          className="prc-glow pointer-events-none absolute -inset-0.5 rounded-[1.625rem] shadow-[0_0_0_6px_rgba(59,130,246,0.08),0_22px_55px_-12px_rgba(37,99,235,0.4)]"
                        />
                        {/* Centred on the top border; the pop sits inside so it keeps the centring. */}
                        <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                          <span
                            className="hiw-pop inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-[#0066FF] to-[#2EA3FF] px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30"
                            style={delay(base + 450)}
                          >
                            <Zap aria-hidden size={15} className="fill-current" />
                            {t('landing.pricing.mostPopular')}
                          </span>
                        </span>
                      </>
                    )}

                    <div className="relative flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <span className="hiw-pop shrink-0" style={delay(base + 250)}>
                          {art.icon}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-heading text-xl font-bold leading-snug text-slate-950">
                            {t(`landing.pricing.plans.${key}.name`)}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {t(`landing.pricing.plans.${key}.audience`)}
                          </p>
                        </div>
                      </div>
                      {tag && (
                        <span
                          className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${art.tag}`}
                        >
                          {tag}
                        </span>
                      )}
                    </div>

                    <p
                      className={`relative mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl px-5 py-4 ring-1 ${art.price}`}
                    >
                      <span className="font-heading text-5xl font-extrabold tracking-tight text-slate-950">
                        {formatPlanPrice(priceInr, locale)}
                      </span>
                      <span className="text-base font-medium text-slate-500">
                        {t(`landing.pricing.period.${period}`)}
                      </span>
                    </p>

                    <p className="relative mt-4 text-[15px] leading-relaxed text-slate-600">
                      {t(`landing.pricing.plans.${key}.description`)}
                    </p>

                    <ul className="relative mt-5 space-y-3">
                      {features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-3 text-[15px] leading-snug text-slate-700"
                        >
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check aria-hidden size={12} strokeWidth={3.5} />
                          </span>
                          {t(`landing.pricing.plans.${key}.features.${feature}`)}
                        </li>
                      ))}
                    </ul>

                    <div className="relative mt-auto pt-8 lg:mt-0">
                      <Link
                        href={href}
                        className={`group/cta flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${art.cta}`}
                      >
                        {t(`landing.pricing.plans.${key}.cta`)}
                        <ArrowRight
                          aria-hidden
                          size={18}
                          className="transition-transform duration-300 group-hover/cta:translate-x-1"
                        />
                      </Link>
                      {note && <p className="mt-3 text-center text-sm text-slate-500">{note}</p>}
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>

        <Reveal className={FILL_CARD}>
          <div aria-hidden className="hiw-zoom" style={delay(700)}>
            <div className="prc-float" style={{ '--prc-float-delay': '-1.8s' } as CSSProperties}>
              <FillSecondsCard
                title={t('landing.pricing.fillCard.title')}
                caption={t('landing.pricing.fillCard.caption')}
              />
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── Assurance strip ──────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="hiw-rise mt-14" style={delay(100)}>
          <ul className="grid grid-cols-1 gap-5 rounded-3xl border border-white bg-white/90 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-100 sm:grid-cols-2 sm:p-6 xl:flex xl:items-center xl:gap-0 xl:divide-x xl:divide-slate-200 xl:rounded-full xl:px-8 xl:py-5">
            {PRICING_ASSURANCES.map((key, index) => (
              <li
                key={key}
                className="flex items-center gap-4 xl:flex-auto xl:justify-center xl:px-6"
              >
                <span className="hiw-pop shrink-0" style={delay(250 + index * 100)}>
                  {ASSURANCE_ART[key]}
                </span>
                <div className="min-w-0">
                  <p className="font-heading font-bold text-slate-900">
                    {t(`landing.pricing.assurances.${key}.title`)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t(`landing.pricing.assurances.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
