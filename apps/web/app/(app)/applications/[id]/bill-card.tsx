'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, Printer, QrCode, Undo2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SegmentedControl,
  type Tone,
} from '@assistigo/ui';
import { formatRupees, type BillPaymentStatus, type PaymentMethod } from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { qrToSvg } from '@/lib/document-drop/qr';
import type { BillView } from '@/lib/khata/bill';

/**
 * The counter bill on an application (migration 0050): two fee lines, the udhar khata under
 * them, and the receipt — printed on the counter's thermal printer or sent to the customer's
 * own WhatsApp. The UPI QR is for the citizen standing at the counter to scan; the operator then
 * records the payment by hand, because Assistigo never sees the money move.
 */

const RECEIPT_ID = 'counter-receipt';
const PRINTING_CLASS = 'printing-counter-receipt';
const PAPER_KEY = 'assistigo.receiptPaper';

type Paper = '80' | '58';

const STATUS_TONE: Record<BillPaymentStatus, Tone> = {
  unpaid: 'warning',
  partial: 'warning',
  paid: 'success',
  refunded: 'neutral',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { messageKey?: string };
  } | null;
  if (!response.ok || !json || json.data === undefined) {
    throw new Error(json?.error?.messageKey ?? 'errors.internal');
  }
  return json.data;
}

function messageKeyOf(error: unknown): string {
  return error instanceof Error && error.message.includes('.') ? error.message : 'errors.internal';
}

function readPaper(): Paper {
  try {
    return window.localStorage.getItem(PAPER_KEY) === '58' ? '58' : '80';
  } catch {
    return '80';
  }
}

const parseAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : Number.NaN;
};

