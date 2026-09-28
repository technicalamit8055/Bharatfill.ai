'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, CircleCheck, Database, Eye, EyeOff, Search } from 'lucide-react';
import { cn } from '@assistigo/ui';
import type { AdapterField } from '@assistigo/form-engine';
import { useTranslations } from '@/lib/i18n/client';
import { CopyButton } from './copy-button';

/** Rows shown before "Show more": enough to judge the mapping without a wall of Hindi labels. */
const COLLAPSED_ROWS = 10;

const ICON_ACTION =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

/** What the operator reads the field as: the first label the portal prints, else the adapter key. */
function portalLabel(field: AdapterField): string {
  return field.labelPatterns?.[0] ?? field.key;
}

function matches(field: AdapterField, q: string): boolean {
  return [field.key, field.customerField, ...(field.labelPatterns ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function FieldMappingCard({
  fields,
  version,
}: {
  fields: readonly AdapterField[];
  version: string;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  // Numbered by position in the adapter, so "field 07" means the same row with or without a search.
  const numbered = useMemo(() => fields.map((field, index) => ({ field, number: index + 1 })), [fields]);
  const filtered = q ? numbered.filter(({ field }) => matches(field, q)) : numbered;
  // A search shows every hit: hiding a match behind "Show more" would read as "not mapped".
  const visible = q || expanded ? filtered : filtered.slice(0, COLLAPSED_ROWS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100"
          >
            <Database size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t('formLibrary.detail.fieldMappings')}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {t('formLibrary.detail.version')}: {version}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <CircleCheck size={14} strokeWidth={2.2} aria-hidden />
            {t(
              fields.length === 1
                ? 'formLibrary.detail.fieldsMappedOne'
                : 'formLibrary.detail.fieldsMapped',
              { count: fields.length },
            )}
          </span>
          {fields.length > 0 ? (
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">{t('formLibrary.detail.searchFieldsLabel')}</span>
              <Search
                size={16}
                strokeWidth={2}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('formLibrary.detail.searchFields')}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          ) : null}
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">—</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="w-14 px-4 py-3">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('formLibrary.detail.fieldPortalLabel')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('formLibrary.detail.customerField')}
                </th>
                <th scope="col" className="w-28 px-4 py-3">
                  {t('formLibrary.detail.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('formLibrary.detail.noFieldMatch')}
                  </td>
                </tr>
              ) : null}
              {visible.map(({ field, number }) => {
                const label = portalLabel(field);
                const open = openKey === field.key;
                const rulesId = `field-rules-${field.key}`;
                return (
                  <Fragment key={field.key}>
                    <tr className={cn('transition-colors hover:bg-slate-50/60', open && 'bg-brand-50/40')}>
                      <td className="px-4 py-3 tabular-nums text-slate-400">
                        {String(number).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{label}</td>
                      <td className="px-4 py-3">
                        <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                          {field.customerField}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CopyButton
                            value={field.customerField}
                            label={t('formLibrary.detail.copyFieldKey', { field: field.customerField })}
                          />
                          <button
                            type="button"
                            onClick={() => setOpenKey(open ? null : field.key)}
                            aria-expanded={open}
                            aria-controls={rulesId}
                            aria-label={t(
                              open ? 'formLibrary.detail.hideRules' : 'formLibrary.detail.showRules',
                              { field: label },
                            )}
                            title={t(
                              open ? 'formLibrary.detail.hideRules' : 'formLibrary.detail.showRules',
                              { field: label },
                            )}
                            className={cn(ICON_ACTION, open && 'border-brand-300 bg-brand-50')}
                          >
                            {open ? (
                              <EyeOff size={16} strokeWidth={2} aria-hidden />
                            ) : (
                              <Eye size={16} strokeWidth={2} aria-hidden />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr id={rulesId} className="bg-brand-50/40">
                        <td />
                        <td colSpan={3} className="px-4 pb-4 pt-1">
                          <FieldRules field={field} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!q && filtered.length > COLLAPSED_ROWS ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {expanded
              ? t('formLibrary.detail.showFewerFields')
              : t('formLibrary.detail.showMoreFields', { count: hiddenCount })}
            <ChevronDown
              size={16}
              strokeWidth={2}
              aria-hidden
              className={cn('transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** How the extension finds this field on the page. Adapter configuration only — no customer data. */
function FieldRules({ field }: { field: AdapterField }) {
  const t = useTranslations();
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-white p-4 text-xs ring-1 ring-slate-100 sm:grid-cols-2">
      <RuleItem label={t('formLibrary.detail.adapterKey')}>
        <code className="font-mono text-slate-700">{field.key}</code>
      </RuleItem>
      <RuleItem label={t('formLibrary.detail.inputType')}>
        <span className="text-slate-700">{field.inputType}</span>
        {field.required ? <span className="text-slate-500"> · {t('common.required')}</span> : null}
      </RuleItem>
      {field.labelPatterns?.length ? (
        <RuleItem label={t('formLibrary.detail.labelPatterns')} wide>
          <PatternList patterns={field.labelPatterns} />
        </RuleItem>
      ) : null}
      {field.negativePatterns?.length ? (
        <RuleItem label={t('formLibrary.detail.negativePatterns')} wide>
          <PatternList patterns={field.negativePatterns} muted />
        </RuleItem>
      ) : null}
      {field.selector ? (
        <RuleItem label={t('formLibrary.detail.selector')} wide>
          <code className="break-all font-mono text-slate-700">{field.selector}</code>
        </RuleItem>
      ) : null}
      {field.dependsOn ? (
        <RuleItem label={t('formLibrary.detail.dependsOn')}>
          <code className="font-mono text-slate-700">{field.dependsOn}</code>
        </RuleItem>
      ) : null}
      {field.reviewRequired ? (
        <p className="font-medium text-amber-700 sm:col-span-2">
          {t('formLibrary.detail.alwaysReviewed')}
        </p>
      ) : null}
    </dl>
  );
}

function RuleItem({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function PatternList({ patterns, muted = false }: { patterns: readonly string[]; muted?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {patterns.map((pattern) => (
        <li
          key={pattern}
          className={cn(
            'rounded-md px-2 py-0.5 ring-1',
            muted ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-brand-50 text-brand-800 ring-brand-100',
          )}
        >
          {pattern}
        </li>
      ))}
    </ul>
  );
}
