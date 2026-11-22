import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@assistigo/ui';
import { getTranslations } from '@/lib/i18n/server';
import { CopiedIcon, PlusIcon } from '../icons';
import { OUTLINE_BUTTON, PRIMARY_BUTTON } from './detail-card';
import { TabLink } from './customer-tabs';

export type NextStepsInput = {
  customerId: string;
  /** Core profile sections with nothing filled in, as `{ section, title }`. */
  missingSections: { section: string; title: string }[];
  canUpdateProfile: boolean;
  /** `null` when the operator cannot see documents at all. */
  documentCount: number | null;
  canUploadDocument: boolean;
  /** `null` when the operator cannot see applications at all. */
  applicationCount: number | null;
  canCreateApplication: boolean;
};

type Step = {
  key: string;
  done: boolean;
  title: string;
  status: string;
  action: ReactNode;
  extra?: ReactNode;
};

/**
 * The three things an operator does for a walk-in, in order: complete the profile, collect the
 * papers, open an application. Each step says whether it is done and carries the one button that
 * moves it forward, so nobody has to hunt through the tabs to work out what is left.
 */
export async function NextStepsCard({
  customerId,
  missingSections,
  canUpdateProfile,
  documentCount,
  canUploadDocument,
  applicationCount,
  canCreateApplication,
}: NextStepsInput) {
  const { t } = await getTranslations();
  const steps: Step[] = [];

  const profileDone = missingSections.length === 0;
  steps.push({
    key: 'profile',
    done: profileDone,
    title: t('customers.profile.nextSteps.profileTitle'),
    status: profileDone
      ? t('customers.profile.nextSteps.profileDone')
      : t('customers.profile.nextSteps.profileMissing', { count: missingSections.length }),
    action:
      !profileDone && canUpdateProfile ? (
        <TabLink tab="profile" anchor="add-details" className={PRIMARY_BUTTON}>
          {t('customers.profile.nextSteps.profileAction')}
        </TabLink>
      ) : (
        <TabLink tab="profile" className={OUTLINE_BUTTON}>
          {t('customers.profile.nextSteps.view')}
        </TabLink>
      ),
    extra:
      !profileDone && canUpdateProfile ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missingSections.map((section) => (
            <TabLink
              key={section.section}
              tab="profile"
              edit={section.section}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
            >
              <PlusIcon className="h-3 w-3" />
              {section.title}
            </TabLink>
          ))}
        </div>
      ) : undefined,
  });

  if (documentCount !== null) {
    const done = documentCount > 0;
    steps.push({
      key: 'documents',
      done,
      title: t('customers.profile.nextSteps.documentsTitle'),
      status: done
        ? t('customers.profile.nextSteps.documentsDone', { count: documentCount })
        : t('customers.profile.nextSteps.documentsTodo'),
      action: (
        <TabLink
          tab="documents"
          className={!done && canUploadDocument ? PRIMARY_BUTTON : OUTLINE_BUTTON}
        >
          {!done && canUploadDocument
            ? t('customers.profile.nextSteps.documentsAction')
            : t('customers.profile.nextSteps.view')}
        </TabLink>
      ),
    });
  }

  if (applicationCount !== null) {
    const done = applicationCount > 0;
    steps.push({
      key: 'applications',
      done,
      title: t('customers.profile.nextSteps.applicationsTitle'),
      status: done
        ? t('customers.profile.nextSteps.applicationsDone', { count: applicationCount })
        : t('customers.profile.nextSteps.applicationsTodo'),
      action:
        canCreateApplication && !done ? (
          <Link href={`/applications/new?customerId=${customerId}`} className={PRIMARY_BUTTON}>
            <PlusIcon className="h-4 w-4" />
            {t('applications.new')}
          </Link>
        ) : (
          <TabLink tab="applications" className={OUTLINE_BUTTON}>
            {t('customers.profile.nextSteps.view')}
          </TabLink>
        ),
    });
  }

  const doneCount = steps.filter((step) => step.done).length;
  // Nothing left to guide: give the space back to the profile rather than show three ticks.
  if (doneCount === steps.length) return null;
  // The first unfinished step is the one to do now; highlight it so the eye lands there.
  const currentKey = steps.find((step) => !step.done)?.key;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {t('customers.profile.nextSteps.title')}
          </h2>
          <p className="text-xs text-slate-500">{t('customers.profile.nextSteps.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span>
            {t('customers.profile.nextSteps.progress', { done: doneCount, total: steps.length })}
          </span>
          <span className="flex gap-1" aria-hidden>
            {steps.map((step) => (
              <span
                key={step.key}
                className={cn(
                  'h-1.5 w-6 rounded-full',
                  step.done ? 'bg-emerald-500' : 'bg-slate-200',
                )}
              />
            ))}
          </span>
        </div>
      </header>

      <ol className="grid gap-3 p-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const isCurrent = step.key === currentKey;
          return (
            <li
              key={step.key}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4',
                step.done
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : isCurrent
                    ? 'border-brand-300 bg-brand-50/40 ring-1 ring-brand-200'
                    : 'border-slate-200',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    step.done
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {step.done ? <CopiedIcon className="h-4 w-4" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className={cn('text-xs', step.done ? 'text-emerald-700' : 'text-slate-500')}>
                    {step.status}
                  </p>
                  {step.extra}
                </div>
              </div>
              <div className="mt-auto">{step.action}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
