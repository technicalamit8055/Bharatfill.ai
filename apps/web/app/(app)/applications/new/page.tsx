import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Lightbulb } from 'lucide-react';
import { maskLast4 } from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAdapterCatalog } from '@/lib/forms/adapters';
import type { CustomerRow } from '@/lib/supabase/database.types';
import { NewApplicationForm } from './new-application-form';

export const metadata = { title: 'New application' };

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('application.create');
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;

  const customerId = typeof params.customerId === 'string' ? params.customerId : undefined;
  const portalAdapterId =
    typeof params.portalAdapterId === 'string' ? params.portalAdapterId : undefined;
  const portalName = typeof params.portalName === 'string' ? params.portalName : undefined;
  const formName = typeof params.formName === 'string' ? params.formName : undefined;

  const [catalog, preselectedCustomer] = await Promise.all([
    loadAdapterCatalog(supabase, session.organization.id),
    customerId
      ? supabase
          .from('customers')
          .select('id, full_name, mobile')
          .eq('id', customerId)
          .eq('organization_id', session.organization.id)
          .is('deleted_at', null)
          .maybeSingle()
          .then((result) => {
            const row = result.data as Pick<CustomerRow, 'id' | 'full_name' | 'mobile'> | null;
            return row
              ? { id: row.id, full_name: row.full_name, mobile_last4: maskLast4(row.mobile) }
              : null;
          })
      : Promise.resolve(null),
  ]);

  const adapters = catalog
    .filter((adapter) => adapter.persisted && adapter.status !== 'deprecated')
    .map((adapter) => ({
      id: adapter.id,
      portalName: adapter.portalName,
      formName: adapter.formName,
    }));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-50 via-[#f3f8ff] to-sky-50/70 px-5 py-5 sm:px-6">
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,20rem)]">
          <div className="min-w-0">
            <Link
              href="/applications"
              className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-900"
            >
              <ArrowLeft size={16} strokeWidth={1.8} aria-hidden />
              {t('applications.newPage.back')}
            </Link>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
              {t('applications.new')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 sm:text-base">
              {t('applications.newPage.subtitle')}
            </p>
          </div>

          {/*
           * The form / ID card / tricolour artwork, between the title and the tips. Decorative,
           * and hidden below `lg`, where the three columns would crush it.
           *
           * The source is a 1376×768 canvas with the artwork in its middle and wide white margins,
           * so it is scaled up inside a clipped box to trim those margins, and multiplied onto the
           * banner so the white that remains takes on the banner's tint instead of reading as a
           * pasted-on rectangle.
           */}
          <div
            aria-hidden
            className="pointer-events-none relative hidden h-36 w-72 select-none overflow-hidden lg:block"
          >
            <Image
              src="/applications/application-hero-docs.png"
              alt=""
              fill
              priority
              sizes="288px"
              className="scale-[1.35] object-cover mix-blend-multiply"
            />
          </div>

          <aside className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-1 ring-amber-100">
              <Lightbulb size={22} strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {t('applications.newPage.tipsTitle')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {t('applications.newPage.tipsBody')}
              </p>
            </div>
          </aside>
        </div>
      </section>

      <NewApplicationForm
        adapters={adapters}
        preselectedCustomer={preselectedCustomer}
        defaultPortalAdapterId={portalAdapterId}
        defaultPortalName={portalName}
        defaultFormName={formName}
        canCreateCustomer={session.permissions.has('customer.create')}
        canBrowseTemplates={session.permissions.has('fill.run')}
      />
    </div>
  );
}
