'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@assistigo/ui';
import { TAB_PARAM } from './detail-card';

export type TargetOption = { id: string; kind: 'form' | 'scheme'; label: string };

/** Must match `CHECKLIST_TARGET_PARAM` in lib/documents/checklist.ts (a server-only module). */
const TARGET_PARAM = 'for';

/**
 * The "Preparing for" choice lives in the URL, so a refresh or a shared link reopens the same
 * checklist. Picking one re-renders the server card; nothing about the customer is computed here.
 */
export function ChecklistTargetPicker({
  options,
  value,
  label,
  placeholder,
  formsLabel,
  schemesLabel,
}: {
  options: TargetOption[];
  value: string;
  label: string;
  placeholder: string;
  formsLabel: string;
  schemesLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(TAB_PARAM, 'documents');
    if (next) params.set(TARGET_PARAM, next);
    else params.delete(TARGET_PARAM);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const forms = options.filter((option) => option.kind === 'form');
  const schemes = options.filter((option) => option.kind === 'scheme');

  return (
    <div className="space-y-1.5">
      <label htmlFor="checklist-target" className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <Select
        id="checklist-target"
        value={value}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {forms.length > 0 ? (
          <optgroup label={formsLabel}>
            {forms.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {schemes.length > 0 ? (
          <optgroup label={schemesLabel}>
            {schemes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </Select>
    </div>
  );
}
