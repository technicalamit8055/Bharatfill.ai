'use client';

import Link from 'next/link';
import { Badge, Card } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { useExtensionInstalled } from './use-extension-installed';

/** First-run checklist (spec §7.2.4, §9.1). */

function ChecklistRow({ done, label, href }: { done: boolean; label: string; href: string }) {
  const t = useTranslations();
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className={done ? 'text-sm text-slate-500 line-through' : 'text-sm text-slate-800'}>
        {label}
      </span>
      {done ? (
        <Badge tone="success">{t('onboarding.checklist.done')}</Badge>
      ) : (
        <Link href={href} className="text-sm text-brand-700 hover:underline">
          {t('common.next')}
        </Link>
      )}
    </li>
  );
}

export function OnboardingChecklist({
  hasCustomers,
  hasDocuments,
}: {
  hasCustomers: boolean;
  hasDocuments: boolean;
}) {
  const t = useTranslations();
  const extensionInstalled = useExtensionInstalled();

  const steps = [hasCustomers, hasDocuments, extensionInstalled, false];
  const doneCount = steps.filter(Boolean).length;
  const allDone = hasCustomers && hasDocuments && extensionInstalled;
  if (allDone) return null;

  return (
    <Card
      title={t('onboarding.checklist.title')}
      actions={
        <span className="text-xs font-medium text-slate-500">
          {t('onboarding.checklist.progress', { done: doneCount, total: steps.length })}
        </span>
      }
    >
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ul className="divide-y divide-slate-100">
        <ChecklistRow
          done={hasCustomers}
          label={t('onboarding.checklist.addCustomer')}
          href="/customers/new"
        />
        <ChecklistRow
          done={hasDocuments}
          label={t('onboarding.checklist.uploadDocument')}
          href="/documents"
        />
        <ChecklistRow
          done={extensionInstalled}
          label={t('onboarding.checklist.installExtension')}
          href="/settings/extension"
        />
        <ChecklistRow
          done={false}
          label={t('onboarding.checklist.tryDemoForm')}
          href="/demo-forms"
        />
      </ul>
    </Card>
  );
}
