'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, type Tone } from '@assistigo/ui';
import { useI18n } from '@/lib/i18n/client';
import { initialsOf } from '@/lib/dashboard/metrics';
import { whatsappLink } from '@/lib/schemes/view';
import { ArrowRightIcon, EyeIcon, PhoneIcon, PlusIcon, UploadIcon, WhatsappIcon } from './icons';

export type RecentCustomerView = {
  id: string;
  customerCode: string;
  fullName: string;
  /**
   * The full number, used only to build the `tel:` and `wa.me` links the operator's own device
   * opens — the same pattern the scheme outreach table uses. It is never rendered as text until
   * an operator holding `customer.reveal_sensitive` asks for it through the audited endpoint.
   */
  mobile: string | null;
  /** What the row shows by default (§19.3). */
  mobileMasked: string | null;
  verificationStatus: string;
  createdOn: string | null;
};

const VERIFICATION_TONE: Record<string, Tone> = {
  unverified: 'neutral',
  extracted: 'info',
  operator_verified: 'success',
  customer_confirmed: 'success',
  expired: 'warning',
  rejected: 'warning',
};

const AVATAR_GRADIENTS = [
  'from-brand-500 to-sky-500',
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-fuchsia-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
];

/** Stable per customer, so the same person keeps the same colour between visits. */
function gradientFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] ?? 'from-brand-500 to-sky-500';
}

/**
 * The walk-in list: who came to the counter, and the two things the operator does next.
 *
 * Outreach is one click and needs no reveal — the number goes into a `wa.me` or `tel:` URL that
 * the operator's own device opens, and nothing is sent from here (the same pattern as the scheme
 * outreach table). *Reading* the digits is a separate, audited action: `customer.mobile` is a
 * sensitive field, so it renders masked until somebody holding `customer.reveal_sensitive` asks,
 * and that ask writes an audit entry (docs/SECURITY.md §4, DEVELOPMENT_RULES §5).
 */
export function RecentCustomersCard({
  customers,
  canCreate,
  canReveal,
  canUploadDocument,
  canCreateApplication,
}: {
  customers: RecentCustomerView[];
  canCreate: boolean;
  canReveal: boolean;
  canUploadDocument: boolean;
  canCreateApplication: boolean;
}) {
  const { t } = useI18n();

  return (
    <Card
      className="animate-fade-in-up"
      title={t('dashboard.walkInCustomers')}
      description={t('dashboard.walkInCustomersHint')}
      actions={
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            {t('dashboard.viewAll')}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
          {canCreate ? (
            <Link href="/customers/new">
              <Button size="sm">
                <PlusIcon className="h-4 w-4" />
                {t('customers.new')}
              </Button>
            </Link>
          ) : null}
        </div>
      }
    >
      {customers.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyCustomers')}
          action={
            canCreate ? (
              <Link href="/customers/new">
                <Button size="sm">{t('customers.new')}</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="-my-1 divide-y divide-slate-100">
          {customers.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              canReveal={canReveal}
              canUploadDocument={canUploadDocument}
              canCreateApplication={canCreateApplication}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CustomerRow({
  customer,
  canReveal,
  canUploadDocument,
  canCreateApplication,
}: {
  customer: RecentCustomerView;
  canReveal: boolean;
  canUploadDocument: boolean;
  canCreateApplication: boolean;
}) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealFailed, setRevealFailed] = useState(false);

  async function reveal() {
    setRevealing(true);
    setRevealFailed(false);
    try {
      const response = await fetch(`/api/customers/${customer.id}/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fieldKey: 'customer.mobile' }),
      });
      if (!response.ok) {
        setRevealFailed(true);
        return;
      }
      const json = (await response.json()) as { data: { value: string | null } };
      setRevealed(json.data.value);
    } catch {
      // A failed reveal leaves the mask in place; the operator can retry or open the profile.
      setRevealFailed(true);
    } finally {
      setRevealing(false);
    }
  }

  const digits = customer.mobile?.replace(/\D/g, '') ?? '';
  const wa = customer.mobile
    ? whatsappLink(customer.mobile, t('dashboard.whatsappGreeting'))
    : null;
  // Only a plausible ten-digit Indian mobile becomes a dial link, for the same reason
  // `whatsappLink` refuses anything else: a mistyped number must not dial a stranger.
  const tel = /^(?:91)?[6-9]\d{9}$/.test(digits) ? `tel:+91${digits.slice(-10)}` : null;

  return (
    <li className="group -mx-2 flex flex-wrap items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50">
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-sm ${gradientFor(customer.id)}`}
      >
        {initialsOf(customer.fullName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/customers/${customer.id}`}
            className="truncate text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline"
          >
            {customer.fullName}
          </Link>
          <Badge tone={VERIFICATION_TONE[customer.verificationStatus] ?? 'neutral'}>
            {t(`customers.verification.${customer.verificationStatus}`)}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span className="font-mono">{customer.customerCode}</span>
          <span aria-hidden>·</span>
          <span className="masked-value">{revealed ?? customer.mobileMasked ?? '—'}</span>
          {canReveal && revealed === null && customer.mobileMasked ? (
            <button
              type="button"
              onClick={() => void reveal()}
              disabled={revealing}
              className="inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              {revealing ? t('common.loading') : t('common.reveal')}
            </button>
          ) : null}
          {revealFailed ? (
            <span className="text-amber-700">{t('dashboard.revealFailed')}</span>
          ) : null}
          {customer.createdOn ? (
            <>
              <span aria-hidden>·</span>
              <span>{customer.createdOn}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            title={t('dashboard.messageOnWhatsapp')}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            <WhatsappIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.whatsapp')}</span>
          </a>
        ) : null}
        {tel ? (
          <a
            href={tel}
            title={t('dashboard.callCustomer')}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <PhoneIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.call')}</span>
          </a>
        ) : null}
        {canCreateApplication ? (
          <Link
            href={`/applications/new?customerId=${customer.id}`}
            title={t('dashboard.startApplication')}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100"
          >
            <ArrowRightIcon className="h-4 w-4" />
            <span className="hidden xl:inline">{t('dashboard.startApplication')}</span>
          </Link>
        ) : null}
        {canUploadDocument ? (
          <Link
            href={`/documents/upload?customerId=${customer.id}`}
            title={t('documents.upload')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <UploadIcon className="h-4 w-4" />
            <span className="sr-only">{t('documents.upload')}</span>
          </Link>
        ) : null}
      </div>
    </li>
  );
}
