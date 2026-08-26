'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card } from '@assistigo/ui';
import type { PlanCode, PlanDefinition } from '@assistigo/core';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { localised } from '@/lib/i18n';

const PLAN_ORDER: PlanCode[] = ['free', 'starter', 'professional', 'business'];

export function PlanComparison({
  plans,
  activePlanCode,
  canManage,
}: {
  plans: PlanDefinition[];
  activePlanCode: string;
  canManage: boolean;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<PlanCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = PLAN_ORDER.map((code) => plans.find((plan) => plan.code === code)).filter(
    (plan): plan is PlanDefinition => Boolean(plan),
  );
  const activeIndex = PLAN_ORDER.indexOf(activePlanCode as PlanCode);

  async function changePlan(planCode: PlanCode) {
    setPendingPlan(planCode);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const json = (await response.json()) as
        | { data: { mode: 'instant' | 'redirect'; checkoutUrl?: string } }
        | { error: { messageKey: string } };
      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        setPendingPlan(null);
        return;
      }
      if (json.data.mode === 'redirect' && json.data.checkoutUrl) {
        window.location.href = json.data.checkoutUrl;
        return;
      }
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPendingPlan(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}
      <p className="text-xs text-slate-400">{t('billing.upgradeModal.mockNote')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ordered.map((plan, index) => {
          const isCurrent = plan.code === activePlanCode;
          const isUpgrade = index > activeIndex;
          return (
            <Card key={plan.code} className={isCurrent ? 'ring-2 ring-brand-500' : undefined}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {localised(plan.name, locale)}
                </h3>
                {isCurrent ? <Badge tone="success">{t('billing.plans.currentPlan')}</Badge> : null}
              </div>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                ₹{plan.priceMonthlyInr}
                <span className="text-sm font-normal text-slate-500">{t('billing.plans.monthly')}</span>
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                <li>
                  {plan.includedFills === null
                    ? t('billing.unlimited')
                    : t('billing.plans.fillsIncluded', { count: plan.includedFills })}
                </li>
                <li>
                  {plan.includedAiExtractions === null
                    ? t('billing.unlimited')
                    : t('billing.plans.aiExtractionsIncluded', { count: plan.includedAiExtractions })}
                </li>
                <li>{t('billing.plans.seatsIncluded', { count: plan.includedSeats })}</li>
                <li>
                  {plan.maxCustomers === null
                    ? t('billing.unlimited')
                    : t('billing.plans.customersIncluded', { count: plan.maxCustomers })}
                </li>
                <li>{t('billing.plans.storageIncluded', { amount: `${plan.storageMb} MB` })}</li>
                <li>{plan.features.adapterLibrary ? `✓ ${t('billing.plans.featureAdapterLibrary')}` : null}</li>
                <li>
                  {plan.features.advancedDocumentTools
                    ? `✓ ${t('billing.plans.featureAdvancedDocumentTools')}`
                    : null}
                </li>
                <li>{plan.features.bulkImport ? `✓ ${t('billing.plans.featureBulkImport')}` : null}</li>
                <li>
                  {t('billing.plans.featureSupport')}: {t(`billing.plans.support.${plan.features.support}`)}
                </li>
              </ul>
              {canManage ? (
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={isCurrent ? 'secondary' : 'primary'}
                  disabled={isCurrent}
                  loading={pendingPlan === plan.code}
                  onClick={() => void changePlan(plan.code)}
                >
                  {isCurrent
                    ? t('billing.plans.currentPlan')
                    : isUpgrade
                      ? t('billing.plans.upgradePlan')
                      : t('billing.plans.downgradePlan')}
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
