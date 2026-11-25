import Link from 'next/link';
import { ChevronRight, Crown, MapPin, Pencil, Store } from 'lucide-react';
import { ORG_ROLE_LABELS } from '@assistigo/core';
import { Badge } from '@assistigo/ui';
import { SETTINGS_ICONS } from '@/components/settings/settings-icons';
import { requireSession } from '@/lib/auth/session';
import { loadPlanByCode } from '@/lib/billing/plans';
import { localised } from '@/lib/i18n';
import { getTranslations } from '@/lib/i18n/server';
import { visibleSettingsGroups } from '@/lib/settings/sections';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requireSession();
  const { t, locale } = await getTranslations();
  const { organization } = session;

  // Only the plan's display name; a failed lookup falls back to its code.
  const supabase = await createSupabaseServerClient();
  const plan = await loadPlanByCode(supabase, organization.plan_code).catch(() => null);
  const planName = plan ? localised(plan.name, locale) : organization.plan_code;

  const place = [organization.city, organization.district, organization.state]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(', ');

  const facts = [
    {
      icon: Store,
      label: t('onboarding.businessType'),
      value: t(`onboarding.businessTypes.${organization.business_type}`),
    },
    { icon: MapPin, label: t('settings.location'), value: place || '—' },
    { icon: Crown, label: t('billing.currentPlan'), value: planName },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-gradient-to-r from-[#e7f1fe] via-[#f1f7ff] to-white px-6 py-7 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('settings.title')}</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
          {t('settings.subtitle')}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-semibold text-white"
          >
            {organization.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-slate-900">{organization.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="break-all">{session.email ?? session.displayName}</span>
              <Badge tone="info">{localised(ORG_ROLE_LABELS[session.role], locale)}</Badge>
            </p>
          </div>
          {session.permissions.has('org.settings') ? (
            <Link
              href="/settings/organization"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t('settings.editProfile')}
            </Link>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-slate-50/70 p-4">
              <Icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {visibleSettingsGroups(session.permissions).map((group) => (
        <nav key={group.key} aria-labelledby={`settings-${group.key}`}>
          <h2
            id={`settings-${group.key}`}
            className="mb-3 px-1 text-base font-semibold text-slate-900"
          >
            {t(`settings.groups.${group.key}`)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.sections.map((section) => {
              const { icon: Icon, tone } = SETTINGS_ICONS[section.key];
              return (
                <Link
                  key={section.key}
                  href={section.href}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">
                      {t(section.labelKey)}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {t(section.descriptionKey)}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </nav>
      ))}
    </div>
  );
}
