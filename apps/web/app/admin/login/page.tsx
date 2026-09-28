import { redirect } from 'next/navigation';
import { ConsoleAuthFrame } from '@/components/admin/console-auth-frame';
import { ConsoleLoginForm } from '@/components/admin/console-login-form';
import { parseLoginParams } from '@/lib/admin/console-login';
import { getConsoleLoginState } from '@/lib/admin/session';

export const metadata = { title: 'Super Admin sign-in' };

/**
 * The Super Admin portal. Accepts `super_admin` and nobody else — team roles are pointed to
 * /staff/login, and a non-staff account is told it has no access and signed back out.
 */
export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next, reason } = parseLoginParams(await searchParams);
  const state = await getConsoleLoginState('super_admin');
  if (state.alreadyInConsole) redirect(next);

  return (
    <ConsoleAuthFrame portal="super_admin">
      <ConsoleLoginForm
        portal="super_admin"
        signedInEmail={state.signedInEmail}
        next={next}
        reason={reason}
      />
    </ConsoleAuthFrame>
  );
}
