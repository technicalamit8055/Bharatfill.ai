import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from '@/lib/i18n/server';

/**
 * The marketing half of the split auth screen. Hidden below `lg` so the form is the whole screen
 * on the phones most operators sign in from.
 *
 * The desk photo already carries the floating document cards and the arrow into the laptop, so
 * the `card-*.svg` files are not layered on top of it — that would draw every card twice.
 */
export async function BrandPanel() {
  const { t } = await getTranslations();

  return (
    <aside className="relative hidden overflow-hidden bg-white lg:flex lg:w-1/2 lg:flex-col xl:w-[54%]">
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-blue-50/60 via-white to-white"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(0,102,255,0.10),transparent_55%)]"
      />

      {/*
       * Pinned to the bottom and faded in from the top, so on a short window the headline sits
       * over the photo's empty wall rather than pushing the laptop off-screen.
       */}
      <div className="absolute inset-x-0 bottom-0 h-[64%]">
        <Image
          src="/auth/auth-hero-desk.jpg"
          alt={t('auth.brand.heroAlt')}
          fill
          priority
          sizes="(min-width: 1280px) 54vw, 50vw"
          className="object-cover object-[70%_35%] [mask-image:linear-gradient(to_bottom,transparent,#000_22%)]"
        />
      </div>

      <div className="relative z-10 px-12 pt-10 xl:px-16 xl:pt-12">
        {/* The PNG has generous transparent padding; the negative margins trim it visually. */}
        <Link href="/" aria-label={t('app.name')} className="-mb-4 -ml-3 -mt-5 inline-block">
          <Image
            src="/Bharatfill-logo.png"
            alt={t('app.name')}
            width={1915}
            height={821}
            priority
            className="h-24 w-auto object-contain object-left"
          />
        </Link>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('auth.brand.tagline')}
        </p>

        <h2 className="font-heading mt-10 max-w-[30rem] text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-950 xl:text-5xl 2xl:text-6xl">
          {t('auth.brand.headlineLead')}{' '}
          <span className="whitespace-nowrap">
            <span className="text-[#0066FF]">{t('auth.brand.headlineAccent')}</span>
            <Image
              src="/auth/heading-accents.svg"
              alt=""
              width={32}
              height={32}
              unoptimized
              className="ml-2 inline-block h-8 w-8 -translate-y-1 align-middle xl:h-10 xl:w-10"
            />
          </span>
        </h2>
      </div>
    </aside>
  );
}
