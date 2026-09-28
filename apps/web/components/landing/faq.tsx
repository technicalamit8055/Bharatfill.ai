'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import {
  ChevronDown,
  CircleCheck,
  FileText,
  Headset,
  Languages,
  Lock,
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { Reveal } from '@/components/landing/reveal';
import {
  FAQ_ASSURANCES,
  FAQ_ITEMS,
  FAQ_STATS,
  type FaqAssurance,
  type FaqItem,
  type FaqStat,
} from '@/lib/landing/faq';

/** Stagger for the "How it works" motion block in globals.css, shared by this section. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

const ITEM_ART: Record<FaqItem, { glyph: ReactNode; tile: string }> = {
  safety: {
    glyph: <ShieldCheck aria-hidden size={24} strokeWidth={2.2} />,
    tile: 'bg-blue-50 text-[#0066FF] ring-blue-100',
  },
  privacy: {
    glyph: <Lock aria-hidden size={22} strokeWidth={2.4} className="[&_rect]:fill-current" />,
    tile: 'bg-orange-50 text-orange-400 ring-orange-100',
  },
  languages: {
    glyph: <Languages aria-hidden size={24} strokeWidth={2.2} />,
    tile: 'bg-violet-50 text-violet-600 ring-violet-100',
  },
  install: {
    glyph: (
      <Image src="/chrome.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
    ),
    tile: 'bg-emerald-50 ring-emerald-100',
  },
  teams: {
    glyph: <Users aria-hidden size={22} className="fill-pink-400 text-pink-500" />,
    tile: 'bg-pink-50 ring-pink-100',
  },
  layoutChanges: {
    glyph: <FileText aria-hidden size={24} strokeWidth={2.2} />,
    tile: 'bg-teal-50 text-teal-600 ring-teal-100',
  },
};

function AssuranceTile({ icon: Icon, tile }: { icon: LucideIcon; tile: string }) {
  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
      <Icon aria-hidden size={22} strokeWidth={2.2} />
    </span>
  );
}

const ASSURANCE_ART: Record<FaqAssurance, ReactNode> = {
  support: <AssuranceTile icon={Headset} tile="bg-violet-50 text-violet-600" />,
  secure: (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
      <ShieldCheck aria-hidden size={26} className="fill-emerald-500 text-white" />
    </span>
  ),
  india: (
    <Image
      src="/home/pricing-flag-india.svg"
      alt=""
      width={48}
      height={48}
      unoptimized
      className="h-11 w-11 shrink-0"
    />
  ),
};

const STAT_ART: Record<FaqStat, { icon: LucideIcon; tile: string; glyph: string }> = {
  portals: { icon: CircleCheck, tile: 'bg-emerald-50', glyph: 'fill-emerald-500 text-white' },
  faster: { icon: Zap, tile: 'bg-amber-50', glyph: 'fill-amber-400 text-amber-500' },
  trusted: { icon: Users, tile: 'bg-violet-50', glyph: 'fill-violet-500 text-violet-600' },
};

/** Each badge leans a little differently and drifts out of step with the others. */
const STAT_TILT = ['rotate-[4deg]', 'rotate-[2.5deg]', 'rotate-[4deg]'] as const;

/**
 * The dashed connectors: the path in public/home/where-arrow-left.svg, inlined so its dashes can
 * flow (`.wiw-flow`) towards the arrowhead. `rise` is that path flipped top to bottom, so it swoops
 * up from the trust card towards the questions; `drop` is it reflected across its diagonal, so it
 * falls from the building to the badges.
 */
const ARROWS = {
  rise: { viewBox: '0 0 70 40', line: 'M4 5C15 25 45 32 62 22', head: 'M52 16L65 22L56 31' },
  drop: { viewBox: '0 0 40 70', line: 'M35 4C15 15 8 45 18 62', head: 'M24 52L18 65L9 56' },
} as const;

function DashedArrow({
  shape,
  className,
  ms,
}: {
  shape: keyof typeof ARROWS;
  className: string;
  ms: number;
}) {
  const { viewBox, line, head } = ARROWS[shape];
  return (
    <span aria-hidden className={`hiw-zoom block ${className}`} style={delay(ms)}>
      <svg
        viewBox={viewBox}
        fill="none"
        stroke="#3B82F6"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        // The draw-in wipes left to right, which only follows the path on the rising arrow.
        className={`block h-auto w-full ${shape === 'rise' ? 'hiw-draw' : ''}`}
        style={delay(ms + 300)}
      >
        <path d={line} strokeDasharray="4 4" className="wiw-flow" />
        <path d={head} />
      </svg>
    </span>
  );
}

/*
 * The speech bubble redraws public/home/faq-speech-bubble.svg in markup: the file bakes its words
 * in English, and here the words come from the catalogue.
 */
