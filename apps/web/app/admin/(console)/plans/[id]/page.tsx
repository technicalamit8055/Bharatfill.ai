import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { planInputFromRow } from '@/lib/admin/plan-write';
import { loadAdminPlan } from '@/lib/admin/plans';
import { getTranslations } from '@/lib/i18n/server';
import { AdminPageHeader } from '../../ui';
import { PlanForm } from '../plan-form';

export const metadata = { title: 'Plan' };

export default async function AdminPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformPagePermission('platform.plans.view');
  const { t } = await getTranslations();
  const { id } = await params;

  if (!z.string().uuid().safeParse(id).success) notFound();
  const listing = await loadAdminPlan(session.supabase, id);
  if (!listing) notFound();

  return (
    <>
      <AdminPageHeader
        title={listing.row.name}
        description={t('admin.plans.editSubtitle')}
        actions={
          <Link
            href="/admin/plans"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            {t('admin.plans.backToPlans')}
          </Link>
        }
      />
      <PlanForm
        planId={listing.row.id}
        initial={planInputFromRow(listing.row)}
        organizations={listing.organizations}
        readOnly={!session.permissions.has('platform.plans.manage')}
      />
    </>
  );
}
