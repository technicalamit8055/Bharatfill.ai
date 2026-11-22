import type { Metadata } from 'next';
import { findPreset } from '@assistigo/document-tools';
import { PhotoSignatureEditor } from '@/components/document-tools/photo-signature-editor';
import { PublicToolDetails } from '@/components/document-tools/public-tool-details';
import { GuestToolAccess } from '@/components/document-tools/tool-access';
import { PhotoSignatureHeader } from '@/components/document-tools/tool-headers';
import {
  PUBLIC_TOOLS_HREF,
  publicTool,
  publicToolCopyKey,
} from '@/lib/document-tools/public-tools';
import { publicToolMetadata, visitorLooksSignedIn } from '@/lib/document-tools/public-tools.server';
import { getTranslations } from '@/lib/i18n/server';

const TOOL = 'photoSignature';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return publicToolMetadata(t, TOOL);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Free Photo & Signature Studio. The dashboard editor with no customers to save to — the output
 * panel shows the sign-up prompt in that box instead (`GuestToolAccess`). `?preset=` works as
 * in the dashboard, so a link can open straight on one portal's photo or signature rule.
 */
export default async function PublicPhotoSignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const { t, locale } = await getTranslations();
  const signedIn = await visitorLooksSignedIn();
  const { preset } = await searchParams;
  const resolvedPreset = preset ? findPreset(preset) : null;

  return (
    <GuestToolAccess signedIn={signedIn} appHref={publicTool(TOOL).appHref}>
      <PhotoSignatureEditor
        header={
          <PhotoSignatureHeader
            t={t}
            backHref={PUBLIC_TOOLS_HREF}
            backLabel={t('publicTools.back')}
            title={t(publicToolCopyKey(TOOL, 'heading'))}
            description={t(publicToolCopyKey(TOOL, 'description'))}
          />
        }
        customers={[]}
        defaultCustomerId={null}
        defaultPresetCode={preset ?? null}
        defaultMode={resolvedPreset?.category === 'signature' ? 'signature' : 'photo'}
        sourceDocumentId={null}
        today={todayIso()}
      />
      <PublicToolDetails t={t} locale={locale} toolId={TOOL} signedIn={signedIn} />
    </GuestToolAccess>
  );
}
