'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CircleCheck,
  Crown,
  Layers,
  Send,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Button } from '@assistigo/ui';
import type { PlanCode, PlanDefinition } from '@assistigo/core';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { localised } from '@/lib/i18n';
import { planAction } from '@/lib/billing/view';
import { SectionHeader } from './section-header';

type PlanIcon = { icon: LucideIcon; tone: string };

const PLAN_ICONS: Record<PlanCode, PlanIcon> = {
  free: { icon: Send, tone: 'bg-brand-50 text-brand-600 [&_svg]:fill-brand-600' },
  starter: { icon: Crown, tone: 'bg-brand-50 text-brand-600 [&_svg]:fill-brand-600' },
  professional: { icon: Zap, tone: 'bg-violet-50 text-violet-600 [&_svg]:fill-violet-600' },
  business: { icon: Building2, tone: 'bg-brand-50 text-brand-600' },
};

/** Plans created in the admin panel have no artwork of their own. */
const CUSTOM_PLAN_ICON: PlanIcon = { icon: Layers, tone: 'bg-emerald-50 text-emerald-600' };

const iconFor = (code: string): PlanIcon =>
  (PLAN_ICONS as Record<string, PlanIcon | undefined>)[code] ?? CUSTOM_PLAN_ICON;

export function PlanComparison({
  plans,
  activePlanCode,
  canManage,
}: {
  /** The active catalogue, already in display order. */
  plans: PlanDefinition[];
  activePlanCode: string;
  canManage: boolean;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedCodes = plans.map((plan) => plan.code);

  async function changePlan(planCode: string) {
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
    <div className="space-y-5">
      <SectionHeader
        icon={<Crown className="h-5 w-5 fill-brand-600" aria-hidden />}
        title={t('billing.plans.title')}
        subtitle={t('billing.plans.subtitle')}
        action={
          /*
           * Only monthly prices exist in the plan catalogue (spec §22.1) and checkout takes a
           * plan code alone, so Yearly is shown but not selectable until an annual price is
           * actually defined — the page must never quote a price checkout cannot charge.
           */
          <div
            role="group"
            aria-label={t('billing.plans.billingCycle')}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
          >
            <button
              type="button"
              aria-pressed="true"
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white"
            >
              {t('billing.plans.cycleMonthly')}
            </button>
            <button
              type="button"
              aria-pressed="false"
              disabled
              title={t('billing.plans.yearlyComingSoon')}
              className="cursor-not-allowed rounded-lg px-4 py-1.5 text-sm font-medium text-slate-400"
            >
              {t('billing.plans.cycleYearly')}
              <span className="sr-only"> — {t('billing.plans.yearlyComingSoon')}</span>
            </button>
          </div>
        }
      />

      {error ? <Alert tone="danger">{t(error)}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const action = planAction(plan.code, activePlanCode, orderedCodes);
          const isCurrent = action === 'current';
          const { icon: Icon, tone } = iconFor(plan.code);
          const features = [
            plan.includedFills === null
              ? t('billing.plans.unlimitedFills')
              : t('billing.plans.fillsIncluded', { count: plan.includedFills }),
            plan.includedAiExtractions === null
              ? t('billing.plans.unlimitedAiExtractions')
              : t('billing.plans.aiExtractionsIncluded', { count: plan.includedAiExtractions }),
            t('billing.plans.seatsIncluded', { count: plan.includedSeats }),
            plan.maxCustomers === null
              ? t('billing.plans.unlimitedCustomers')
              : t('billing.plans.customersIncluded', { count: plan.maxCustomers }),
            t('billing.plans.storageIncluded', { amount: `${plan.storageMb} MB` }),
            plan.features.adapterLibrary ? t('billing.plans.featureAdapterLibrary') : null,
            plan.features.advancedDocumentTools
              ? t('billing.plans.featureAdvancedDocumentTools')
              : null,
            plan.features.bulkImport ? t('billing.plans.featureBulkImport') : null,
            `${t('billing.plans.featureSupport')}: ${t(`billing.plans.support.${plan.features.support}`)}`,
          ].filter((feature): feature is string => feature !== null);

          return (
            <article
              key={plan.code}
              aria-current={isCurrent ? 'true' : undefined}
              className={`relative flex flex-col rounded-2xl p-5 ${
                isCurrent
                  ? 'border-2 border-brand-500 bg-brand-50/30 shadow-sm'
                  : 'border border-slate-200 bg-white'
              }`}
            >
              {isCurrent ? (
                <span className="absolute right-3 top-3 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {t('billing.plans.currentPlan')}
                </span>
              ) : null}

              <div className="flex items-center gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {localised(plan.name, locale)}
                  </h3>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">
                    ₹{plan.priceMonthlyInr}
                    <span className="ml-1 text-sm font-normal text-slate-500">
                      {t('billing.plans.monthly')}
                    </span>
                  </p>
                </div>
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CircleCheck
                      className="mt-0.5 h-4 w-4 shrink-0 fill-emerald-500 text-white"
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              {canManage ? (
                <Button
                  className={`mt-6 h-11 w-full rounded-lg ${
                    isCurrent ? 'bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-100' : ''
                  }`}
                  variant={action === 'upgrade' ? 'primary' : 'secondary'}
                  disabled={isCurrent}
                  loading={pendingPlan === plan.code}
                  onClick={() => void changePlan(plan.code)}
                >
                  {action === 'upgrade' ? <ArrowUpFromLine className="h-4 w-4" aria-hidden /> : null}
                  {action === 'downgrade' ? <ArrowDownToLine className="h-4 w-4" aria-hidden /> : null}
                  {isCurrent
                    ? t('billing.plans.currentPlan')
                    : action === 'upgrade'
                      ? t('billing.plans.upgradePlan')
                      : t('billing.plans.downgradePlan')}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">{t('billing.upgradeModal.mockNote')}</p>
    </div>
  );
}
