'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, TBody, TD, TH, THead, TR, Table } from '@assistigo/ui';
import type { SchemeMatchStatus } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { whatsappLink } from '@/lib/schemes/view';

export type EligibleCustomerView = {
  id: string;
  customerCode: string;
  fullName: string;
  mobile: string | null;
  status: SchemeMatchStatus;
  ageAtCutoff: number | null;
  missing: string[];
  pitch: { en: string; hi: string };
};

/**
 * The centre's own customers who match this scheme.
 *
 * Outreach is one click *per customer*, on purpose. There is no "message everyone" button here:
 * bulk unsolicited messaging is the operator's legal exposure under DPDP consent rules, not
 * something the product should make frictionless, and an operator who knows the person is the
 * right check on whether the pitch is welcome. Copying the list is offered instead, so the
 * operator decides who to contact.
 */
export function EligibleCustomersTable({ customers }: { customers: EligibleCustomerView[] }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyList = async () => {
    const lines = customers.map((customer) =>
      [customer.fullName, customer.customerCode, customer.mobile ?? ''].filter(Boolean).join('\t'),
    );
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be refused; the table itself is still selectable.
    }
  };

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR>
            <TH>{t('customers.name')}</TH>
            <TH>{t('customers.code')}</TH>
            <TH>{t('schemes.customerAge')}</TH>
            <TH>{t('settings.status')}</TH>
            <TH>{t('schemes.outreach')}</TH>
          </TR>
        </THead>
        <TBody>
          {customers.map((customer) => {
            const wa = customer.mobile
              ? whatsappLink(customer.mobile, customer.pitch[locale])
              : null;
            return (
              <TR key={customer.id}>
                <TD>
                  <Link href={`/customers/${customer.id}`} className="hover:underline">
                    {customer.fullName}
                  </Link>
                </TD>
                <TD className="font-mono text-xs text-slate-500">{customer.customerCode}</TD>
                <TD className="text-slate-500">{customer.ageAtCutoff ?? '—'}</TD>
                <TD>
                  {customer.status === 'eligible' ? (
                    <Badge tone="success">{t('schemes.statusEligible')}</Badge>
                  ) : (
                    <div className="space-y-1">
                      <Badge tone="warning">{t('schemes.statusActionable')}</Badge>
                      {customer.missing.length > 0 ? (
                        <p className="text-xs text-amber-700">{customer.missing.join(', ')}</p>
                      ) : null}
                    </div>
                  )}
                </TD>
                <TD>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost">
                        {t('schemes.whatsappPitch')}
                      </Button>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">{t('schemes.noMobile')}</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <button
        type="button"
        onClick={copyList}
        className="text-xs text-brand-700 underline-offset-2 hover:underline"
      >
        {copied ? t('schemes.listCopied') : t('schemes.copyList')}
      </button>
    </div>
  );
}
