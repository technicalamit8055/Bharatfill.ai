import { buildWhatsAppDropLink, normalizeDropCode } from '@assistigo/core';
import { resolveDropTarget } from '@/lib/document-drop/service';
import { isWhatsappConfigured, whatsappBotNumber } from '@/lib/document-drop/whatsapp';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getTranslations } from '@/lib/i18n/server';
import { DropUploader } from './drop-uploader';

/**
 * The citizen-facing mobile drop page — `/drop/:code` (§9.1).
 *
 * The zero-install fallback. Scanning the counter QR with a plain camera app or Google Lens
 * lands here, which is what makes the feature work for the citizen who has no WhatsApp, whose
 * WhatsApp is signed out, or who simply would rather not message a business.
 *
 * Public by routing (see `PUBLIC_PATHS` in middleware.ts) and deliberately austere: it renders
 * the centre's name so the citizen can confirm they are sending to the right counter, and an
 * upload control. There is no list of what has been sent by anyone, no preview, and no path from
 * this page to any record — a code in the wrong hands can add a file and nothing else.
 *
 * It resolves the code without creating anything (`resolveDropTarget`). Minting on render would
 * put an empty row in the operator's queue every time somebody reloaded, and — worse — orphan
 * the session already holding the files they had sent. The session is created by the first
 * upload instead.
 *
 * `noindex`: a live drop code has no business in a search index.
 */
export const metadata = {
  title: 'Send your documents',
  robots: { index: false, follow: false },
};

export default async function DropPage({ params }: { params: Promise<{ code: string }> }) {
  const { t } = await getTranslations();
  const code = normalizeDropCode(decodeURIComponent((await params).code));

  // Service role, because there is no user here whose RLS could apply — and the only thing read
  // is the centre's own name.
  const target = code ? await resolveDropTarget(createSupabaseAdminClient(), code) : null;

  if (!code || !target) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl"
        >
          ⏱
        </div>
        <h1 className="text-lg font-semibold text-slate-900">
          {t('documentDrop.public.expiredTitle')}
        </h1>
        <p className="text-sm text-slate-600">{t('documentDrop.public.expiredHint')}</p>
      </main>
    );
  }

  const centreName =
    target.kind === 'session' ? target.session.organizationName : target.organization.name;

  const [botNumber, whatsappConfigured] = await Promise.all([
    whatsappBotNumber(),
    isWhatsappConfigured(),
  ]);
  /*
   * The WhatsApp hand-off is offered first when the centre has it configured. A citizen who
   * already has the app open and their documents in a chat finds that faster than a file picker,
   * and the bot path acknowledges each file back to them.
   *
   * Built from the code as scanned, not from a session code — the bot resolves it the same way
   * this page did, and minting one here just to build a link would defeat the point above.
   */
  const whatsappLink = whatsappConfigured && botNumber ? buildWhatsAppDropLink(botNumber, code) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <h1 className="text-xl font-bold text-slate-900">{t('documentDrop.public.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('documentDrop.public.centreLine', { centre: centreName })}
        </p>
        <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 font-mono text-xs tracking-widest text-slate-600">
          {code}
        </p>
      </header>

      <DropUploader code={code} whatsappLink={whatsappLink} />

      <p className="mt-auto text-center text-xs text-slate-400">
        {t('documentDrop.public.privacy')}
      </p>
    </main>
  );
}
