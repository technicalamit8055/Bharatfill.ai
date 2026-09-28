import { redirect } from 'next/navigation';
import { ConsoleAuthFrame } from '@/components/admin/console-auth-frame';
import { ConsoleLoginForm } from '@/components/admin/console-login-form';
import { parseLoginParams } from '@/lib/admin/console-login';
import { getConsoleLoginState } from '@/lib/admin/session';

export const metadata = { title: 'Team sign-in' };

/**
 * The team portal, for the platform's working members: Support Admin, Content Manager and
 * Scraper Operator. It opens the same console as /admin/login, limited to what the role may do.
 * A Super Admin is sent to their own portal rather than let in here.
 */
export default async function TeamLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next, reason } = parseLoginParams(await searchParams);
  const state = await getConsoleLoginState('team');
  if (state.alreadyInConsole) redirect(next);

  return (
    <ConsoleAuthFrame portal="team">
      <ConsoleLoginForm
        portal="team"
        signedInEmail={state.signedInEmail}
        next={next}
        reason={reason}
      />
    </ConsoleAuthFrame>
  );
}
