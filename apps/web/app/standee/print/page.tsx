import { buildWebDropLink } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { publicEnv } from '@/lib/env';
import { qrToSvg } from '@/lib/document-drop/qr';
import { whatsappBotNumber } from '@/lib/document-drop/whatsapp';
import { buildDropLinks } from '@/lib/document-drop/links';
import { PrintButton } from './print-button';

export const metadata = { title: 'Counter card' };

/**
 * The printable counter tent card (§9.1).
 *
 * A laminated card that sits on the counter for months, so it carries the organization's
 * *permanent* `counter_drop_code`, not a session code — each citizen who scans it gets their own
 * fresh session, which is what stops two people at one counter landing in one intake.
 *
 * Deliberately outside the `(app)` route group: that layout wraps every page in the sidebar and
 * header, and this one exists to come out of a printer. It still requires a signed-in session —
 * `/standee` is not in `PUBLIC_PATHS`, and `requireSession()` re-checks here regardless.
 *
 * Laid out for A5 portrait, which is the size that stands up folded on a desk. The design rules
 * are all about the room it will live in: high contrast for a fluorescent-lit counter, a QR big
 * enough for a cheap phone camera at arm's length, Hindi first because that is what the citizen
 * reads, and three numbered steps because a queue does not read paragraphs.
 */
export default async function StandeePrintPage() {
  const session = await requireSession();
  const { t } = await getTranslations();

  const code = session.organization.counter_drop_code;

  if (!code) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-slate-700">{t('documentDrop.standee.noCode')}</p>
        <a href="/dashboard?drop=1" className="mt-3 inline-block text-sm text-brand-700 underline">
          {t('documentDrop.openButton')}
        </a>
      </main>
    );
  }

  // The card's QR points at the web drop page, not at `wa.me`. A printed code has to work for
  // every phone that will ever be held up to it — including one with no WhatsApp — and the web
  // page offers the WhatsApp hand-off as its first button anyway.
  const webLink = buildWebDropLink(publicEnv().NEXT_PUBLIC_APP_URL, code);
  const qr = qrToSvg(webLink, { dark: '#000000', light: '#ffffff', margin: 2 });

  const whatsappLink = (await buildDropLinks(code)).whatsapp;
  const botNumber = await whatsappBotNumber();

  const place = [session.organization.city, session.organization.district, session.organization.state]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <>
      {/*
       * Print rules, inline because this is the only page in the app that has any. `exact` colour
       * adjustment matters: browsers helpfully lighten backgrounds when printing, and a
       * "helpfully" greyed QR is one that will not scan.
       */}
      <style>{`
        @page { size: A5 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #ffffff !important; }
          .standee {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <main className="min-h-dvh bg-slate-100 px-4 py-6 print:bg-white">
        <div className="no-print mx-auto mb-4 flex max-w-[148mm] items-center justify-between gap-3">
          <a href="/dashboard" className="text-sm text-slate-600 hover:underline">
            ← {t('nav.dashboard')}
          </a>
          <PrintButton label={t('documentDrop.standee.printButton')} />
        </div>

        <article className="standee mx-auto flex w-full max-w-[148mm] flex-col items-center gap-5 rounded-xl border border-slate-300 bg-white px-8 py-8 shadow-sm">
          <header className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {session.organization.name}
            </p>
            {place ? <p className="text-[11px] text-slate-400">{place}</p> : null}
          </header>

          <div className="text-center">
            {/* Hindi first, at the larger size: it is the line the citizen in the queue reads. */}
            <h1 className="text-2xl font-bold leading-tight text-slate-900">
              {t('documentDrop.standee.titleHi')}
            </h1>
            <p className="mt-1 text-base font-semibold text-slate-700">
              {t('documentDrop.standee.title')}
            </p>
          </div>

          <div
            className="w-[62mm] rounded-lg border-2 border-slate-900 bg-white p-2"
            // Generated server-side from a link built above; no external input reaches it.
            dangerouslySetInnerHTML={{ __html: qr }}
          />

          <div className="text-center">
            <p className="font-mono text-xl font-bold tracking-[0.2em] text-slate-900">{code}</p>
            <p className="text-[11px] text-slate-500">
              {t('documentDrop.standee.codeCaption', { code })}
            </p>
          </div>

          <p className="max-w-[110mm] text-center text-sm font-medium text-slate-800">
            {t('documentDrop.standee.instruction')}
          </p>

          {whatsappLink && botNumber ? (
            <p className="text-center text-xs text-slate-600">
              WhatsApp: <span className="font-semibold">{botNumber}</span> — “START {code}”
            </p>
          ) : null}

          <ol className="grid w-full grid-cols-3 gap-3">
            {[
              ['one', 'oneHint'],
              ['two', 'twoHint'],
              ['three', 'threeHint'],
            ].map(([step, hint], index) => (
              <li key={step} className="flex flex-col items-center gap-1.5 text-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-xs font-semibold leading-tight text-slate-900">
                  {t(`documentDrop.standee.steps.${step}`)}
                </span>
                <span className="text-[10px] leading-tight text-slate-500">
                  {t(`documentDrop.standee.steps.${hint}`)}
                </span>
              </li>
            ))}
          </ol>

          {/*
           * The reassurance line. A citizen handing over an Aadhaar photo to a QR code on a desk
           * is entitled to know where it goes, and saying so on the card is cheaper than saying
           * it twenty times a day at the counter.
           */}
          <footer className="border-t border-slate-200 pt-3 text-center">
            <p className="text-[10px] leading-snug text-slate-500">
              {t('documentDrop.standee.footer')}
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}
