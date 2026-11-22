import type { Metadata } from 'next';
import { PdfStudioEditor } from '@/components/document-tools/pdf-studio-editor';
import { PublicToolDetails } from '@/components/document-tools/public-tool-details';
import { GuestToolAccess } from '@/components/document-tools/tool-access';
import { PdfStudioHeader } from '@/components/document-tools/tool-headers';
import { PDF_BUNDLE_HREF } from '@/lib/document-tools/pdf-bundle';
import {
  PUBLIC_TOOLS_HREF,
  accountFeatureHref,
  publicTool,
  publicToolCopyKey,
} from '@/lib/document-tools/public-tools';
import { publicToolMetadata, visitorLooksSignedIn } from '@/lib/document-tools/public-tools.server';
import { getTranslations } from '@/lib/i18n/server';

const TOOL = 'pdfStudio';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return publicToolMetadata(t, TOOL);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Free PDF Studio. The PDF bundle button stays, marked as needing an account: the bundle reads a
 * customer's stored documents, so it goes through sign-in and opens in the dashboard.
 */
export default async function PublicPdfStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const { t, locale } = await getTranslations();
  const signedIn = await visitorLooksSignedIn();
  const { preset } = await searchParams;

  return (
    <GuestToolAccess signedIn={signedIn} appHref={publicTool(TOOL).appHref}>
      <PdfStudioEditor
        header={
          <PdfStudioHeader
            t={t}
            backHref={PUBLIC_TOOLS_HREF}
            backLabel={t('publicTools.back')}
            title={t(publicToolCopyKey(TOOL, 'heading'))}
            description={t(publicToolCopyKey(TOOL, 'description'))}
            bundleHref={accountFeatureHref(PDF_BUNDLE_HREF, signedIn)}
            bundleLocked={!signedIn}
          />
        }
        customers={[]}
        defaultCustomerId={null}
        defaultPresetCode={preset ?? null}
        today={todayIso()}
      />
      <PublicToolDetails t={t} locale={locale} toolId={TOOL} signedIn={signedIn} />
    </GuestToolAccess>
  );
}
