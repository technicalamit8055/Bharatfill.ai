'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  CreditCard,
  FileText,
  IndianRupee,
  LayoutGrid,
  Link2,
  Monitor,
  Plus,
  RotateCcw,
  Search,
  Send,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea, cn } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { APPLICATION_CATEGORIES, APPLICATION_NOTES_MAX } from '@/lib/applications/schema';
import { CustomerAvatar } from '../../customers/customer-avatar';

/** Mobile + name identify a customer: the last four digits stand in for the internal code. */
type CustomerOption = { id: string; full_name: string; mobile_last4: string | null };
type SearchResult = { id: string; displayName: string; mobileLast4: string | null };
type AdapterOption = { id: string; portalName: string; formName: string };

/** Both submit buttons create the application; they differ only in where the operator lands. */
type SubmitIntent = 'draft' | 'open';

/** Pastel badge tints. Spelled out in full so Tailwind's scanner keeps every class. */
const BADGE_TONES = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  rose: 'bg-rose-50 text-rose-500 ring-rose-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  orange: 'bg-orange-50 text-orange-500 ring-orange-100',
} as const;

const CONTROL = 'h-11 rounded-lg';

const SIDE_ACTION =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 ' +
  'text-sm font-medium text-brand-700 transition-colors hover:border-brand-200 hover:bg-brand-100 sm:w-44';

