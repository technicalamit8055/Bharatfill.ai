import { cn } from '@assistigo/ui';

/**
 * The admin panel's dark primitives.
 *
 * Deliberately local rather than an extension of `@assistigo/ui`. That package is the *operator's*
 * design system — light, roomy, forgiving, built for someone working a counter with a citizen
 * waiting. This panel is the opposite context: internal staff, dense tables, a screen you keep
 * open all day. Bending the shared components to serve both would make every future change to
 * either a negotiation.
 *
 * The visual separation is also functional. An employee who can reach both surfaces should never
 * be in doubt about which one they are editing in, because the mistakes available here are
 * platform-wide.
 */

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300 ring-slate-700',
  info: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  success: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  danger: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
};

export function AdminBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminCard({
  children,
  className,
  title,
  description,
  actions,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={cn('rounded-lg border border-slate-800 bg-slate-900/60 shadow-sm', className)}
    >
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="p-4">{children}</div> : null}
    </section>
  );
}

/**
 * A single metric.
 *
 * `hint` carries the caveat rather than a tooltip, because a number on this page with an unstated
 * denominator is how "active tenants" quietly comes to mean something different to each reader.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    neutral: 'text-slate-100',
    info: 'text-sky-300',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300',
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', accent[tone])}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function AdminTable({
  head,
  children,
  empty,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
          {head}
        </thead>
        <tbody className="divide-y divide-slate-800/80">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function TH({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <th colSpan={colSpan} className={cn('px-3 py-2 font-medium', className)}>
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn('px-3 py-2 align-middle text-slate-300', className)}>
      {children}
    </td>
  );
}

export function AdminEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * A message that is neither an error nor a success — a stated constraint.
 *
 * Used where the panel has to explain why something is not going to happen: outbound fetching is
 * off, a role cannot review, tenant data stops at aggregates. These are the notes that keep an
 * employee from filing a bug against a deliberate decision.
 */
export function AdminNote({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  const border: Record<Tone, string> = {
    neutral: 'border-slate-700 bg-slate-900/60 text-slate-400',
    info: 'border-sky-800 bg-sky-950/40 text-sky-200',
    success: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
    warning: 'border-amber-800 bg-amber-950/40 text-amber-200',
    danger: 'border-rose-800 bg-rose-950/40 text-rose-200',
  };
  return (
    <div className={cn('rounded-md border px-3 py-2 text-xs leading-relaxed', border[tone])}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
//
// No hooks and no server-only imports, so these render in both Server Components (the deadline
// grid) and Client Components (the scheme editor) without a second dark-themed copy.
// ---------------------------------------------------------------------------

const CONTROL_BASE =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none disabled:opacity-50';

export function AdminField({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-400">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}

export function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL_BASE, props.className)} />;
}

export function AdminTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL_BASE, 'font-mono', props.className)} />;
}

export function AdminSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL_BASE, props.className)} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-500 disabled:bg-sky-900 disabled:text-slate-400',
  secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50',
  ghost: 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50',
  danger: 'bg-rose-600/90 text-white hover:bg-rose-500 disabled:opacity-50',
};

export function AdminButton({
  variant = 'secondary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function AdminCheckbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-slate-300', className)}>
      <input
        {...props}
        type="checkbox"
        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
      />
      {label}
    </label>
  );
}
