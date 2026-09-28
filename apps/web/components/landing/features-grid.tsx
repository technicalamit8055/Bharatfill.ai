import type { CSSProperties } from 'react';
import Image from 'next/image';
import { FileUp, Scan, ShieldCheck, Users } from 'lucide-react';
import { getTranslations } from '@/lib/i18n/server';
import { Reveal } from '@/components/landing/reveal';

/**
 * `scan`      — a glowing ring pulses around the detected field on hover.
 * `float`     — the whole graphic bobs gently (its badge is baked into the PNG).
 * `highlight` — the verified profile row lights up on hover.
 * `halo`      — a blue halo breathes behind the shield.
 */
type Effect = 'scan' | 'float' | 'highlight' | 'halo';

const FEATURES = [
  {
    key: 'fieldRecognition',
    image: '/home/feature-field-recognition.png',
    icon: Scan,
    effect: 'scan',
    fadeEdges: false,
    card: 'from-blue-50 via-white to-blue-50/80 hover:border-blue-200 hover:shadow-blue-200/50',
    tile: 'from-blue-400 to-[#0066FF] shadow-blue-500/30',
    pill: 'bg-blue-100/70 text-blue-700 ring-blue-200/70',
  },
  {
    key: 'ocrParsing',
    image: '/home/feature-ocr-parsing.png',
    icon: FileUp,
    effect: 'float',
    // This PNG's background is off-white, which multiply cannot hide, so its edges are feathered.
    fadeEdges: true,
    card: 'from-emerald-50 via-white to-emerald-50/80 hover:border-emerald-200 hover:shadow-emerald-200/50',
    tile: 'from-emerald-400 to-emerald-600 shadow-emerald-500/30',
    pill: 'bg-emerald-100/70 text-emerald-700 ring-emerald-200/70',
  },
  {
    key: 'customerVault',
    image: '/home/feature-customer-vault.png',
    icon: Users,
    effect: 'highlight',
    fadeEdges: false,
    card: 'from-violet-50 via-white to-violet-50/80 hover:border-violet-200 hover:shadow-violet-200/50',
    tile: 'from-violet-400 to-violet-600 shadow-violet-500/30',
    pill: 'bg-violet-100/70 text-violet-700 ring-violet-200/70',
  },
  {
    key: 'privacyMasking',
    image: '/home/feature-privacy-masking.png',
    icon: ShieldCheck,
    effect: 'halo',
    fadeEdges: false,
    card: 'from-amber-50 via-white to-orange-50/80 hover:border-amber-200 hover:shadow-amber-200/50',
    tile: 'from-amber-400 to-orange-500 shadow-amber-500/30',
    pill: 'bg-amber-100/70 text-amber-700 ring-amber-200/70',
  },
] as const;

/** Stagger for the "How it works" motion block in globals.css, shared by this section. */
function delay(ms: number): CSSProperties {
  return { '--hiw-delay': `${ms}ms` } as CSSProperties;
}

/** The three blue strokes either side of the title; the artwork points right, so the left one is mirrored. */
function TitleAccent({ side, ms }: { side: 'left' | 'right'; ms: number }) {
  return (
    <span aria-hidden className="hiw-pop hidden shrink-0 sm:block" style={delay(ms)}>
      <span className={side === 'left' ? 'block -scale-x-100' : 'block'}>
        <Image
          src="/home/heading-accents.svg"
          alt=""
          width={32}
          height={32}
          unoptimized
          className="hero-twinkle h-10 w-10 lg:h-12 lg:w-12"
        />
      </span>
    </span>
  );
}

/** Same zoom as the image, so an overlay positioned in image percentages stays on its target. */
const TRACK_IMAGE = 'pointer-events-none absolute inset-0 transition-transform duration-500 group-hover:scale-105';

const FADE_EDGES =
  '[mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent),linear-gradient(to_bottom,transparent,#000_6%,#000_94%,transparent)]';

/**
 * The card graphic. The PNGs are opaque white, so they sit in the card with `mix-blend-multiply`
 * rather than a frame. That blend is isolated by any transformed ancestor, so the image carries
 * its own motion (see "Landing features motion" in globals.css) and effects are siblings of it.
 */
