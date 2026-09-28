'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Badge, Input, cn } from '@assistigo/ui';
import {
  formatDimension,
  formatSizeWindow,
  groupPresetsByPortal,
  presetsForCategory,
  searchPresets,
  type PresetCategory,
  type RequirementPreset,
} from '@assistigo/document-tools';
import { useI18n, useTranslations } from '@/lib/i18n/client';

/**
 * Choosing a portal's rule.
 *
 * Searchable and grouped rather than a flat `<select>`: there are thirty-odd presets and an
 * operator knows the exam ("cgl", "neet") sooner than the authority that runs it.
 *
 * Two things are shown on every row on purpose, and neither is decoration:
 *
 *   - the KB window and the dimension, so the operator can compare against the notice on their
 *     other screen without selecting anything first,
 *   - a "check this" flag on any preset whose numbers were not read off a current notice. Portal
 *     limits change between recruitment cycles, and a confidently wrong 20–50 KB is how an
 *     application gets rejected for a reason nobody can see.
 */
export function PresetPicker({
  categories,
  value,
  onChange,
  className,
}: {
  categories: readonly PresetCategory[];
  value: string | null;
  onChange: (preset: RequirementPreset | null) => void;
  className?: string;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const scoped = presetsForCategory(categories);
    return groupPresetsByPortal(searchPresets(query, scoped));
  }, [categories, query]);

  const total = groups.reduce((sum, group) => sum + group.presets.length, 0);

  return (
    <div className={cn('space-y-2', className)}>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('documentTools.preset.searchPlaceholder')}
        aria-label={t('documentTools.preset.searchPlaceholder')}
        className="py-1.5 text-sm"
      />

      <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-0.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={cn(
            'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
            value === null
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300',
          )}
        >
          <span className="block text-sm font-medium text-slate-900">
            {t('documentTools.preset.custom')}
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
            {t('documentTools.preset.customHint')}
          </span>
        </button>

        {total === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-500">{t('documentTools.preset.noMatch')}</p>
        ) : null}

        {groups.map((group) => (
          <div key={group.portal}>
            <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {locale === 'hi' && group.portalHi ? group.portalHi : group.portal}
            </p>
            <div className="space-y-1">
              {group.presets.map((preset) => (
                <PresetRow
                  key={preset.code}
                  preset={preset}
                  selected={preset.code === value}
                  onSelect={() => onChange(preset)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetRow({
  preset,
  selected,
  onSelect,
}: {
  preset: RequirementPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const { locale } = useI18n();
  const size = formatSizeWindow(preset);
  const dimension = formatDimension(preset);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
        selected
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-medium text-slate-900">
            {locale === 'hi' && preset.labelHi ? preset.labelHi : preset.label}
          </span>
          {preset.confidence === 'commonly_reported' ? (
            <Badge tone="warning" className="shrink-0 text-[10px]">
              {t('documentTools.preset.verify')}
            </Badge>
          ) : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-slate-600">
          {size ? <span className="rounded-md bg-slate-100 px-2 py-0.5">{size}</span> : null}
          {dimension ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5">{dimension}</span>
          ) : null}
          {preset.requiresNameDateStamp ? (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
              {t('documentTools.preset.needsStamp')}
            </span>
          ) : null}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-slate-200 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-800',
        )}
      >
        {selected ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        )}
      </span>
    </button>
  );
}

/** The selected preset's caveats and provenance, shown once rather than on every row. */
export function PresetNotes({ preset }: { preset: RequirementPreset | null }) {
  const t = useTranslations();
  const { locale } = useI18n();
  if (!preset) return null;

  const notes = locale === 'hi' && preset.notesHi ? preset.notesHi : preset.notes;

  return (
    <div className="space-y-1.5 rounded-md bg-slate-50 px-2.5 py-2">
      {notes ? <p className="text-[11px] leading-snug text-slate-600">{notes}</p> : null}
      <p className="text-[11px] leading-snug text-slate-400">
        {t('documentTools.preset.source', { source: preset.source })}
      </p>
    </div>
  );
}
