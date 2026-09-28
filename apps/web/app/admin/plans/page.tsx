import Link from 'next/link';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadAdminPlans } from '@/lib/admin/plans';
import { planFromRow } from '@/lib/billing/plan-row';
import { getTranslations } from '@/lib/i18n/server';
import type { Translator } from '@/lib/i18n';
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminPageHeader,
  AdminTable,
  TD,
  TH,
} from '../ui';

export const metadata = { title: 'Plans' };

const formatLimit = (value: number | null, t: Translator) =>
  value === null ? t('billing.unlimited') : value.toLocaleString('en-IN');

/**
 * The plan catalogue (spec §22), retired plans included.
 *
 * Every platform role can read it; only super admins can change it. The organization counts are
 * aggregates — no organization is named on this page.
 */
export default async function AdminPlansPage() {
  const session = await requirePlatformPagePermission('platform.plans.view');
  const { t } = await getTranslations();
  const listings = await loadAdminPlans(session.supabase);
  const canManage = session.permissions.has('platform.plans.manage');

  return (
    <>
      <AdminPageHeader
        title={t('admin.plans.title')}
        description={t('admin.plans.subtitle')}
        actions={
          canManage ? (
            <Link
              href="/admin/plans/new"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              {t('admin.plans.new')}
            </Link>
          ) : null
        }
      />

      <AdminNote>{t('admin.plans.rulesNote')}</AdminNote>

      <AdminCard>
        <AdminTable
          head={
            <tr>
              <TH>{t('admin.plans.plan')}</TH>
              <TH className="text-right">{t('admin.plans.priceMonthly')}</TH>
              <TH className="text-right">{t('billing.fills')}</TH>
              <TH className="text-right">{t('billing.aiExtractions')}</TH>
              <TH className="text-right">{t('billing.seats')}</TH>
              <TH className="text-right">{t('billing.customers')}</TH>
              <TH className="text-right">{t('billing.storageMb')}</TH>
              <TH className="text-right">{t('admin.plans.organizations')}</TH>
              <TH>{t('admin.plans.status')}</TH>
              <TH />
            </tr>
          }
          empty={listings.length === 0 ? <AdminEmpty title={t('admin.plans.empty')} /> : null}
        >
          {listings.map(({ row, organizations }) => {
            const plan = planFromRow(row);
            return (
              <tr key={row.id} className={row.active ? undefined : 'opacity-60'}>
                <TD>
                  <div className="font-medium text-slate-100">{row.name}</div>
                  <div className="font-mono text-xs text-slate-500">{row.code}</div>
                </TD>
                <TD className="text-right tabular-nums">₹{plan.priceMonthlyInr.toLocaleString('en-IN')}</TD>
                <TD className="text-right tabular-nums">{formatLimit(plan.includedFills, t)}</TD>
                <TD className="text-right tabular-nums">{formatLimit(plan.includedAiExtractions, t)}</TD>
                <TD className="text-right tabular-nums">{plan.includedSeats}</TD>
                <TD className="text-right tabular-nums">{formatLimit(plan.maxCustomers, t)}</TD>
                <TD className="text-right tabular-nums">{plan.storageMb.toLocaleString('en-IN')}</TD>
                <TD className="text-right tabular-nums">{organizations.toLocaleString('en-IN')}</TD>
                <TD>
                  <AdminBadge tone={row.active ? 'success' : 'neutral'}>
                    {row.active ? t('admin.plans.active') : t('admin.plans.retired')}
                  </AdminBadge>
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/admin/plans/${row.id}`}
                    className="text-sm font-medium text-sky-400 hover:text-sky-300"
                  >
                    {canManage ? t('admin.plans.edit') : t('admin.plans.view')}
                  </Link>
                </TD>
              </tr>
            );
          })}
        </AdminTable>
      </AdminCard>
    </>
  );
}
