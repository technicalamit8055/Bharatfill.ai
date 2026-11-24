'use client';

import Link from 'next/link';
import { formatMobile } from '@assistigo/core';
import { Badge, Button, Card, EmptyState, type Tone } from '@assistigo/ui';
import { useI18n } from '@/lib/i18n/client';
import { CustomerAvatar } from '../customers/customer-avatar';
import { whatsappLink } from '@/lib/schemes/view';
import { ArrowRightIcon, PhoneIcon, PlusIcon, UploadIcon, WhatsappIcon } from './icons';

export type RecentCustomerView = {
  id: string;
  customerCode: string;
  fullName: string;
  /** Shown in full to the centre (product owner, 2026-11-24), and behind the call links. */
  mobile: string | null;
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

/**
 * The walk-in list: who came to the counter, and the two things the operator does next.
 *
 * Outreach is one click: the number goes into a `wa.me` or `tel:` URL that the operator's own
 * device opens, and nothing is sent from here (the same pattern as the scheme outreach table).
 */
export function RecentCustomersCard({
  customers,
  canCreate,
  canUploadDocument,
  canCreateApplication,
}: {
  customers: RecentCustomerView[];
  canCreate: boolean;
  canUploadDocument: boolean;
  canCreateApplication: boolean;
}) {
  const { t } = useI18n();

  return (
    <Card
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
              canUploadDocument={canUploadDocument}
              canCreateApplication={canCreateApplication}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One look for every row action, so the eye reads the labels rather than four colours. */
const ROW_ACTION =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50';

function CustomerRow({
  customer,
  canUploadDocument,
  canCreateApplication,
}: {
  customer: RecentCustomerView;
  canUploadDocument: boolean;
  canCreateApplication: boolean;
}) {
  const { t } = useI18n();
  const digits = customer.mobile?.replace(/\D/g, '') ?? '';
  const wa = customer.mobile
    ? whatsappLink(customer.mobile, t('dashboard.whatsappGreeting'))
    : null;
  // Only a plausible ten-digit Indian mobile becomes a dial link, for the same reason
  // `whatsappLink` refuses anything else: a mistyped number must not dial a stranger.
  const tel = /^(?:91)?[6-9]\d{9}$/.test(digits) ? `tel:+91${digits.slice(-10)}` : null;

  return (
    <li className="group -mx-5 flex flex-wrap items-center gap-3 px-5 py-2.5 transition-colors hover:bg-slate-50">
      <CustomerAvatar id={customer.id} name={customer.fullName} className="h-9 w-9 text-xs" />

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
          <span className="tabular-nums">
            {formatMobile(customer.mobile) ?? customer.mobile ?? '—'}
          </span>
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
            className={ROW_ACTION}
          >
            <WhatsappIcon className="h-4 w-4 text-emerald-600" />
            <span className="hidden sm:inline">{t('dashboard.whatsapp')}</span>
          </a>
        ) : null}
        {tel ? (
          <a href={tel} title={t('dashboard.callCustomer')} className={ROW_ACTION}>
            <PhoneIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.call')}</span>
          </a>
        ) : null}
        {canCreateApplication ? (
          <Link
            href={`/applications/new?customerId=${customer.id}`}
            title={t('dashboard.startApplication')}
            className={ROW_ACTION}
          >
            <ArrowRightIcon className="h-4 w-4" />
            <span className="hidden xl:inline">{t('dashboard.startApplication')}</span>
          </Link>
        ) : null}
        {canUploadDocument ? (
          <Link
            href={`/documents/upload?customerId=${customer.id}`}
            title={t('documents.upload')}
            className={`${ROW_ACTION} w-8 justify-center px-0`}
          >
            <UploadIcon className="h-4 w-4" />
            <span className="sr-only">{t('documents.upload')}</span>
          </Link>
        ) : null}
      </div>
    </li>
  );
}