function SpeechBubble({ lines }: { lines: readonly [string, string] }) {
  return (
    <div className="relative -rotate-[7deg] rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-[0_8px_20px_rgba(0,102,255,0.08),0_2px_6px_rgba(15,23,42,0.05)]">
      {lines.map((line) => (
        <p
          key={line}
          className="font-heading text-[1.05rem] font-bold leading-snug text-slate-900 2xl:text-lg"
        >
          {line}
        </p>
      ))}
      {/* The tail, pointing down at the mascot: the lower corner of a rotated square. */}
      <span className="absolute -bottom-[7px] left-[62%] h-3.5 w-3.5 rotate-45 border-b border-r border-slate-200 bg-white" />
    </div>
  );
}

/**
 * The art is opaque with a white ground; feathering lets it sit in the wash. The mascot fades out
 * at its desk, which the trust card covers.
 */
const MASCOT_MASK =
  '[mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent),linear-gradient(to_bottom,transparent,#000_5%,#000_78%,transparent)]';
const BUILDING_MASK =
  '[mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_94%,transparent),linear-gradient(to_bottom,transparent,#000_3%,#000_86%,transparent)]';

const BUBBLE_MOTION = { ...delay(450), '--wiw-float-delay': '-1.5s' } as CSSProperties;
const MASCOT_MOTION = delay(300);
const BUILDING_MOTION = { ...delay(300), '--wiw-float-delay': '-2.5s' } as CSSProperties;

/**
 * Left of the questions: the speech bubble, the mascot and the trust card under it. The mascot's
 * wrapper carries its blend, entrance and float itself, so no ancestor isolates the blend (see
 * globals.css); the halo behind it is what the blend picks up as a soft drop.
 */
