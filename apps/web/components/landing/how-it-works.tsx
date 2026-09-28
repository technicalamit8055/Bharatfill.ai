import type { CSSProperties } from 'react';
import Image from 'next/image';
import { CircleCheck, Clock, FileText, Lock, Search, Users, Zap } from 'lucide-react';
import { getTranslations } from '@/lib/i18n/server';
import { Reveal } from '@/components/landing/reveal';

const STEPS = [
  {
    key: 'profile',
    number: '01',
    image: '/home/how-it-works-step-1.png',
    icon: FileText,
    card: 'from-blue-50/90 hover:border-blue-200',
    badge: 'from-blue-400 to-[#0066FF] shadow-blue-500/30 [--hiw-ring:59_130_246]',
    pill: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    key: 'detect',
    number: '02',
    image: '/home/how-it-works-step-2.png',
    icon: Search,
    card: 'from-violet-50/90 hover:border-violet-200',
    badge: 'from-violet-400 to-violet-600 shadow-violet-500/30 [--hiw-ring:139_92_246]',
    pill: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    key: 'fill',
    number: '03',
    image: '/home/how-it-works-step-3.png',
    icon: CircleCheck,
    card: 'from-emerald-50/90 hover:border-emerald-200',
    badge: 'from-emerald-400 to-emerald-600 shadow-emerald-500/30 [--hiw-ring:16_185_129]',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
] as const;

const SIGNALS = [
  { key: 'setup', icon: Zap, tone: 'bg-amber-50 text-amber-500 [&>svg]:fill-amber-400' },
  { key: 'secure', icon: Lock, tone: 'bg-blue-50 text-[#0066FF]' },
  { key: 'portals', icon: Users, tone: 'bg-violet-50 text-violet-600' },
  { key: 'faster', icon: Clock, tone: 'bg-emerald-50 text-emerald-600' },
] as const;

/** Stagger for the "How it works" motion block in globals.css. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

/** The short blue accent strokes either side of the title; the right one is mirrored. */
function TitleDashes({ side, ms }: { side: 'left' | 'right'; ms: number }) {
  return (
    <span aria-hidden className="hiw-pop hidden shrink-0 sm:block" style={delay(ms)}>
      <svg
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        className="hero-twinkle h-10 w-10 text-[#0066FF]"
      >
        {/* Mirrored with an SVG transform so it does not fight the twinkle's CSS transform. */}
        <g transform={side === 'right' ? 'matrix(-1 0 0 1 40 0)' : undefined}>
          <path d="M22 5l9 11" />
          <path d="M4 26l22 6" />
        </g>
      </svg>
    </span>
  );
}

export async function HowItWorks() {
  const { t } = await getTranslations();
  const titleBefore = t('landing.howItWorks.titleBefore');
  const titleAfter = t('landing.howItWorks.titleAfter');

  return (
    <section
      id="how-it-works"
      className="relative isolate overflow-hidden border-y border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-blue-50/40 py-20 lg:py-24"
    >
      {/* Soft background washes */}
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-32 top-24 -z-10 h-[26rem] w-[26rem] rounded-full bg-blue-100/60 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -right-24 bottom-10 -z-10 h-[24rem] w-[24rem] rounded-full bg-violet-100/60 blur-3xl [animation-delay:-4s]"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Header ───────────────────────────────────────────────── */}
        <Reveal className="mx-auto max-w-4xl text-center">
          <span className="hiw-rise inline-block rounded-full border border-blue-100 bg-blue-50/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0066FF] shadow-sm sm:text-sm">
            {t('landing.howItWorks.pill')}
          </span>
          <div className="mt-5 flex items-center justify-center gap-3">
            <TitleDashes side="left" ms={500} />
            <h2
              className="hiw-rise font-heading text-3xl font-extrabold tracking-tight text-slate-950 sm:text-5xl"
              style={delay(100)}
            >
              {titleBefore && <>{titleBefore} </>}
              <span className="bg-gradient-to-r from-[#0066FF] to-blue-500 bg-clip-text text-transparent">
                {t('landing.howItWorks.titleHighlight')}
              </span>
              {titleAfter && <> {titleAfter}</>}
            </h2>
            <TitleDashes side="right" ms={580} />
          </div>
          <p className="hiw-rise mt-4 text-base text-slate-600 sm:text-lg" style={delay(200)}>
            {t('landing.howItWorks.subtitle')}
          </p>
        </Reveal>

        {/* ── Step cards ───────────────────────────────────────────── */}
        <ol className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
          {STEPS.map(({ key, number, image, icon: Icon, card, badge, pill }, index) => {
            const base = index * 150;
            return (
              // Earlier cards stack above later ones so each connector arrow overlaps the next card.
              <li key={key} className="relative" style={{ zIndex: STEPS.length - index }}>
                <Reveal
                  className={`hiw-rise group relative flex h-full flex-col rounded-3xl border border-white bg-gradient-to-b to-white/80 p-6 shadow-lg shadow-slate-200/60 ring-1 ring-slate-100 backdrop-blur-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-xl lg:p-7 ${card}`}
                  style={delay(base)}
                >
                  {/* Three narrow columns on tablets: the pill drops under the number rather than wrapping beside it. */}
                  <div className="flex items-center gap-3 md:flex-col md:items-start lg:flex-row lg:items-center">
                    <span className="hiw-pop relative shrink-0" style={delay(base + 250)}>
                      <span
                        aria-hidden
                        className={`hiw-ring absolute inset-0 rounded-full ${badge}`}
                        style={delay(index * 600)}
                      />
                      <span
                        className={`font-heading relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-xl font-extrabold text-white shadow-lg ring-4 ring-white ${badge}`}
                      >
                        {number}
                      </span>
                    </span>
                    <span
                      className={`hiw-rise inline-flex min-w-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 sm:text-sm ${pill}`}
                      style={delay(base + 350)}
                    >
                      <Icon aria-hidden size={16} strokeWidth={2.2} className="shrink-0" />
                      {t(`landing.howItWorks.steps.${key}.badge`)}
                    </span>
                  </div>

                  <h3 className="font-heading mt-5 text-xl font-bold text-slate-950 lg:text-2xl">
                    {t(`landing.howItWorks.steps.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 lg:text-[15px]">
                    {t(`landing.howItWorks.steps.${key}.description`)}
                  </p>

                  <div className="hiw-zoom mt-auto pt-6" style={delay(base + 300)}>
                    <div className="hero-bob" style={{ '--hero-delay': `${index * -1500}ms` } as CSSProperties}>
                      <div className="overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-100 transition-transform duration-500 group-hover:scale-[1.02]">
                        <Image
                          src={image}
                          alt=""
                          width={1200}
                          height={896}
                          sizes="(min-width: 1280px) 400px, (min-width: 768px) 33vw, 100vw"
                          className="h-auto w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {index < STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="hiw-draw pointer-events-none absolute -right-3 top-[58%] z-10 hidden w-12 translate-x-1/2 md:block lg:-right-4 lg:w-16"
                      style={delay(base + 650)}
                    >
                      <Image
                        src="/home/step-connector-arrow.svg"
                        alt=""
                        width={64}
                        height={24}
                        unoptimized
                        className="hiw-nudge h-auto w-full"
                      />
                    </div>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ol>

        {/* ── Signal bar ───────────────────────────────────────────── */}
        <Reveal className="mx-auto mt-12 max-w-6xl">
          {/* Four across only from lg, as in the hero stats bar. */}
          <ul className="grid grid-cols-2 gap-y-6 rounded-3xl border border-white bg-white/85 px-4 py-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-100 backdrop-blur-md sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-slate-200 lg:rounded-full">
            {SIGNALS.map(({ key, icon: Icon, tone }, index) => (
              <li
                key={key}
                className="hiw-rise flex flex-col items-center justify-center gap-2 px-2 text-center min-[400px]:flex-row min-[400px]:gap-3 min-[400px]:text-left md:px-4"
                style={delay(index * 110)}
              >
                <span
                  className={`hiw-pop flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${tone}`}
                  style={delay(index * 110 + 200)}
                >
                  <Icon aria-hidden size={22} strokeWidth={2.1} />
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold text-slate-900 sm:text-base">
                    {t(`landing.howItWorks.signals.${key}Title`)}
                  </p>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {t(`landing.howItWorks.signals.${key}Label`)}
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
