'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BookUser,
  Check,
  ChevronRight,
  FileText,
  GraduationCap,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
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
  variant = 'grouped',
  className,
}: {
  categories: readonly PresetCategory[];
  value: string | null;
  onChange: (preset: RequirementPreset | null) => void;
  /**
   * `cards` lists every preset flat, one card per portal rule with the portal as its title — for
   * a category short enough (the PDF presets) that portal headings would each sit over one row.
   */
  variant?: 'grouped' | 'cards';
  className?: string;
}) {
  if (variant === 'cards') {
    return (
      <PresetCards
        categories={categories}
        value={value}
        onChange={onChange}
        className={className}
      />
    );
  }
  return (
    <GroupedPresetPicker
      categories={categories}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}

function GroupedPresetPicker({
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

/** A pictogram per portal family, keyed by the preset code's prefix. Anything else gets a page. */
const PORTAL_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  nsp: { icon: GraduationCap, tone: 'bg-sky-50 text-sky-600' },
  passport_seva: { icon: BookUser, tone: 'bg-rose-50 text-rose-600' },
  edistrict: { icon: FileText, tone: 'bg-violet-50 text-violet-600' },
};

const DEFAULT_PORTAL_ICON = { icon: FileText, tone: 'bg-slate-100 text-slate-600' };

function portalIcon(preset: RequirementPreset): { icon: LucideIcon; tone: string } {
  return PORTAL_ICONS[preset.code.split('.')[0] ?? ''] ?? DEFAULT_PORTAL_ICON;
}

function PresetCards({
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

  const presets = useMemo(
    () => searchPresets(query, presetsForCategory(categories)),
    [categories, query],
  );

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('documentTools.preset.searchPlaceholder')}
          aria-label={t('documentTools.preset.searchPlaceholder')}
          className="py-2 pl-9 text-sm"
        />
      </div>

      <div className="max-h-[46dvh] space-y-2 overflow-y-auto p-px pr-1">
        <PresetCard
          icon={SlidersHorizontal}
          tone="bg-brand-50 text-brand-600"
          title={t('documentTools.preset.custom')}
          subtitle={t('documentTools.preset.customHint')}
          selected={value === null}
          onSelect={() => onChange(null)}
        />

        {presets.length === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-500">{t('documentTools.preset.noMatch')}</p>
        ) : null}

        {presets.map((preset) => {
          const { icon, tone } = portalIcon(preset);
          const size = formatSizeWindow(preset);
          const unverified = preset.confidence === 'commonly_reported';
          return (
            <PresetCard
              key={preset.code}
              icon={icon}
              tone={tone}
              title={locale === 'hi' && preset.portalHi ? preset.portalHi : preset.portal}
              subtitle={locale === 'hi' && preset.labelHi ? preset.labelHi : preset.label}
              selected={preset.code === value}
              onSelect={() => onChange(preset)}
              tag={
                size ? (
                  // Amber is the "check this" flag from the grouped rows, folded into the size:
                  // the number is exactly the thing that may be out of date.
                  <span
                    title={unverified ? t('documentTools.preset.verify') : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums',
                      unverified ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {size}
                    {unverified ? (
                      <span className="sr-only"> · {t('documentTools.preset.verify')}</span>
                    ) : null}
                  </span>
                ) : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function PresetCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  tag,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  subtitle: string;
  tag?: ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span
        aria-hidden
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{subtitle}</span>
      </span>
      {tag}
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