export function BillCard({
  initialBill,
  canUpdate,
  canRefund,
  canEditSettings,
  hasMobile,
}: {
  initialBill: BillView;
  canUpdate: boolean;
  canRefund: boolean;
  canEditSettings: boolean;
  hasMobile: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [bill, setBill] = useState(initialBill);
  const [editingFees, setEditingFees] = useState(initialBill.total === null);
  const [entryKind, setEntryKind] = useState<'payment' | 'refund'>('payment');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState(initialBill.due > 0 ? String(initialBill.due) : '');
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>('80');
  const [printing, setPrinting] = useState(false);

  const base = `/api/applications/${bill.applicationId}`;
  const hasBill = bill.total !== null;

  useEffect(() => setPaper(readPaper()), []);

  // Print the receipt once the print-only layout is on <body>, then take it off again.
  useEffect(() => {
    if (!printing) return;
    const done = () => {
      document.body.classList.remove(PRINTING_CLASS);
      setPrinting(false);
    };
    document.body.classList.add(PRINTING_CLASS);
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove(PRINTING_CLASS);
    };
  }, [printing]);

  const qrSvg = useMemo(() => {
    if (!bill.upiUri) return null;
    try {
      return qrToSvg(bill.upiUri, { dark: '#000000', title: t('khata.upiQrTitle') });
    } catch {
      return null;
    }
  }, [bill.upiUri, t]);

  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  function applied(next: BillView, noticeKey: string | null) {
    setBill(next);
    setAmount(next.due > 0 ? String(next.due) : '');
    setNotice(noticeKey);
    setError(null);
    // The status badge and the fee row elsewhere on the page read the same row.
    router.refresh();
  }

  async function saveFees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const govtFee = parseAmount(String(form.get('govtFee') ?? ''));
    const serviceCharge = parseAmount(String(form.get('serviceCharge') ?? ''));
    if (Number.isNaN(govtFee) || Number.isNaN(serviceCharge)) {
      setError('errors.validation_failed');
      return;
    }
    if (govtFee === null && serviceCharge === null) {
      setError('errors.khata_no_fees');
      return;
    }
    setBusy('fees');
    try {
      const data = await api<{ bill: BillView }>(`${base}/bill`, {
        method: 'PUT',
        body: JSON.stringify({ govtFee, serviceCharge }),
      });
      setEditingFees(false);
      applied(data.bill, 'khata.feesSaved');
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  async function recordEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseAmount(amount);
    if (value === null || Number.isNaN(value) || value <= 0) {
      setError('errors.validation_failed');
      return;
    }
    // Held before the await: React clears `currentTarget` once the handler yields.
    const formElement = event.currentTarget;
    const note = String(new FormData(formElement).get('note') ?? '').trim();
    setBusy('entry');
    try {
      const data = await api<{ bill: BillView }>(`${base}/payments`, {
        method: 'POST',
        body: JSON.stringify({ kind: entryKind, method, amount: value, note: note || undefined }),
      });
      formElement.reset();
      setEntryKind('payment');
      applied(data.bill, entryKind === 'refund' ? 'khata.refundRecorded' : 'khata.paymentRecorded');
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  async function sendWhatsapp() {
    setBusy('whatsapp');
    setError(null);
    setNotice(null);
    try {
      await api<{ sent: true }>(`${base}/bill/whatsapp`, { method: 'POST' });
      setNotice('khata.whatsappSent');
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  function choosePaper(next: Paper) {
    setPaper(next);
    try {
      window.localStorage.setItem(PAPER_KEY, next);
    } catch {
      // A blocked storage only means the choice is not remembered.
    }
  }

  const methodOptions = [
    { value: 'cash' as const, label: t('khata.method.cash') },
    { value: 'upi' as const, label: t('khata.method.upi') },
    { value: 'other' as const, label: t('khata.method.other') },
  ];

  const canTakePayment = canUpdate && hasBill && bill.due > 0;
  const canGiveRefund = canRefund && hasBill && bill.paid > 0;
  const showEntryForm = entryKind === 'refund' ? canGiveRefund : canTakePayment;

  return (
    <Card
      title={t('khata.cardTitle')}
      description={bill.billNumber ? t('khata.billNumber', { number: bill.billNumber }) : undefined}
      actions={
        bill.status ? (
          <Badge tone={STATUS_TONE[bill.status]}>{t(`applications.payment.${bill.status}`)}</Badge>
        ) : null
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}
        {notice ? <Alert tone="success">{t(notice)}</Alert> : null}

        {editingFees && canUpdate ? (
          <form className="space-y-3" onSubmit={saveFees}>
            <p className="text-sm text-slate-600">{t('khata.feesHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('khata.govtFee')} htmlFor="bill-govt-fee">
                <Input
                  id="bill-govt-fee"
                  name="govtFee"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={bill.govtFee ?? ''}
                  placeholder="0"
                />
              </Field>
              <Field label={t('khata.serviceCharge')} htmlFor="bill-service-charge">
                <Input
                  id="bill-service-charge"
                  name="serviceCharge"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={bill.serviceCharge ?? ''}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              {hasBill ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingFees(false)}
                >
                  {t('common.cancel')}
                </Button>
              ) : null}
              <Button type="submit" size="sm" loading={busy === 'fees'}>
                {t('khata.saveFees')}
              </Button>
            </div>
          </form>
        ) : hasBill ? (
          <dl className="space-y-1.5 text-sm">
            {bill.govtFee !== null ? (
              <Row label={t('khata.govtFee')} value={formatRupees(bill.govtFee)} />
            ) : null}
            {bill.serviceCharge !== null ? (
              <Row label={t('khata.serviceCharge')} value={formatRupees(bill.serviceCharge)} />
            ) : null}
            <Row label={t('khata.total')} value={formatRupees(bill.total)} strong />
            <Row label={t('khata.paid')} value={formatRupees(bill.paid)} />
            <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2">
              <dt className="font-medium text-slate-700">{t('khata.balanceDue')}</dt>
              <dd
                className={
                  bill.due > 0
                    ? 'text-lg font-semibold tabular-nums text-amber-700'
                    : 'text-lg font-semibold tabular-nums text-emerald-700'
                }
              >
                {formatRupees(bill.due)}
              </dd>
            </div>
            {canUpdate ? (
              <div className="pt-1 text-right">
                <Button variant="link" size="sm" onClick={() => setEditingFees(true)}>
                  {t('khata.editFees')}
                </Button>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{t('khata.noFees')}</p>
        )}

        {showEntryForm ? (
          <form
            className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            onSubmit={recordEntry}
          >
            <p className="text-sm font-medium text-slate-800">
              {entryKind === 'refund' ? t('khata.recordRefund') : t('khata.recordPayment')}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('khata.amount')} htmlFor="bill-amount">
                <Input
                  id="bill-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-32"
                  required
                />
              </Field>
              <SegmentedControl
                ariaLabel={t('khata.methodLabel')}
                options={methodOptions}
                value={method}
                onValueChange={setMethod}
              />
            </div>
            <Field label={t('khata.note')} htmlFor="bill-note">
              <Input
                id="bill-note"
                name="note"
                maxLength={200}
                placeholder={
                  entryKind === 'refund'
                    ? t('khata.refundNotePlaceholder')
                    : t('khata.notePlaceholder')
                }
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              {entryKind === 'refund' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEntryKind('payment')}
                >
                  {t('common.cancel')}
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                variant={entryKind === 'refund' ? 'danger' : 'primary'}
                loading={busy === 'entry'}
              >
                {entryKind === 'refund' ? t('khata.saveRefund') : t('khata.savePayment')}
              </Button>
            </div>
          </form>
        ) : null}

        {hasBill ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPrinting(true)}>
              <Printer className="h-4 w-4" aria-hidden />
              {t('khata.printReceipt')}
            </Button>
            <SegmentedControl
              size="sm"
              ariaLabel={t('khata.paperWidth')}
              options={[
                { value: '80' as const, label: '80 mm' },
                { value: '58' as const, label: '58 mm' },
              ]}
              value={paper}
              onValueChange={choosePaper}
            />
            {canUpdate ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasMobile}
                title={hasMobile ? undefined : t('errors.khata_no_mobile')}
                loading={busy === 'whatsapp'}
                onClick={() => void sendWhatsapp()}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('khata.sendWhatsapp')}
              </Button>
            ) : null}
            {qrSvg ? (
              <Button variant="secondary" size="sm" onClick={() => setShowQr((open) => !open)}>
                <QrCode className="h-4 w-4" aria-hidden />
                {showQr ? t('khata.hideUpiQr') : t('khata.showUpiQr')}
              </Button>
            ) : null}
            {canGiveRefund && entryKind !== 'refund' ? (
              <Button variant="ghost" size="sm" onClick={() => setEntryKind('refund')}>
                <Undo2 className="h-4 w-4" aria-hidden />
                {t('khata.refund')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {hasBill && bill.due > 0 && !bill.centre.upiId ? (
          <p className="text-xs text-slate-500">
            {t('khata.noUpiId')}{' '}
            {canEditSettings ? (
              <Link href="/settings/organization" className="text-brand-700 hover:underline">
                {t('khata.addUpiId')}
              </Link>
            ) : null}
          </p>
        ) : null}

        {showQr && qrSvg ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-slate-200 p-4">
            <div className="h-52 w-52" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-sm font-medium text-slate-800">
              {t('khata.scanToPay', { amount: formatRupees(bill.due) })}
            </p>
            <p className="text-xs text-slate-500">{bill.centre.upiId}</p>
            <p className="max-w-xs text-center text-xs text-slate-500">{t('khata.qrHint')}</p>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('khata.ledger')}
          </h3>
          {bill.entries.length === 0 ? (
            <p className="text-sm text-slate-500">{t('khata.ledgerEmpty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {bill.entries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="text-slate-800">
                      {entry.kind === 'refund' ? t('khata.refund') : t('khata.payment')} ·{' '}
                      {t(`khata.method.${entry.method}`)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {dateTime.format(new Date(entry.createdAt))}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                  </div>
                  <span
                    className={
                      entry.kind === 'refund'
                        ? 'shrink-0 tabular-nums text-red-700'
                        : 'shrink-0 tabular-nums text-slate-900'
                    }
                  >
                    {entry.kind === 'refund' ? '−' : '+'}
                    {formatRupees(entry.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {hasBill ? <CounterReceipt bill={bill} paper={paper} qrSvg={qrSvg} /> : null}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          strong ? 'font-semibold tabular-nums text-slate-900' : 'tabular-nums text-slate-800'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** The thermal receipt. Hidden on screen; globals.css prints only this while printing. */
function CounterReceipt({
  bill,
  paper,
  qrSvg,
}: {
  bill: BillView;
  paper: Paper;
  qrSvg: string | null;
}) {
  const { t, locale } = useI18n();
  const printedAt = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <div id={RECEIPT_ID} data-paper={paper} aria-hidden>
      <p className="receipt-title">{bill.centre.name}</p>
      {bill.centre.place ? <p className="receipt-small">{bill.centre.place}</p> : null}
      {bill.centre.phone ? (
        <p className="receipt-small">{t('khata.receipt.phone', { phone: bill.centre.phone })}</p>
      ) : null}
      <hr />
      {bill.billNumber ? <p>{t('khata.receipt.billNumber', { number: bill.billNumber })}</p> : null}
      <p className="receipt-small">{printedAt}</p>
      {bill.customerName ? <p>{t('khata.receipt.customer', { name: bill.customerName })}</p> : null}
      <p>{t('khata.receipt.application', { title: bill.title })}</p>
      {bill.portalReferenceNumber ? (
        <p>{t('khata.receipt.reference', { reference: bill.portalReferenceNumber })}</p>
      ) : null}
      <hr />
      {bill.govtFee !== null ? (
        <p className="receipt-row">
          <span>{t('khata.govtFee')}</span>
          <span>{formatRupees(bill.govtFee)}</span>
        </p>
      ) : null}
      {bill.serviceCharge !== null ? (
        <p className="receipt-row">
          <span>{t('khata.serviceCharge')}</span>
          <span>{formatRupees(bill.serviceCharge)}</span>
        </p>
      ) : null}
      <p className="receipt-row receipt-strong">
        <span>{t('khata.total')}</span>
        <span>{formatRupees(bill.total)}</span>
      </p>
      <p className="receipt-row">
        <span>{t('khata.paid')}</span>
        <span>{formatRupees(bill.paid)}</span>
      </p>
      <p className="receipt-row receipt-strong">
        <span>{t('khata.balanceDue')}</span>
        <span>{formatRupees(bill.due)}</span>
      </p>
      {bill.due > 0 && qrSvg ? (
        <>
          <hr />
          <p className="receipt-small receipt-center">
            {t('khata.scanToPay', { amount: formatRupees(bill.due) })}
          </p>
          <div className="receipt-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="receipt-small receipt-center">{bill.centre.upiId}</p>
        </>
      ) : null}
      <hr />
      <p className="receipt-small receipt-center">{t('khata.receipt.thanks')}</p>
    </div>
  );
}