function FeatureArt({
  image,
  effect,
  fadeEdges,
  ms,
}: {
  image: string;
  effect: Effect;
  fadeEdges: boolean;
  ms: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
      {effect === 'halo' && (
        // A `drop-shadow` would trace the PNG's rectangle, not the shield; this halo sits behind
        // the image and shows through the white around the shield instead.
        <div aria-hidden className={`hiw-zoom ${TRACK_IMAGE}`} style={delay(ms)}>
          <div className="feat-halo absolute left-[47.5%] top-[11.7%] h-[70%] w-[43%] rounded-full bg-[radial-gradient(closest-side,rgba(37,99,235,0.12),rgba(37,99,235,0.45)_70%,transparent)] blur-xl" />
        </div>
      )}

      <Image
        src={image}
        alt=""
        width={1200}
        height={896}
        sizes="(min-width: 1280px) 260px, (min-width: 1024px) 21vw, 384px"
        className={`hiw-zoom relative block h-auto w-full mix-blend-multiply transition-transform duration-500 group-hover:scale-105 ${
          effect === 'float' ? 'feat-float' : ''
        } ${fadeEdges ? FADE_EDGES : ''}`}
        style={delay(ms)}
      />

      {effect === 'scan' && (
        <div aria-hidden className={TRACK_IMAGE}>
          <div className="absolute left-[21%] top-[43%] h-[16%] w-[57%] opacity-0 transition-opacity delay-150 duration-300 group-hover:opacity-100">
            <div className="absolute inset-0 rounded-xl shadow-[0_0_24px_6px] shadow-cyan-400/30 ring-2 ring-cyan-400/70 motion-safe:animate-pulse" />
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <div className="feat-sweep h-full w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {effect === 'highlight' && (
        <div aria-hidden className={TRACK_IMAGE}>
          <div className="absolute left-[29.5%] top-[39.5%] h-[13%] w-[43%] rounded-lg bg-violet-500/[0.06] opacity-0 shadow-lg shadow-violet-500/20 ring-2 ring-violet-400/70 transition-opacity delay-150 duration-300 group-hover:opacity-100" />
        </div>
      )}
    </div>
  );
}

export async function FeaturesGrid() {
  const { t } = await getTranslations();
  const titleBefore = t('landing.features.titleBefore');
  const titleAfter = t('landing.features.titleAfter');

  return (
    <section
      id="features"
      className="relative isolate overflow-hidden bg-gradient-to-b from-blue-50/40 via-slate-50 to-white py-20 lg:py-24"
    >
      {/* Soft background washes */}
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -right-32 top-16 -z-10 h-[26rem] w-[26rem] rounded-full bg-blue-100/60 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -left-24 bottom-10 -z-10 h-[24rem] w-[24rem] rounded-full bg-amber-100/50 blur-3xl [animation-delay:-4s]"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Header ───────────────────────────────────────────────── */}
        <Reveal className="mx-auto max-w-6xl text-center">
          <span className="hiw-rise inline-block rounded-full border border-blue-100 bg-blue-50/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0066FF] shadow-sm sm:text-sm">
            {t('landing.features.pill')}
          </span>
          <div className="mt-5 flex items-center justify-center gap-3 lg:gap-5">
            <TitleAccent side="left" ms={500} />
            <h2
              className="hiw-rise font-heading text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem]"
              style={delay(100)}
            >
              {titleBefore && <>{titleBefore} </>}
              {/* The highlight always takes its own line, before or after the rest of the title. */}
              <span className="relative mx-auto block w-fit">
                <span className="bg-gradient-to-r from-[#0066FF] via-[#0088FF] to-cyan-500 bg-clip-text text-transparent">
                  {t('landing.features.titleHighlight')}
                </span>
                <Image
                  src="/home/brush-underline-10x.svg"
                  alt=""
                  aria-hidden
                  width={240}
                  height={20}
                  unoptimized
                  className="hiw-draw pointer-events-none absolute -bottom-2 left-0 h-auto w-full sm:-bottom-3"
                  style={delay(650)}
                />
              </span>
              {titleAfter && <> {titleAfter}</>}
            </h2>
            <TitleAccent side="right" ms={580} />
          </div>
          <p className="hiw-rise mt-6 text-base text-slate-600 sm:text-lg" style={delay(200)}>
            {t('landing.features.subtitle')}
          </p>
        </Reveal>

        {/* ── Bento cards ──────────────────────────────────────────── */}
        <ul className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          {FEATURES.map(({ key, image, icon: Icon, effect, fadeEdges, card, tile, pill }, index) => {
            const base = index * 120;
            return (
              <li key={key}>
                <Reveal
                  className={`hiw-rise group relative flex h-full flex-col gap-6 overflow-hidden rounded-3xl border border-white bg-gradient-to-br p-6 shadow-lg shadow-slate-200/60 ring-1 ring-slate-100 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl lg:flex-row lg:items-center lg:gap-4 lg:p-8 ${card}`}
                  style={delay(base)}
                >
                  <div className="min-w-0 lg:flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`hiw-pop flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${tile}`}
                        style={delay(base + 250)}
                      >
                        <Icon aria-hidden size={26} strokeWidth={2.1} />
                      </span>
                      <span
                        className={`hiw-rise rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 sm:text-sm ${pill}`}
                        style={delay(base + 350)}
                      >
                        {t(`landing.features.cards.${key}.badge`)}
                      </span>
                    </div>
                    <h3 className="font-heading mt-5 text-xl font-bold text-slate-950 lg:text-2xl">
                      {t(`landing.features.cards.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 lg:text-[15px]">
                      {t(`landing.features.cards.${key}.description`)}
                    </p>
                  </div>

                  <div className="lg:w-[46%] lg:shrink-0">
                    <FeatureArt
                      image={image}
                      effect={effect}
                      fadeEdges={fadeEdges}
                      ms={base + 300}
                    />
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