function MascotRail({
  bubble,
  label,
  rows,
}: {
  bubble: readonly [string, string];
  label: string;
  rows: readonly { key: FaqAssurance; title: string; body: string }[];
}) {
  return (
    <div className="relative mx-auto w-full max-w-[20rem] pt-10">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-28 -z-10 mx-auto aspect-square w-4/5 rounded-full bg-sky-200/50 blur-3xl"
      />

      <div
        aria-hidden
        className="hiw-zoom wiw-float relative z-10 ml-1 w-fit"
        style={BUBBLE_MOTION}
      >
        <SpeechBubble lines={bubble} />
        <span className="hiw-pop absolute -right-7 -top-8" style={delay(900)}>
          <span className="block -rotate-[60deg]">
            <Image
              src="/home/heading-accents.svg"
              alt=""
              width={32}
              height={32}
              unoptimized
              className="hero-twinkle h-9 w-9"
            />
          </span>
        </span>
      </div>

      <div
        aria-hidden
        className={`hiw-zoom faq-float relative -mt-3 w-full mix-blend-multiply ${MASCOT_MASK}`}
        style={MASCOT_MOTION}
      >
        <Image
          src="/home/faq-operator-mascot.png"
          alt=""
          width={1024}
          height={1024}
          sizes="20rem"
          className="block h-auto w-full"
        />
        {/* Centred on the lightbulb in the artwork, so it glows. */}
        <span className="wiw-sparkle absolute left-[67%] top-[10.5%] aspect-square w-[24%] rounded-full bg-[radial-gradient(closest-side,rgba(250,204,21,0.55),rgba(250,204,21,0.15)_60%,transparent)]" />
      </div>

      {/* The entrance sits on the wrapper and the tilt inside, as both use `transform`. */}
      <div className="hiw-zoom relative z-10 -mt-[22%] px-1" style={delay(550)}>
        <ul
          aria-label={label}
          className="-rotate-[3deg] space-y-3 rounded-3xl border border-white bg-white/95 p-4 shadow-xl shadow-slate-200/70 ring-1 ring-slate-100"
        >
          {rows.map(({ key, title, body }) => (
            <li key={key} className="flex items-center gap-3">
              {ASSURANCE_ART[key]}
              <div className="min-w-0">
                <p className="font-heading text-[15px] font-bold leading-tight text-slate-900">
                  {title}
                </p>
                <p className="text-balance text-[13px] leading-snug text-slate-500">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <DashedArrow shape="rise" className="ml-auto mr-6 mt-5 w-24" ms={800} />
    </div>
  );
}

/**
 * Right of the questions: the building, and the badges its arrow drops to over the faint map.
 * The building carries its blend, entrance and float itself, as the mascot does.
 */
function BuildingRail({
  label,
  stats,
}: {
  label: string;
  stats: readonly { key: FaqStat; title: string; body: string }[];
}) {
  return (
    <div className="relative mx-auto w-full max-w-[21rem]">
      <div
        aria-hidden
        className={`hiw-zoom wiw-float relative ml-auto w-[clamp(15rem,19vw,22rem)] mix-blend-multiply xl:-mr-4 2xl:-mr-8 ${BUILDING_MASK}`}
        style={BUILDING_MOTION}
      >
        <Image
          src="/home/faq-building.png"
          alt=""
          width={1200}
          height={896}
          sizes="(min-width: 1536px) 22rem, 19vw"
          className="block h-auto w-full"
        />
      </div>

      <div className="relative mt-1 pl-8 2xl:pl-10">
        <DashedArrow shape="drop" className="absolute -top-6 left-0 w-9" ms={700} />

        <Image
          aria-hidden
          src="/home/faq-india-map.svg"
          alt=""
          width={240}
          height={280}
          unoptimized
          className="pointer-events-none absolute -bottom-44 right-2 -z-10 h-auto w-40 opacity-40"
        />

        <ul aria-label={label} className="space-y-4">
          {stats.map(({ key, title, body }, index) => {
            const { icon: Icon, tile, glyph } = STAT_ART[key];
            return (
              <li
                key={key}
                className="hiw-zoom wiw-float"
                style={
                  {
                    ...delay(500 + index * 120),
                    '--wiw-float-delay': `${-index * 1.4}s`,
                  } as CSSProperties
                }
              >
                <div
                  className={`flex items-center gap-3 rounded-2xl border border-white bg-white/95 py-3 pl-3 pr-4 shadow-lg shadow-slate-200/70 ring-1 ring-slate-100 2xl:gap-3.5 2xl:pr-5 ${STAT_TILT[index]}`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl 2xl:h-12 2xl:w-12 ${tile}`}
                  >
                    <Icon aria-hidden size={26} className={glyph} />
                  </span>
                  <p className="font-heading min-w-0 leading-tight">
                    <span className="block text-base font-extrabold text-slate-900 2xl:text-[17px]">
                      {title}
                    </span>
                    <span className="block text-[13px] font-medium text-slate-600 2xl:text-sm">
                      {body}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const RIBBON =
  'pointer-events-none absolute -z-10 hidden h-auto w-[clamp(12rem,16vw,20rem)] [mask-image:linear-gradient(to_bottom,#000_62%,transparent_92%)] lg:block';

/**
 * Washes and the tricolour ribbons. The glows are sized and centred without `transform`, which
 * their `.hero-glow` loop owns.
 */
function Backdrop() {
  return (
    <>
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-32 top-10 -z-10 h-[26rem] w-[26rem] rounded-full bg-sky-100/60 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -right-24 top-0 -z-10 h-[26rem] w-[26rem] rounded-full bg-blue-100/50 blur-3xl [animation-delay:-4s]"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto h-[22rem] w-full max-w-[44rem] rounded-full bg-blue-100/40 blur-3xl [animation-delay:-2s]"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-32 bottom-0 -z-10 h-[22rem] w-[22rem] rounded-full bg-orange-100/40 blur-3xl [animation-delay:-6s]"
      />

      <Image
        aria-hidden
        src="/home/pricing-tricolor-left.svg"
        alt=""
        width={360}
        height={700}
        unoptimized
        className={`left-0 top-[58%] opacity-40 ${RIBBON}`}
      />
      <Image
        aria-hidden
        src="/home/pricing-tricolor-right.svg"
        alt=""
        width={360}
        height={700}
        unoptimized
        className={`right-0 top-[46%] opacity-60 ${RIBBON}`}
      />
    </>
  );
}

/*
 * From xl the header and the questions share a middle column, with the mascot rail left and the
 * building rail right, each spanning both rows. Below xl the rails are hidden: their points are
 * repeated by the pricing strip just above.
 */
const RAIL = 'relative hidden xl:row-span-2 xl:row-start-1 xl:block';

export function FAQ() {
  const t = useTranslations();
  const [openItem, setOpenItem] = useState<FaqItem | null>(FAQ_ITEMS[0]);
  const titleBefore = t('landing.faq.titleBefore');
  const titleAfter = t('landing.faq.titleAfter');
  // The install answer names the header's button; it reads the same key so the two stay in step.
  const answerValues = { button: t('landing.header.addToChrome') };

  function toggle(item: FaqItem) {
    setOpenItem((current) => (current === item ? null : item));
  }

  return (
    <section
      id="faq"
      className="relative isolate overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-white via-sky-50/60 to-white py-20 lg:py-24"
    >
      <Backdrop />

      <div className="relative mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 xl:grid xl:grid-cols-[minmax(15rem,1fr)_minmax(0,52rem)_minmax(15rem,1fr)] xl:grid-rows-[auto_1fr] xl:gap-x-6 2xl:gap-x-10">
        {/* ── Header ───────────────────────────────────────────────── */}
        <Reveal className="mx-auto max-w-3xl text-center xl:col-start-2 xl:row-start-1 xl:max-w-none">
          <span className="hiw-rise inline-block rounded-full border border-blue-100 bg-blue-50/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0066FF] shadow-sm sm:text-sm">
            {t('landing.faq.pill')}
          </span>
          <h2
            className="hiw-rise font-heading mt-5 text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl 2xl:text-[3.5rem]"
            style={delay(100)}
          >
            {titleBefore && <>{titleBefore} </>}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[#0066FF] to-[#2EA3FF] bg-clip-text text-transparent">
                {t('landing.faq.titleHighlight')}
              </span>
              <Image
                src="/home/brush-underline.svg"
                alt=""
                aria-hidden
                width={220}
                height={20}
                unoptimized
                className="hiw-draw pointer-events-none absolute -bottom-2 left-0 h-auto w-full sm:-bottom-3"
                style={delay(650)}
              />
              {/* Entrance, tilt and twinkle each on their own element: all three use `transform`. */}
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
            </span>
            {titleAfter && <> {titleAfter}</>}
          </h2>
          <p
            className="hiw-rise mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg"
            style={delay(200)}
          >
            {t('landing.faq.subtitle')}
          </p>
        </Reveal>

        {/* ── Questions ────────────────────────────────────────────── */}
        <Reveal className="mx-auto mt-12 max-w-4xl xl:col-start-2 xl:row-start-2 xl:w-full xl:max-w-none">
          <ul className="space-y-3.5 sm:space-y-4">
            {FAQ_ITEMS.map((item, index) => {
              const open = item === openItem;
              const { glyph, tile } = ITEM_ART[item];
              const questionId = `faq-question-${item}`;
              const answerId = `faq-answer-${item}`;
              return (
                <li key={item} className="hiw-rise" style={delay(100 + index * 90)}>
                  <div
                    className={`group rounded-2xl border transition-all duration-300 ease-out ${
                      open
                        ? 'border-blue-300 bg-gradient-to-b from-blue-50/70 to-white shadow-lg shadow-blue-100/70 ring-4 ring-blue-100/50'
                        : 'border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/60 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md'
                    }`}
                  >
                    <h3>
                      <button
                        id={questionId}
                        type="button"
                        aria-expanded={open}
                        aria-controls={answerId}
                        onClick={() => toggle(item)}
                        className="flex w-full items-center gap-4 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2 sm:gap-5 sm:px-6 sm:py-5"
                      >
                        <span
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-105 sm:h-[3.25rem] sm:w-[3.25rem] ${tile}`}
                        >
                          {glyph}
                        </span>
                        <span className="font-heading min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 sm:text-lg">
                          {t(`landing.faq.items.${item}.question`)}
                        </span>
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out sm:h-10 sm:w-10 ${
                            open
                              ? 'rotate-180 border-transparent bg-blue-100 text-[#0066FF]'
                              : 'border-slate-200 bg-white text-slate-500 group-hover:border-blue-200 group-hover:text-[#0066FF]'
                          }`}
                        >
                          <ChevronDown aria-hidden size={20} strokeWidth={2.4} />
                        </span>
                      </button>
                    </h3>
                    {/* Stays mounted so its height can animate; `inert` keeps a closed one out of reach. */}
                    <div
                      id={answerId}
                      role="region"
                      aria-labelledby={questionId}
                      inert={!open}
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        {/* From sm the text lines up with the question, past the icon tile. */}
                        <p className="mx-4 mb-4 rounded-xl bg-slate-50/90 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-100 sm:mx-6 sm:mb-6 sm:py-4 sm:pl-[4.5rem] sm:pr-6 sm:text-[15px]">
                          {t(`landing.faq.items.${item}.answer`, answerValues)}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>

        {/* ── Rails ─────────────────────────────────────────────────── */}
        <Reveal className={`${RAIL} xl:col-start-1`}>
          <MascotRail
            bubble={[t('landing.faq.bubble.line1'), t('landing.faq.bubble.line2')]}
            label={t('landing.faq.assurances.label')}
            rows={FAQ_ASSURANCES.map((key) => ({
              key,
              title: t(`landing.faq.assurances.${key}.title`),
              body: t(`landing.faq.assurances.${key}.body`),
            }))}
          />
        </Reveal>
        <Reveal className={`${RAIL} xl:col-start-3`}>
          <BuildingRail
            label={t('landing.faq.stats.label')}
            stats={FAQ_STATS.map((key) => ({
              key,
              title: t(`landing.faq.stats.${key}.title`),
              body: t(`landing.faq.stats.${key}.body`),
            }))}
          />
        </Reveal>
      </div>
    </section>
  );
}
