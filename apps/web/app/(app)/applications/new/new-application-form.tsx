'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Field, Input, Select, TextField, Textarea } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { APPLICATION_CATEGORIES } from '@/lib/applications/schema';

type CustomerOption = { id: string; full_name: string; customer_code: string };
type SearchResult = { id: string; displayName: string; customerCode: string };
type AdapterOption = { id: string; portalName: string; formName: string };

export function NewApplicationForm({
  adapters,
  preselectedCustomer,
  defaultPortalAdapterId,
  defaultPortalName,
  defaultFormName,
}: {
  adapters: AdapterOption[];
  preselectedCustomer: CustomerOption | null;
  defaultPortalAdapterId?: string;
  defaultPortalName?: string;
  defaultFormName?: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerOption | null>(preselectedCustomer);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<SearchResult[] | null>(null);
  const [portalAdapterId, setPortalAdapterId] = useState(defaultPortalAdapterId ?? '');
  const [pending, setPending] = useState(false);
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
        .then((body: { data: { customers: SearchResult[] } }) => setCustomerResults(body.data.customers))
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) {
      setError('applications.form.customer');
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

    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as
        | { data: { application: { id: string } } }
        | { error: { messageKey: string } };
      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }
      router.push(`/applications/${json.data.application.id}`);
    } catch {
      setError('errors.internal');
      setPending(false);
    }
  }

  return (
    <Card>
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}

        <Field label={t('applications.form.customer')} hint={t('applications.form.customerHint')} required>
          {customer ? (
            <div className="flex items-center justify-between rounded-md border border-slate-300 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{customer.full_name}</p>
                <p className="font-mono text-xs text-slate-500">{customer.customer_code}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCustomer(null)}>
                {t('common.edit')}
              </Button>
            </div>
          ) : (
            <div className="relative space-y-2">
              <Input
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder={t('customers.searchPlaceholder')}
              />
              {customerResults !== null ? (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                  {customerResults.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">{t('customers.empty')}</li>
                  ) : (
                    customerResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => {
                            setCustomer({
                              id: result.id,
                              full_name: result.displayName,
                              customer_code: result.customerCode,
                            });
                            setCustomerResults(null);
                          }}
                        >
                          <span className="text-sm text-slate-900">{result.displayName}</span>
                          <Badge tone="neutral">{result.customerCode}</Badge>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          )}
        </Field>

        <Field label={t('applications.form.portalAdapter')}>
          <Select value={portalAdapterId} onChange={(event) => setPortalAdapterId(event.target.value)}>
            <option value="">{t('applications.form.portalAdapterNone')}</option>
            {adapters.map((adapter) => (
              <option key={adapter.id} value={adapter.id}>
                {adapter.portalName} — {adapter.formName}
              </option>
            ))}
          </Select>
        </Field>

        <TextField
          name="title"
          required
          label={t('applications.form.titleLabel')}
          placeholder={t('applications.form.titlePlaceholder')}
          defaultValue={defaultFormName ?? ''}
        />

        <Field label={t('applications.form.category')}>
          <Select name="category" defaultValue="other">
            {APPLICATION_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {t(`applications.categories.${option}`)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="portalName"
            label={t('applications.form.portalName')}
            defaultValue={defaultPortalName ?? ''}
          />
          <TextField name="formName" label={t('applications.form.formName')} defaultValue={defaultFormName ?? ''} />
        </div>

        <TextField name="portalUrl" type="url" label={t('applications.form.portalUrl')} />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="deadlineAt" type="date" label={t('applications.form.deadline')} />
          <TextField name="amountCharged" type="number" min="0" step="0.01" label={t('applications.form.fee')} />
          <Field label={t('applications.form.paymentStatus')}>
            <Select name="paymentStatus" defaultValue="">
              <option value="">—</option>
              <option value="unpaid">{t('applications.payment.unpaid')}</option>
              <option value="paid">{t('applications.payment.paid')}</option>
              <option value="refunded">{t('applications.payment.refunded')}</option>
            </Select>
          </Field>
        </div>

        <Field label={t('applications.form.notes')}>
          <Textarea name="notes" />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {pending ? t('applications.form.creating') : t('applications.form.create')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
