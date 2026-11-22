'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Rocket, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { LaunchLeadForm } from './launch-lead-form';

/**
 * What a visitor sees instead of the sign-up form while sign-ups are closed (pre-launch mode).
 * Shared by /sign-up and the landing page's launch dialog so the two cannot say different
 * things: the early-access offer, the form that joins the list, and the channel link if one is
 * configured.
 */
export function LaunchNotice({
  channelUrl,
  heading: Heading = 'h2',
  titleId,
}: {
  channelUrl: string | null;
  /** h1 on /sign-up, where it is the page title; h2 inside the landing dialog. */
  heading?: 'h1' | 'h2';
  titleId?: string;
}) {
  const t = useTranslations();
  const title = t('launch.title');
  const appName = t('app.name');
  const at = title.indexOf(appName);

  return (
    <div className="text-left">
      <div className="relative">
        {/* Decoration only: the heading and body say everything the picture does. */}
        <Image
          src="/launch/christmas-tech-launch.webp"
          alt=""
          aria-hidden
          width={960}
          height={748}
          loading="eager"
          className="pointer-events-none absolute -right-4 -top-1 w-[50%] max-w-[270px] select-none sm:-right-5 sm:w-[53%]"
        />

        <div className="relative">
          {/* The brand lockup, written the same in every language, as the logo is. */}
          <div className="flex items-center gap-3">
            <Image
              src="/launch/bharatfill-mark.png"
              alt=""
              aria-hidden
              width={128}
              height={128}
              loading="eager"
              className="h-14 w-14 shrink-0 rounded-2xl shadow-lg shadow-blue-600/25 sm:h-16 sm:w-16"
            />
            <div className="min-w-0">
              <p className="font-heading text-[26px] font-extrabold leading-none tracking-tight text-[#0B1B4D] sm:text-[32px]">
                Bharat<span className="text-[#0066FF]">fill</span>
              </p>
              <span className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0052E0] ring-1 ring-blue-100 sm:text-[11px]">
                <Rocket aria-hidden size={13} className="fill-orange-400 text-rose-500" />
                {t('launch.pill')}
              </span>
            </div>
          </div>

          <Heading
            id={titleId}
            className="font-heading mt-7 max-w-[62%] text-[26px] font-extrabold leading-[1.12] tracking-tight text-[#0B1B4D] sm:mt-8 sm:text-[32px]"
          >
            {at < 0 ? (
              title
            ) : (
              <>
                {title.slice(0, at)}
                <span className="text-[#0066FF]">{appName}</span>
                {title.slice(at + appName.length)}
              </>
            )}{' '}
            <Sparkles
              aria-hidden
              className="inline h-6 w-6 fill-amber-300 align-[-2px] text-amber-400 sm:h-7 sm:w-7"
            />
          </Heading>

          <p className="mt-3 max-w-[58%] text-[15px] leading-relaxed text-slate-600 sm:text-base">
            {t('launch.body')}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50 via-amber-50/70 to-orange-50/60 px-4 py-3.5 sm:gap-4">
        <GiftArt className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
        <p className="text-[15px] leading-relaxed text-slate-800">
          {t('launch.offerLead')}{' '}
          <strong className="font-extrabold text-[#E8380D]">{t('launch.offerHighlight')}</strong>
        </p>
      </div>

      <div className="mt-6">
        <LaunchLeadForm />
      </div>

      <div className="mt-6 flex items-center gap-4">
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
        <p className="text-center text-[15px] text-slate-600">
          {t('launch.haveAccount')}{' '}
          <Link href="/sign-in" className="font-bold text-[#0066FF] hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
      </div>

      {channelUrl ? (
        <p className="mt-3 text-center">
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 hover:underline"
          >
            {t('launch.channelCta')}
            <ArrowUpRight aria-hidden size={16} />
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** A wrapped gift with a little burst, drawn so it matches on every platform (no emoji). */
function GiftArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 56 56" className={className}>
      <g stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 14l4 3" />
        <path d="M4 24h5" />
        <path d="M46 10l-3 4" />
        <path d="M51 20l-5 2" />
      </g>
      <rect x="13" y="27" width="30" height="22" rx="3" fill="#FBBF24" />
      <rect x="13" y="27" width="30" height="6" fill="#F59E0B" />
      <rect x="11" y="21" width="34" height="8" rx="2.5" fill="#FCD34D" />
      <rect x="25" y="21" width="6" height="28" fill="#EF4444" />
      <path
        d="M28 21c-3-6-11-9-12-4-.8 3.6 6 4.6 12 4zm0 0c3-6 11-9 12-4 .8 3.6-6 4.6-12 4z"
        fill="#DC2626"
      />
      <rect x="13" y="33" width="30" height="1.5" fill="#D97706" opacity=".35" />
    </svg>
  );
}
