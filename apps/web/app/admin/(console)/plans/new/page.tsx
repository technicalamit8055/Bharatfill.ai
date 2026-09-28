import Link from 'next/link';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { emptyPlanInput } from '@/lib/admin/plan-write';
import { getTranslations } from '@/lib/i18n/server';
import { AdminPageHeader } from '../../ui';
import { PlanForm } from '../plan-form';

export const metadata = { title: 'New plan' };

export default async function NewPlanPage() {
  const session = await requirePlatformPagePermission('platform.plans.manage');
  const { t } = await getTranslations();

  // Suggest a place at the end of the catalogue; the admin can move it.
  const { data: last, error } = await session.supabase
    .from('plans')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const nextSortOrder = last ? (last as { sort_order: number }).sort_order + 1 : 0;

  return (
    <>
      <AdminPageHeader
        title={t('admin.plans.newTitle')}
        description={t('admin.plans.newSubtitle')}
        actions={
          <Link
            href="/admin/plans"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            {t('common.cancel')}
          </Link>
        }
      />
      <PlanForm initial={emptyPlanInput(nextSortOrder)} organizations={0} />
    </>
  );
}
