import {
  forwardRef,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';

/**
 * Direct-manipulation controls for the document tool editors (spec §13).
 *
 * The forms elsewhere in the dashboard are type-and-submit; a tool editor is drag-and-see. So
 * these primitives share two properties the form primitives do not need:
 *
 *   - they report continuously, because the preview has to follow the operator's thumb,
 *   - they show their current value on the control itself, because "how many KB is that" is the
 *     question the operator is actually asking while they drag.
 *
 * All of them are native elements underneath. A slider that is a native `<input type="range">`
 * responds to arrow keys, Home and End without any code, which matters: an operator sizing a
 * photo to exactly 47 KB nudges rather than drags.
 */

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  label: string;
  value: number;
  /** Rendered next to the label — "47 KB", "300 DPI", "+12°". */
  valueLabel?: string;
  hint?: string;
  /** Resets to this value when the label's value badge is double-clicked. */
  defaultValue?: number;
  /** Label, track and value on one row — for a rail of several sliders. */
  inline?: boolean;
  onValueChange: (value: number) => void;
};

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    value,
    valueLabel,
    hint,
    min = 0,
    max = 100,
    step = 1,
    className,
    onValueChange,
    defaultValue,
    inline = false,
    disabled,
    ...props
  },
  ref,
) {
  const id = useId();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    onValueChange(Number(event.target.value));

  const labelNode = (
    <label
      htmlFor={id}
      className={cn('text-xs font-medium text-slate-700', inline && 'w-20 shrink-0')}
    >
      {label}
    </label>
  );

  // Double-click to reset is the convention every image editor uses, and it is a shortcut
  // rather than the only way back — the slider still works.
  const valueNode = valueLabel ? (
    <button
      type="button"
      onDoubleClick={defaultValue === undefined ? undefined : () => onValueChange(defaultValue)}
      className={cn(
        'cursor-default rounded px-1 text-xs font-semibold tabular-nums text-slate-900',
        inline && 'w-12 shrink-0 text-right',
      )}
      tabIndex={-1}
      aria-hidden
    >
      {valueLabel}
    </button>
  ) : null;

  const hintNode = hint ? (
    <p className="text-[11px] leading-tight text-slate-500">{hint}</p>
  ) : null;

  const input = (
    <input
      ref={ref}
      id={id}
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={handleChange}
      className={cn(
        'h-4 w-full cursor-pointer appearance-none bg-transparent',
        '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
        '[&::-webkit-slider-runnable-track]:bg-slate-200',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4',
        '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:-mt-[5px]',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600',
        '[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-2',
        '[&::-webkit-slider-thumb]:ring-white',
        '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full',
        '[&::-moz-range-track]:bg-slate-200',
        '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:border-0',
        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand-600',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
        inline && 'min-w-0 flex-1',
      )}
      {...props}
    />
  );

  if (inline) {
    return (
      <div className={cn('space-y-0.5', className)}>
        <div className="flex items-center gap-3">
          {labelNode}
          {input}
          {valueNode}
        </div>
        {hintNode}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        {labelNode}
        {valueNode}
      </div>
      {input}
      {hintNode}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export type SwitchProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
};

/** A labelled on/off toggle. A real checkbox underneath, so it is keyboard- and form-native. */
export function Switch({
  label,
  checked,
  onCheckedChange,
  hint,
  disabled,
  className,
}: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm text-slate-800">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** Shown as a tooltip; keep it short. */
  title?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  /** Announced to screen readers as the group's purpose. */
  ariaLabel: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Two to four mutually exclusive choices, all visible at once.
 *
 * Preferred over a `<select>` wherever the options fit, because an operator switching between
 * "Photo" and "Signature" forty times a day should not open a menu to do it.
 */
export function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onValueChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'rounded-md font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
              'focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type TabItem<T extends string> = { value: T; label: string; badge?: ReactNode };

export function Tabs<T extends string>({
  ariaLabel,
  items,
  value,
  onValueChange,
  className,
}: {
  ariaLabel: string;
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1 border-b border-slate-200', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-brand-600',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number field with units
// ---------------------------------------------------------------------------

export type NumberFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  label: string;
  value: number | '';
  unit?: string;
  onValueChange: (value: number | '') => void;
};

/**
 * A number input with its unit shown inside the field.
 *
 * Empty string is a first-class value: an operator clearing the width to retype it must not have
 * the field snap to 0 and the preview collapse mid-keystroke.
 */
export function NumberField({
  label,
  value,
  unit,
  onValueChange,
  className,
  ...props
}: NumberFieldProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(event) =>
            onValueChange(event.target.value === '' ? '' : Number(event.target.value))
          }
          className={cn(
            'block w-full rounded-md border-0 bg-white py-1.5 pl-2.5 text-sm text-slate-900',
            'shadow-sm ring-1 ring-inset ring-slate-300 tabular-nums',
            'focus:ring-2 focus:ring-inset focus:ring-brand-600',
            'disabled:bg-slate-50 disabled:text-slate-500',
            unit ? 'pr-10' : 'pr-2.5',
          )}
          {...props}
        />
        {unit ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400"
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Size meter
// ---------------------------------------------------------------------------

export type SizeMeterProps = {
  /** 0–1 position inside the window, or `null` when there is no window to show. */
  position: number | null;
  verdict: 'ok' | 'too_small' | 'too_large' | 'unknown';
  /** "20–50 KB" */
  windowLabel?: string | null;
  /** "47 KB" */
  valueLabel: string;
  /** Localised verdict text. */
  verdictLabel?: string;
  className?: string;
};

const VERDICT_STYLES: Record<SizeMeterProps['verdict'], { bar: string; text: string }> = {
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  too_small: { bar: 'bg-amber-500', text: 'text-amber-700' },
  too_large: { bar: 'bg-red-500', text: 'text-red-700' },
  unknown: { bar: 'bg-slate-400', text: 'text-slate-600' },
};

/**
 * Where the produced file sits inside the portal's KB window.
 *
 * A bar rather than a number alone, because the useful question is not "how big is it" but "is
 * there room to move". An operator who can see they are at the top of the window knows to expect
 * a rejection if they add a name stamp.
 */
export function SizeMeter({
  position,
  verdict,
  windowLabel,
  valueLabel,
  verdictLabel,
  className,
}: SizeMeterProps) {
  const styles = VERDICT_STYLES[verdict];
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn('font-semibold tabular-nums', styles.text)}>{valueLabel}</span>
        {windowLabel ? <span className="text-slate-500 tabular-nums">{windowLabel}</span> : null}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn('h-full rounded-full transition-all', styles.bar)}
          style={{ width: `${Math.round((position ?? (verdict === 'too_large' ? 1 : 0.06)) * 100)}%` }}
        />
      </div>
      {verdictLabel ? (
        <p className={cn('text-[11px] leading-tight', styles.text)} role="status">
          {verdictLabel}
        </p>
      ) : null}
    </div>
  );
}
