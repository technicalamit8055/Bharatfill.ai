import Image from 'next/image';
import { redirect } from 'next/navigation';
import { CirclePause } from 'lucide-react';
import { getCurrentUser, getMemberships } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { signOutAction } from '../(auth)/actions';

export const metadata = { title: 'Account paused', robots: { index: false, follow: false } };

/**
 * Where a member of a suspended centre lands (lib/auth/session.ts sends them here).
 *
 * Says what happened and who to contact — and nothing about why: the suspension reason is an
 * internal note written by platform staff, not a message to the centre. Nothing here reads the
 * centre's data, and it cannot become a way back into the dashboard: a centre that is no longer
 * suspended is sent straight on.
 */
export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const memberships = await getMemberships();
  const organization = memberships[0]?.organizations;
  if (!organization) redirect('/onboarding');
  if (!organization.suspended_at) redirect('/dashboard');

  const { t } = await getTranslations();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_18px_50px_-20px_rgba(15,23,42,0.25)]">
        <Image
          src="/Bharatfill-logo.png"
          alt={t('app.name')}
          width={480}
          height={160}
          className="mx-auto h-12 w-auto object-contain"
        />
        <span className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
          <CirclePause className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="font-heading mt-5 text-2xl font-extrabold tracking-tight text-slate-900">
          {t('suspended.title')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {t('suspended.body', { name: organization.name })}
        </p>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          {t('suspended.dataSafe')}
        </p>
        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            {t('common.signOut')}
          </button>
        </form>
      </div>
    </div>
  );
}
