import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Landmark,
  Lock,
  MousePointer2,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { getTranslations } from '@/lib/i18n/server';

const CHROME_STORE_URL = 'https://chromewebstore.google.com';

/** Illustrative, invented values for the mockup only — never real applicant data. */
const MOCK_VALUES = {
  fullName: 'Amit Kumar Singh',
  dob: '12/04/2005',
  state: 'Bihar',
  district: 'Bhojpur',
} as const;

const BADGES = [
  { src: '/home/badge-aadhaar.svg', key: 'aadhaar' },
  { src: '/home/badge-pan.svg', key: 'pan' },
  { src: '/home/badge-scholarship.svg', key: 'scholarship' },
  { src: '/home/badge-job.svg', key: 'job' },
  { src: '/home/badge-csc.svg', key: 'csc' },
] as const;

/** Sets one of the hero motion variables read by the "Landing hero motion" block in globals.css. */
function motionVar(name: '--hero-step' | '--hero-delay', value: number | string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

const PANEL_CHECKS = ['personalDetails', 'uploadDocs', 'smartMapping'] as const;

const STATS = [
  { key: 'forms', icon: Users, tone: 'bg-emerald-50 text-emerald-600', value: 'text-slate-900' },
  { key: 'accuracy', icon: Target, tone: 'bg-blue-50 text-[#0066FF]', value: 'text-[#0066FF]' },
  { key: 'click', icon: Zap, tone: 'bg-violet-50 text-violet-600', value: 'text-slate-900' },
  { key: 'aadhaar', icon: ShieldCheck, tone: 'bg-amber-50 text-amber-500', value: 'text-slate-900' },
] as const;

/** A tiny inline tricolour — flag emoji render as the letters "IN" on Windows. */
function IndiaFlag() {
  return (
    <svg aria-hidden viewBox="0 0 18 12" className="h-3 w-[18px] rounded-[2px] shadow-sm ring-1 ring-slate-200">
      <rect width="18" height="4" fill="#FF9933" />
      <rect y="4" width="18" height="4" fill="#FFFFFF" />
      <rect y="8" width="18" height="4" fill="#138808" />
      <circle cx="9" cy="6" r="1.4" fill="none" stroke="#000080" strokeWidth="0.5" />
    </svg>
  );
}

function MockField({
  label,
  value,
  step,
  trailing,
}: {
  label: string;
  value: string;
  step: number;
  trailing?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-500 sm:text-[11px]">{label}</p>
      <div
        style={motionVar('--hero-step', step)}
        className="hero-field mt-1 flex items-center justify-between gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800 sm:text-xs"
      >
        <span style={motionVar('--hero-step', step)} className="hero-fill truncate">
          {value}
        </span>
        {trailing}
      </div>
    </div>
  );
}

export async function Hero() {
  const { t } = await getTranslations();

  const titleBefore = t('landing.hero.titleBefore');
  const titleAfter = t('landing.hero.titleAfter');

  return (
    <section className="font-jakarta relative isolate overflow-hidden bg-gradient-to-b from-blue-50/70 via-slate-50 to-white pt-12 pb-14 sm:pt-16 sm:pb-20">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute right-[8%] top-[10%] -z-10 h-[30rem] w-[30rem] rounded-full bg-blue-200/40 blur-3xl"
      />

      {/* Monuments skyline watermark — cropped above the artwork's own caption */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 aspect-[1376/600] min-h-[18rem] overflow-hidden opacity-20 mix-blend-multiply"
      >
        <Image src="/home/monuments-skyline.png" alt="" fill sizes="100vw" className="object-cover object-top" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-8 xl:grid-cols-[1.07fr_1fr]">
          {/* ── Left: copy ─────────────────────────────────────────── */}
          <div className="min-w-0 text-center lg:text-left">
            <span className="hero-rise inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/85 px-3.5 py-1.5 shadow-sm">
              <Sparkles aria-hidden size={16} className="hero-twinkle fill-amber-300 text-amber-400" />
              <span className="text-xs font-bold text-[#0066FF] sm:text-sm">{t('landing.hero.pill')}</span>
            </span>

            <h1 className="hero-rise font-heading mt-6 [--hero-delay:80ms] text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-950 sm:text-6xl lg:text-[3.4rem] xl:text-[3.9rem]">
              {titleBefore && <>{titleBefore} </>}
              <span className="relative inline-block whitespace-nowrap">
                <span className="bg-gradient-to-r from-[#0066FF] via-[#0088FF] to-cyan-500 bg-clip-text text-transparent">
                  {t('landing.hero.titleHighlight')}
                </span>
                <Image
                  src="/home/brush-underline.svg"
                  alt=""
                  aria-hidden
                  width={220}
                  height={20}
                  unoptimized
                  className="hero-draw pointer-events-none absolute -bottom-2 left-0 h-auto w-full [--hero-delay:650ms] sm:-bottom-3"
                />
              </span>
              {titleAfter && <> {titleAfter}</>}
            </h1>

            <p className="hero-rise mx-auto mt-6 max-w-lg [--hero-delay:160ms] text-lg leading-relaxed text-slate-600 lg:mx-0">
              {t('landing.hero.subtitleLead')}{' '}
              <strong className="font-bold text-[#0066FF]">{t('landing.hero.subtitleHighlight')}</strong>
              {t('landing.hero.subtitleTail')}
            </p>

            <div className="hero-rise mt-8 flex flex-col items-center gap-3 [--hero-delay:240ms] sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0055EE] via-[#0066FF] to-sky-500 py-3.5 pl-3 pr-5 text-base font-bold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-[1.03] hover:shadow-blue-500/45 sm:w-auto sm:whitespace-nowrap"
              >
                <span
                  aria-hidden
                  className="hero-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                  <Image src="/chrome.png" alt="" aria-hidden width={28} height={28} className="h-7 w-7 object-contain" />
                </span>
                <span>{t('landing.hero.ctaPrimary')}</span>
                <ArrowRight aria-hidden size={20} className="transition-transform group-hover:translate-x-1" />
              </a>

              <a
                href="#demo"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-900 shadow-sm transition-all duration-300 hover:border-blue-300 hover:bg-slate-50 sm:w-auto sm:whitespace-nowrap"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0066FF] text-[#0066FF]">
                  <Play aria-hidden size={13} className="ml-0.5" strokeWidth={2.6} />
                </span>
                <span>{t('landing.hero.ctaDemo')}</span>
              </a>
            </div>

            {/* One quiet line of proof — the numbers live in the stats bar below */}
            <ul className="hero-rise mt-7 flex flex-wrap [--hero-delay:320ms] items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-slate-600 lg:justify-start">
              <li className="inline-flex items-center gap-1.5">
                <span role="img" aria-label={t('landing.hero.ratingLabel')} className="flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} aria-hidden size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </span>
                {t('landing.hero.rating')}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Check aria-hidden size={16} strokeWidth={3} className="text-emerald-500" />
                {t('landing.hero.checks.secure')}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <IndiaFlag />
                {t('landing.hero.checks.madeForIndia')}
              </li>
            </ul>
          </div>

          {/* ── Right: product mockup ──────────────────────────────── */}
          <div
            role="img"
            aria-label={t('landing.hero.mockup.label')}
            className="hero-slide-in relative mx-auto flex w-full min-w-0 max-w-xl items-center justify-center gap-4 [--hero-delay:200ms] [perspective:1800px]"
          >
            {/* Document badges — dropped at lg, where the half-width column cannot fit them and the form */}
            <div className="hidden shrink-0 flex-col gap-2 sm:flex lg:hidden xl:flex">
              {BADGES.map((badge, index) => (
                <Image
                  key={badge.key}
                  style={motionVar('--hero-delay', `${index * -900}ms`)}
                  src={badge.src}
                  alt={t(`landing.hero.mockup.${badge.key}`)}
                  width={96}
                  height={96}
                  unoptimized
                  className="hero-bob h-16 w-16 drop-shadow-md xl:h-[4.5rem] xl:w-[4.5rem]"
                />
              ))}
            </div>

            {/* Browser window */}
            <div className="relative w-full min-w-0 max-w-[30rem] rounded-3xl border border-white bg-white shadow-2xl shadow-blue-900/15 ring-1 ring-slate-200/70 [transform:rotateY(-8deg)_rotateX(4deg)]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
                  <Lock aria-hidden size={12} className="shrink-0 text-emerald-600" />
                  <span className="truncate">https://www.gov.in/form</span>
                </div>
              </div>

              {/* On narrow phones the extension panel sits under the form, so the fields keep their values readable. */}
              <div className="grid grid-cols-1 gap-4 p-4 min-[400px]:grid-cols-[1fr_auto] min-[400px]:p-5">
                {/* Government form */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {/* A generic government mark, not the State Emblem: commercial use of the emblem is restricted by law. */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <Landmark aria-hidden size={16} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 text-sm font-extrabold leading-tight text-slate-900 sm:text-base">
                      {t('landing.hero.mockup.formTitle')}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <MockField label={t('landing.hero.mockup.fullName')} value={MOCK_VALUES.fullName} step={0} />
                    <MockField
                      label={t('landing.hero.mockup.dob')}
                      value={MOCK_VALUES.dob}
                      step={1}
                      trailing={<Calendar aria-hidden size={12} className="shrink-0 text-slate-400" />}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <MockField
                        label={t('landing.hero.mockup.state')}
                        value={MOCK_VALUES.state}
                        step={2}
                        trailing={<ChevronDown aria-hidden size={12} className="shrink-0 text-slate-400" />}
                      />
                      <MockField
                        label={t('landing.hero.mockup.district')}
                        value={MOCK_VALUES.district}
                        step={3}
                        trailing={<ChevronDown aria-hidden size={12} className="shrink-0 text-slate-400" />}
                      />
                    </div>
                  </div>
                </div>

                {/* Bharatfill extension panel */}
                <div className="flex w-full flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3 min-[400px]:w-36 sm:w-40">
                  <span className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 sm:text-xs">
                    <Zap aria-hidden size={12} className="fill-amber-400 text-amber-400" />
                    {t('landing.hero.mockup.autoFillAi')}
                  </span>
                  <ul className="space-y-2.5">
                    {PANEL_CHECKS.map((key, index) => (
                      <li key={key} style={motionVar('--hero-step', index)} className="hero-tick flex items-start gap-1.5 text-[11px] font-semibold leading-tight text-slate-700">
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check aria-hidden size={9} strokeWidth={3.5} />
                        </span>
                        {t(`landing.hero.mockup.${key}`)}
                      </li>
                    ))}
                  </ul>
                  <div className="relative mt-auto">
                    <span aria-hidden className="hero-ripple pointer-events-none absolute inset-0 rounded-xl bg-blue-400/60" />
                    <div className="hero-press relative rounded-xl bg-gradient-to-r from-[#0066FF] to-sky-500 px-2 py-2.5 text-center text-xs font-bold text-white shadow-md shadow-blue-500/30 sm:text-sm">
                      {t('landing.hero.mockup.fillButton')}
                    </div>
                    <MousePointer2
                      aria-hidden
                      size={26}
                      strokeWidth={1.6}
                      className="hero-cursor absolute -bottom-5 -right-2 fill-[#0066FF] text-white drop-shadow"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats bar ─────────────────────────────────────────────── */}
        {/* Four across only from lg: below it the values ("1,00,000+" in Hindi) collide with the dividers. */}
        <dl className="hero-rise mx-auto mt-14 grid [--hero-delay:450ms] max-w-5xl grid-cols-2 gap-y-6 rounded-3xl border border-white bg-white/85 px-4 py-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-100 backdrop-blur-md sm:px-6 lg:mt-16 lg:max-w-6xl lg:grid-cols-4 lg:divide-x lg:divide-slate-200">
          {STATS.map(({ key, icon: Icon, tone, value }) => (
            <div
              key={key}
              className="flex flex-col items-center justify-center gap-2 px-2 text-center min-[400px]:flex-row min-[400px]:gap-3 min-[400px]:text-left md:px-4"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${tone}`}>
                <Icon aria-hidden size={22} strokeWidth={2.1} />
              </span>
              <div className="flex min-w-0 flex-col-reverse">
                <dt className="text-xs font-medium text-slate-600 sm:text-sm">{t(`landing.hero.stats.${key}Label`)}</dt>
                <dd className={`font-heading whitespace-nowrap text-xl font-extrabold tabular-nums sm:text-2xl ${value}`}>
                  {t(`landing.hero.stats.${key}Value`)}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
