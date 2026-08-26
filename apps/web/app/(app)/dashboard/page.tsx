import Link from 'next/link';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@assistigo/ui';
import { formatIndianDate, maskMobile } from '@assistigo/core';
import { requireSession } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CustomerRow, DashboardSummary } from '@/lib/supabase/database.types';
import { OnboardingChecklist } from './onboarding-checklist';
import { StatCard } from './stat-card';
import { QuickActions } from './quick-actions';
import { FormIcon, UsersIcon, DocumentIcon, ClipboardIcon, AlertIcon, ClockIcon } from './icons';

export const metadata = { title: 'Home' };

const EMPTY_SUMMARY: DashboardSummary = {
  fillsToday: 0,
  customersServedToday: 0,
  customersTotal: 0,
  documentsProcessedToday: 0,
  applicationsOpen: 0,
  reviewsPending: 0,
  fieldsFilledThisMonth: 0,
};

/**
 * Time saved is presented as an estimate and labelled as one (spec §8.6 — no overclaiming).
 * 12 seconds per field is a placeholder until the pilot measures it for real; Phase 10 replaces
 * this with observed data.
 */
const SECONDS_SAVED_PER_FIELD = 12;

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function greetingKey(hour: number): string {
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { t } = await getTranslations();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [summaryResult, customersResult] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_organization_id: session.organization.id }),
    supabase
      .from('customers')
      .select('id, customer_code, full_name, mobile, created_at')
      .eq('organization_id', session.organization.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const summary: DashboardSummary = {
    ...EMPTY_SUMMARY,
    ...((summaryResult.data as DashboardSummary | null) ?? {}),
  };
  const recentCustomers = (customersResult.data ?? []) as Pick<
    CustomerRow,
    'id' | 'customer_code' | 'full_name' | 'mobile' | 'created_at'
  >[];

  const timeSaved = formatDuration(summary.fieldsFilledThisMonth * SECONDS_SAVED_PER_FIELD);
  const greeting = greetingKey(new Date().getHours());

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-brand-700/20 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 px-6 py-6 text-white shadow-sm animate-fade-in-up sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-20 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-brand-100">{t(greeting)}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t('dashboard.title')}</h1>
          <p className="mt-1.5 text-sm text-brand-100">
            {t('dashboard.subtitle', { org: session.organization.name })}
          </p>
        </div>
      </div>

      {params.denied ? <Alert tone="warning">{t('errors.permission_denied')}</Alert> : null}

      <QuickActions permissions={session.permissions} t={t} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('dashboard.fillsToday')}
          value={summary.fillsToday}
          icon={<FormIcon />}
          tone="brand"
          href={session.permissions.has('fill.run') ? '/fill-sessions' : undefined}
          style={{ animationDelay: '0ms' }}
        />
        <StatCard
          label={t('dashboard.customersServed')}
          value={summary.customersServedToday}
          icon={<UsersIcon />}
          tone="sky"
          href={session.permissions.has('customer.view') ? '/customers' : undefined}
          style={{ animationDelay: '40ms' }}
        />
        <StatCard
          label={t('dashboard.documentsProcessed')}
          value={summary.documentsProcessedToday}
          icon={<DocumentIcon />}
          tone="violet"
          href={session.permissions.has('document.view') ? '/documents' : undefined}
          style={{ animationDelay: '80ms' }}
        />
        <StatCard
          label={t('dashboard.applicationsOpen')}
          value={summary.applicationsOpen}
          icon={<ClipboardIcon />}
          tone="amber"
          href={session.permissions.has('application.view') ? '/applications?filter=open' : undefined}
          style={{ animationDelay: '120ms' }}
        />
        <StatCard
          label={t('dashboard.reviewsPending')}
          value={summary.reviewsPending}
          icon={<AlertIcon />}
          tone={summary.reviewsPending > 0 ? 'amber' : 'brand'}
          href={session.permissions.has('document.view') ? '/documents' : undefined}
          style={{ animationDelay: '160ms' }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title={t('dashboard.recentCustomers')}
            actions={
              <div className="flex items-center gap-3">
                {session.permissions.has('customer.view') ? (
                  <Link href="/customers" className="text-sm font-medium text-brand-700 hover:underline">
                    {t('dashboard.viewAll')}
                  </Link>
                ) : null}
                {session.permissions.has('customer.create') ? (
                  <Link href="/customers/new">
                    <Button size="sm">{t('customers.new')}</Button>
                  </Link>
                ) : null}
              </div>
            }
          >
            {recentCustomers.length === 0 ? (
              <EmptyState
                title={t('dashboard.emptyCustomers')}
                action={
                  session.permissions.has('customer.create') ? (
                    <Link href="/customers/new">
                      <Button size="sm">{t('customers.new')}</Button>
                    </Link>
                  ) : null
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('customers.code')}</TH>
                    <TH>{t('customers.name')}</TH>
                    <TH>{t('customers.mobile')}</TH>
                    <TH>{t('customers.created')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {recentCustomers.map((customer) => (
                    <TR key={customer.id} className="transition-colors hover:bg-slate-50">
                      <TD className="font-mono text-xs text-slate-500">{customer.customer_code}</TD>
                      <TD>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-2.5 font-medium text-brand-700 hover:underline"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                            {initials(customer.full_name)}
                          </span>
                          {customer.full_name}
                        </Link>
                      </TD>
                      {/* Masked by default; the full number needs an audited reveal (§19.3). */}
                      <TD className="masked-value">{maskMobile(customer.mobile) ?? '—'}</TD>
                      <TD className="text-slate-500">
                        {formatIndianDate(customer.created_at.slice(0, 10)) ?? '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <OnboardingChecklist
            hasCustomers={summary.customersTotal > 0}
            hasDocuments={summary.documentsProcessedToday > 0}
          />

          <Card title={t('dashboard.timeSaved')}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <ClockIcon />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{timeSaved}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('dashboard.timeSavedHint', { fields: summary.fieldsFilledThisMonth })}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
