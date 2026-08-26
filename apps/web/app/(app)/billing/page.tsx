import { ALL_PLANS, buildUsageSummary } from '@assistigo/core';
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { localised, type Translator } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEntitlementContext } from '@/lib/billing/entitlements';
import type { SubscriptionRow } from '@/lib/supabase/database.types';
import { PlanComparison } from './plan-comparison';

export const metadata = { title: 'Billing' };

const SUBSCRIPTION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  cancelled: 'neutral',
  incomplete: 'danger',
};

function usageLabel(used: number, included: number | null, t: Translator) {
  if (included === null) return `${used} — ${t('billing.unlimited')}`;
  return `${used} / ${included}`;
}

export default async function BillingPage() {
  const session = await requirePagePermission('billing.view');
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const [entitlements, { data: subscription }] = await Promise.all([
    loadEntitlementContext({ supabase, organization: session.organization }),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', session.organization.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const usage = buildUsageSummary(entitlements);
  const activeSubscription = subscription as SubscriptionRow | null;
  const canManage = session.permissions.has('billing.manage');

  const USAGE_LABEL_KEYS: Record<string, string> = {
    fill: 'billing.fills',
    ai_extraction: 'billing.aiExtractions',
    seat: 'billing.seats',
    customers: 'billing.customers',
    storage_mb: 'billing.storage',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('billing.title')}</h1>
      </div>

      <Card title={t('billing.currentPlan')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl font-semibold text-slate-900">
            {localised(usage.planName, locale)}
          </span>
          {activeSubscription ? (
            <Badge tone={SUBSCRIPTION_TONE[activeSubscription.status] ?? 'neutral'}>
              {t(`billing.status.${activeSubscription.status}`)}
            </Badge>
          ) : null}
        </div>
        {activeSubscription?.current_period_end ? (
          <p className="mt-1 text-sm text-slate-500">
            {t('billing.renewsOn', {
              date: activeSubscription.current_period_end.slice(0, 10),
            })}
            {activeSubscription.cancel_at_period_end ? ` · ${t('billing.cancelledAtPeriodEnd')}` : ''}
          </p>
        ) : null}
      </Card>

      <Card title={t('billing.usage')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {usage.items.map((item) => {
            const pct = item.ratio === null ? 0 : Math.min(100, Math.round(item.ratio * 100));
            return (
              <div key={item.key}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t(USAGE_LABEL_KEYS[item.key] ?? item.key)}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {usageLabel(item.used, item.included, t)}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={
                      'h-full rounded-full ' + (pct >= 90 ? 'bg-amber-500' : 'bg-brand-600')
                    }
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t('billing.plans.title')}>
        <PlanComparison plans={ALL_PLANS} activePlanCode={usage.planCode} canManage={canManage} />
      </Card>

      <Card title={t('billing.invoices.title')}>
        {!activeSubscription ? (
          <EmptyState title={t('billing.invoices.empty')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('billing.invoices.period')}</TH>
                <TH>{t('billing.invoices.plan')}</TH>
                <TH>{t('billing.invoices.status')}</TH>
                <TH>{t('billing.invoices.amount')}</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD className="text-slate-600">
                  {activeSubscription.current_period_start?.slice(0, 10) ?? '—'} –{' '}
                  {activeSubscription.current_period_end?.slice(0, 10) ?? '—'}
                </TD>
                <TD>{localised(usage.planName, locale)}</TD>
                <TD>
                  <Badge tone={SUBSCRIPTION_TONE[activeSubscription.status] ?? 'neutral'}>
                    {t(`billing.status.${activeSubscription.status}`)}
                  </Badge>
                </TD>
                <TD className="text-slate-400">{t('billing.invoices.download')}</TD>
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      <Card title={t('billing.indiaNote.title')}>
        <p className="text-sm text-slate-600">{t('billing.indiaNote.body')}</p>
      </Card>
    </div>
  );
}
