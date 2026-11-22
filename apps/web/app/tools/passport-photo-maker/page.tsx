import type { Metadata } from 'next';
import { PassportGridEditor } from '@/components/document-tools/passport-grid-editor';
import { PublicToolDetails } from '@/components/document-tools/public-tool-details';
import { GuestToolAccess } from '@/components/document-tools/tool-access';
import { PassportGridHeader } from '@/components/document-tools/tool-headers';
import {
  PUBLIC_TOOLS_HREF,
  publicTool,
  publicToolCopyKey,
} from '@/lib/document-tools/public-tools';
import { publicToolMetadata, visitorLooksSignedIn } from '@/lib/document-tools/public-tools.server';
import { getTranslations } from '@/lib/i18n/server';

const TOOL = 'passportGrid';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return publicToolMetadata(t, TOOL);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Free Passport Photo Grid — the dashboard editor without the save-to-customer box. */
export default async function PublicPassportGridPage() {
  const { t, locale } = await getTranslations();
  const signedIn = await visitorLooksSignedIn();

  return (
    <GuestToolAccess signedIn={signedIn} appHref={publicTool(TOOL).appHref}>
      <PassportGridEditor
        header={
          <PassportGridHeader
            t={t}
            backHref={PUBLIC_TOOLS_HREF}
            backLabel={t('publicTools.back')}
            title={t(publicToolCopyKey(TOOL, 'heading'))}
            description={t(publicToolCopyKey(TOOL, 'description'))}
          />
        }
        customers={[]}
        defaultCustomerId={null}
        today={todayIso()}
      />
      <PublicToolDetails t={t} locale={locale} toolId={TOOL} signedIn={signedIn} />
    </GuestToolAccess>
  );
}