function FieldRow({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <span
        aria-hidden
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
          BADGE_TONES[tone],
        )}
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function NewApplicationForm({
  adapters,
  preselectedCustomer,
  defaultPortalAdapterId,
  defaultPortalName,
  defaultFormName,
  canCreateCustomer,
  canBrowseTemplates,
}: {
  adapters: AdapterOption[];
  preselectedCustomer: CustomerOption | null;
  defaultPortalAdapterId?: string;
  defaultPortalName?: string;
  defaultFormName?: string;
  canCreateCustomer: boolean;
  canBrowseTemplates: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const [customer, setCustomer] = useState<CustomerOption | null>(preselectedCustomer);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<SearchResult[] | null>(null);
  const [customerMissing, setCustomerMissing] = useState(false);
  const [portalAdapterId, setPortalAdapterId] = useState(defaultPortalAdapterId ?? '');
  const [title, setTitle] = useState(defaultFormName ?? '');
  const [portalName, setPortalName] = useState(defaultPortalName ?? '');
  const [formName, setFormName] = useState(defaultFormName ?? '');
  const [notesLength, setNotesLength] = useState(0);
  const [pending, setPending] = useState<SubmitIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = customerQuery.trim();
    if (customer || trimmed === '') {
      setCustomerResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(response)))
        .then((body: { data: { customers: SearchResult[] } }) =>
          setCustomerResults(body.data.customers),
        )
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setCustomerResults([]);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerQuery, customer]);

  /*
   * Picking a template fills the portal and form names — and the title, from the form name — but
   * only into fields the operator has left blank, so switching templates never erases their typing.
   * The server applies the same fallback for the names, so this is a preview of what gets saved.
   */
  function handleAdapterChange(id: string) {
    setPortalAdapterId(id);
    const adapter = adapters.find((option) => option.id === id);
    if (!adapter) return;
    setPortalName((current) => (current.trim() ? current : adapter.portalName));
    setFormName((current) => (current.trim() ? current : adapter.formName));
    setTitle((current) => (current.trim() ? current : adapter.formName));
  }

  function clearForm() {
    // Resets the uncontrolled fields (category, URL, deadline, fee, payment, notes) to their
    // defaults; the controlled ones are cleared through state below.
    formRef.current?.reset();
    setCustomer(null);
    setCustomerQuery('');
    setCustomerResults(null);
    setCustomerMissing(false);
    setPortalAdapterId('');
    setTitle('');
    setPortalName('');
    setFormName('');
    setNotesLength(0);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent: SubmitIntent = submitter?.getAttribute('value') === 'draft' ? 'draft' : 'open';

    if (!customer) {
      setCustomerMissing(true);
      customerInputRef.current?.focus();
      return;
    }
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => {
      const value = String(form.get(key) ?? '').trim();
      return value === '' ? undefined : value;
    };

    const payload: Record<string, unknown> = {
      customerId: customer.id,
      portalAdapterId: portalAdapterId || undefined,
      title: String(form.get('title') ?? ''),
      category: String(form.get('category') ?? 'other'),
      portalName: optional('portalName'),
      formName: optional('formName'),
      portalUrl: optional('portalUrl'),
      deadlineAt: optional('deadlineAt'),
      paymentStatus: optional('paymentStatus'),
      notes: optional('notes'),
    };
    const fee = optional('amountCharged');
    if (fee) payload.amountCharged = Number(fee);

    setPending(intent);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as
        { data: { application: { id: string } } } | { error: { messageKey: string } };
      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        setPending(null);
        return;
      }
      // Every new application starts as a draft (the column default). "Save as draft" parks it on
      // the list; "Create application" opens it so the operator can carry on with the checklist.
      router.push(
        intent === 'draft' ? '/applications' : `/applications/${json.data.application.id}`,
      );
    } catch {
      setError('errors.internal');
      setPending(null);
    }
  }

  const hasSideColumn = canCreateCustomer || canBrowseTemplates;
  const sideSpacer = <span aria-hidden className="hidden shrink-0 sm:block sm:w-44" />;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <form ref={formRef} className="space-y-5" onSubmit={handleSubmit}>
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}

        <FieldRow icon={UserRound} tone="blue">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field
              className="min-w-0 flex-1"
              label={t('applications.form.customer')}
              htmlFor={`${ids}-customer`}
              hint={t('applications.form.customerHint')}
              error={
                customerMissing && !customer ? t('applications.form.customerRequired') : undefined
              }
              required
            >
              {customer ? (
                <div className="flex h-11 items-center justify-between gap-3 rounded-lg bg-white px-3 shadow-sm ring-1 ring-inset ring-slate-300">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CustomerAvatar
                      id={customer.id}
                      name={customer.full_name}
                      className="h-7 w-7 text-xs"
                    />
                    <span className="truncate text-sm font-medium text-slate-900">
                      {customer.full_name}
                    </span>
                    {customer.mobile_last4 ? (
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        ••••{customer.mobile_last4}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
                    onClick={() => {
                      setCustomer(null);
                      // The input only mounts once the chip is gone.
                      requestAnimationFrame(() => customerInputRef.current?.focus());
                    }}
                  >
                    {t('applications.form.changeCustomer')}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    ref={customerInputRef}
                    id={`${ids}-customer`}
                    value={customerQuery}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value);
                      setCustomerMissing(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setCustomerResults(null);
                    }}
                    placeholder={`${t('customers.searchPlaceholder')}…`}
                    autoComplete="off"
                    invalid={customerMissing}
                    className={cn(CONTROL, 'pl-10 pr-10')}
                  />
                  <ChevronDown
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  {customerResults !== null ? (
                    <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {customerResults.length === 0 ? (
                        <li className="px-3 py-2.5 text-sm text-slate-500">
                          {t('customers.empty')}
                        </li>
                      ) : (
                        customerResults.map((result) => (
                          <li key={result.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                              onClick={() => {
                                setCustomer({
                                  id: result.id,
                                  full_name: result.displayName,
                                  mobile_last4: result.mobileLast4,
                                });
                                setCustomerResults(null);
                                setCustomerMissing(false);
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <CustomerAvatar
                                  id={result.id}
                                  name={result.displayName}
                                  className="h-7 w-7 text-xs"
                                />
                                <span className="truncate text-sm text-slate-900">
                                  {result.displayName}
                                </span>
                              </span>
                              {result.mobileLast4 ? (
                                <Badge tone="neutral">••••{result.mobileLast4}</Badge>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              )}
            </Field>

            {canCreateCustomer ? (
              <Link href="/customers/new" className={SIDE_ACTION}>
                <Plus size={16} strokeWidth={2} aria-hidden />
                {t('applications.form.newCustomer')}
              </Link>
            ) : hasSideColumn ? (
              sideSpacer
            ) : null}
          </div>
        </FieldRow>

        <FieldRow icon={FileText} tone="violet">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              className="min-w-0 flex-1"
              label={t('applications.form.portalAdapter')}
              htmlFor={`${ids}-adapter`}
            >
              <Select
                id={`${ids}-adapter`}
                value={portalAdapterId}
                onChange={(event) => handleAdapterChange(event.target.value)}
                className={CONTROL}
              >
                <option value="">{t('applications.form.portalAdapterNone')}</option>
                {adapters.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.portalName} — {adapter.formName}
                  </option>
                ))}
              </Select>
            </Field>

            {canBrowseTemplates ? (
              <Link href="/form-library" className={cn(SIDE_ACTION, 'h-11')}>
                <BookOpen size={16} strokeWidth={1.8} aria-hidden />
                {t('applications.form.browseTemplates')}
              </Link>
            ) : hasSideColumn ? (
              sideSpacer
            ) : null}
          </div>
        </FieldRow>

        <FieldRow icon={FileText} tone="rose">
          <Field label={t('applications.form.titleLabel')} htmlFor={`${ids}-title`} required>
            <Input
              id={`${ids}-title`}
              name="title"
              required
              minLength={2}
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('applications.form.titlePlaceholder')}
              className={CONTROL}
            />
          </Field>
        </FieldRow>

        <FieldRow icon={LayoutGrid} tone="emerald">
          <Field label={t('applications.form.category')} htmlFor={`${ids}-category`}>
            <Select id={`${ids}-category`} name="category" defaultValue="other" className={CONTROL}>
              {APPLICATION_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {t(`applications.categories.${option}`)}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>

        <div className="grid gap-5 md:grid-cols-2">
          <FieldRow icon={Monitor} tone="sky">
            <Field label={t('applications.form.portalName')} htmlFor={`${ids}-portal-name`}>
              <Input
                id={`${ids}-portal-name`}
                name="portalName"
                maxLength={160}
                value={portalName}
                onChange={(event) => setPortalName(event.target.value)}
                placeholder={t('applications.form.portalNamePlaceholder')}
                className={CONTROL}
              />
            </Field>
          </FieldRow>
          <FieldRow icon={FileText} tone="violet">
            <Field label={t('applications.form.formName')} htmlFor={`${ids}-form-name`}>
              <Input
                id={`${ids}-form-name`}
                name="formName"
                maxLength={160}
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder={t('applications.form.formNamePlaceholder')}
                className={CONTROL}
              />
            </Field>
          </FieldRow>
        </div>

        <FieldRow icon={Link2} tone="sky">
          <Field label={t('applications.form.portalUrl')} htmlFor={`${ids}-portal-url`}>
            <Input
              id={`${ids}-portal-url`}
              name="portalUrl"
              type="url"
              maxLength={500}
              placeholder={t('applications.form.portalUrlPlaceholder')}
              className={CONTROL}
            />
          </Field>
        </FieldRow>

        <div className="grid gap-5 md:grid-cols-3">
          <FieldRow icon={Calendar} tone="orange">
            <Field label={t('applications.form.deadline')} htmlFor={`${ids}-deadline`}>
              <Input id={`${ids}-deadline`} name="deadlineAt" type="date" className={CONTROL} />
            </Field>
          </FieldRow>
          <FieldRow icon={IndianRupee} tone="emerald">
            <Field label={t('applications.form.fee')} htmlFor={`${ids}-fee`}>
              <Input
                id={`${ids}-fee`}
                name="amountCharged"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={t('applications.form.feePlaceholder')}
                className={CONTROL}
              />
            </Field>
          </FieldRow>
          <FieldRow icon={CreditCard} tone="violet">
            <Field label={t('applications.form.paymentStatus')} htmlFor={`${ids}-payment`}>
              <Select
                id={`${ids}-payment`}
                name="paymentStatus"
                defaultValue=""
                className={CONTROL}
              >
                <option value="">{t('applications.form.paymentStatusPlaceholder')}</option>
                <option value="unpaid">{t('applications.payment.unpaid')}</option>
                <option value="paid">{t('applications.payment.paid')}</option>
                <option value="refunded">{t('applications.payment.refunded')}</option>
              </Select>
            </Field>
          </FieldRow>
        </div>

        <FieldRow icon={FileText} tone="orange">
          <Field label={t('applications.form.notes')} htmlFor={`${ids}-notes`}>
            <Textarea
              id={`${ids}-notes`}
              name="notes"
              rows={3}
              maxLength={APPLICATION_NOTES_MAX}
              onChange={(event) => setNotesLength(event.target.value.length)}
              placeholder={t('applications.form.notesPlaceholder')}
              aria-describedby={`${ids}-notes-count`}
              className="rounded-lg"
            />
            <p id={`${ids}-notes-count`} className="text-right text-xs text-slate-500">
              {t('applications.form.notesCount', {
                count: notesLength,
                max: APPLICATION_NOTES_MAX,
              })}
            </p>
          </Field>
        </FieldRow>

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={clearForm}
            disabled={pending !== null}
            className="h-11 rounded-lg bg-slate-100 px-5 hover:bg-slate-200"
          >
            <RotateCcw size={16} strokeWidth={1.8} aria-hidden />
            {t('applications.form.clear')}
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="secondary"
              loading={pending === 'draft'}
              disabled={pending !== null}
              className="h-11 rounded-lg px-5"
            >
              {pending === 'draft' ? null : (
                <FileText size={16} strokeWidth={1.8} aria-hidden className="text-brand-600" />
              )}
              {pending === 'draft'
                ? t('applications.form.savingDraft')
                : t('applications.form.saveDraft')}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="open"
              loading={pending === 'open'}
              disabled={pending !== null}
              className="h-11 rounded-lg px-6"
            >
              {pending === 'open' ? null : <Send size={16} strokeWidth={1.8} aria-hidden />}
              {pending === 'open' ? t('applications.form.creating') : t('applications.form.create')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
