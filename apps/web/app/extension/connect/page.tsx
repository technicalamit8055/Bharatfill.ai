import { Alert } from '@assistigo/ui';
import { requireSession } from '@/lib/auth/session';
import { resolveExtensionId } from '@/lib/extension/pairing';
import { BharatfillLogo } from '@/components/landing/bharatfill-logo';
import { ConnectExtension } from './connect-extension';

export const metadata = { title: 'Connect the Bharatfill extension' };

/**
 * Pairs the Chrome extension with the signed-in account (docs/EXTENSION.md §3).
 *
 * The extension opens this page and names itself in `?ext=`. That parameter is attacker-
 * controllable, so it is checked against EXTENSION_ALLOWED_IDS here, on the server, before any
 * code can be minted — otherwise a crafted link would hand an operator's pairing code to
 * someone else's extension.
 *
 * Middleware already sends signed-out visitors to /sign-in?next=…, and requireSession() is the
 * second gate.
 */
export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ ext?: string }>;
}) {
  const session = await requireSession();
  const { ext } = await searchParams;
  const extensionId = resolveExtensionId(ext);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <BharatfillLogo height={44} />

      {extensionId ? (
        <ConnectExtension
          extensionId={extensionId}
          organizationName={session.organization.name}
          email={session.email}
        />
      ) : (
        <Alert tone="danger" title="This link did not come from the Bharatfill extension">
          Open the Bharatfill extension from your browser toolbar and choose{' '}
          <strong>Connect account</strong>. That is the only way to start pairing, and it stops a
          shared link from connecting someone else&rsquo;s extension to your account.
        </Alert>
      )}
    </main>
  );
}
