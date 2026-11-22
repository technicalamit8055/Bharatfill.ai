import type { Metadata } from 'next';
import { PublicToolDetails } from '@/components/document-tools/public-tool-details';
import { PvcCardEditor } from '@/components/document-tools/pvc-card-editor';
import { GuestToolAccess } from '@/components/document-tools/tool-access';
import { PvcCardHeader } from '@/components/document-tools/tool-headers';
import {
  PUBLIC_TOOLS_HREF,
  publicTool,
  publicToolCopyKey,
} from '@/lib/document-tools/public-tools';
import { publicToolMetadata, visitorLooksSignedIn } from '@/lib/document-tools/public-tools.server';
import { getTranslations } from '@/lib/i18n/server';

const TOOL = 'pvcCard';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return publicToolMetadata(t, TOOL);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Free PVC Card & Aadhaar Mask. The editor's own privacy gate still applies here: an Aadhaar-class
 * card cannot be downloaded or printed until a meaningful mask covers the number band.
 */
export default async function PublicPvcCardPage() {
  const { t, locale } = await getTranslations();
  const signedIn = await visitorLooksSignedIn();

  return (
    <GuestToolAccess signedIn={signedIn} appHref={publicTool(TOOL).appHref}>
      <div className="space-y-4">
        <PvcCardHeader
          t={t}
          backHref={PUBLIC_TOOLS_HREF}
          backLabel={t('publicTools.back')}
          title={t(publicToolCopyKey(TOOL, 'heading'))}
          description={t(publicToolCopyKey(TOOL, 'description'))}
        />
        <PvcCardEditor customers={[]} defaultCustomerId={null} today={todayIso()} />
      </div>
      <PublicToolDetails t={t} locale={locale} toolId={TOOL} signedIn={signedIn} />
    </GuestToolAccess>
  );
}
