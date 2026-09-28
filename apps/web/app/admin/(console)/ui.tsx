import Link from 'next/link';
import { cn } from '@assistigo/ui';

/**
 * The console's primitives.
 *
 * Written dark-first. The light theme is not a second set of classes: inside `data-console-theme`
 * the slate and accent scales resolve to a mirrored palette, and cards, fields and menus use the
 * `console-*` surface colours (tailwind.config.ts). Keep to those — a light-first class such as
 * `bg-white` or `text-slate-900` would be wrong in one theme or the other.
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
 *
 * No hooks and no server-only imports, so everything here renders in Server and Client
 * Components alike.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-800/80 text-slate-300 ring-slate-700/80',
  info: 'bg-sky-500/10 text-sky-300 ring-sky-500/25',
  success: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  warning: 'bg-amber-500/10 text-amber-300 ring-amber-500/25',
  danger: 'bg-rose-500/10 text-rose-300 ring-rose-500/25',
  accent: 'bg-violet-500/10 text-violet-300 ring-violet-500/25',
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  accent: 'bg-violet-400',
};

const ACCENT_TEXT: Record<Tone, string> = {
  neutral: 'text-slate-50',
  info: 'text-sky-300',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-rose-300',
  accent: 'text-violet-300',
};

const ICON_WELL: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300',
  info: 'bg-sky-500/10 text-sky-300',
  success: 'bg-emerald-500/10 text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-300',
  danger: 'bg-rose-500/10 text-rose-300',
  accent: 'bg-violet-500/10 text-violet-300',
};

export function AdminBadge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  /** A leading status dot — for states (Active, Suspended) rather than labels. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />
      ) : null}
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
  icon,
  footer,
  flush = false,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  /** No body padding — for a table that should run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-slate-800/80 bg-console-surface shadow-sm shadow-console-shadow/5',
        className,
      )}
    >
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800/80 px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300 [&_svg]:h-4 [&_svg]:w-4">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className={flush ? '' : 'p-5'}>{children}</div> : null}
      {footer ? (
        <footer className="border-t border-slate-800/80 bg-slate-900/30 px-5 py-3 text-xs text-slate-400">
          {footer}
        </footer>
      ) : null}
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
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  /** Makes the whole tile a link to the screen that explains the number. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-400">{label}</div>
        {icon ? (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4',
              ICON_WELL[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums tracking-tight',
          ACCENT_TEXT[tone],
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs leading-snug text-slate-500">{hint}</div> : null}
    </>
  );

  const frame =
    'block rounded-xl border border-slate-800/80 bg-console-surface px-4 py-3.5 shadow-sm shadow-console-shadow/5';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          frame,
          'transition-colors hover:border-slate-700 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={frame}>{body}</div>;
}

export function AdminTable({
  head,
  children,
  empty,
  minWidth = 640,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  empty?: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead className="border-b border-slate-800/80 bg-slate-900/40 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {head}
        </thead>
        <tbody className="divide-y divide-slate-800/60">{children}</tbody>
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
    <th colSpan={colSpan} className={cn('px-4 py-2.5 font-medium', className)}>
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
    <td colSpan={colSpan} className={cn('px-4 py-3 align-middle text-slate-300', className)}>
      {children}
    </td>
  );
}

export function AdminEmpty({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
  icon,
  meta,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  /** A row of badges or facts under the title — status, plan, dates. */
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">{description}</p>
          ) : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  title?: string;
}) {
  const border: Record<Tone, string> = {
    neutral: 'border-slate-800 bg-slate-900/50 text-slate-400',
    info: 'border-sky-900/80 bg-sky-950/30 text-sky-200',
    success: 'border-emerald-900/80 bg-emerald-950/30 text-emerald-200',
    warning: 'border-amber-900/80 bg-amber-950/30 text-amber-200',
    danger: 'border-rose-900/80 bg-rose-950/30 text-rose-200',
    accent: 'border-violet-900/80 bg-violet-950/30 text-violet-200',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed',
        border[tone],
      )}
    >
      {icon ? <span className="mt-px shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      <div className="min-w-0">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Initials in a tinted circle, for an email or a centre name. Decorative: always beside the text. */
export function AdminAvatar({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const words = label
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = (
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : label.slice(0, 2)
  ).toUpperCase();

  // A stable hue per label, so the same centre is the same colour on every screen.
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const palette = [
    'bg-sky-500/15 text-sky-300',
    'bg-violet-500/15 text-violet-300',
    'bg-emerald-500/15 text-emerald-300',
    'bg-amber-500/15 text-amber-300',
    'bg-rose-500/15 text-rose-300',
    'bg-cyan-500/15 text-cyan-300',
  ];
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' };

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        sizes[size],
        palette[hash % palette.length],
      )}
    >
      {initials}
    </span>
  );
}

/** A labelled share of a whole, for "published of total" style facts. */
export function AdminProgress({
  label,
  value,
  total,
  tone = 'info',
  format = String,
}: {
  label: string;
  value: number;
  total: number;
  tone?: Tone;
  format?: (value: number) => string;
}) {
  const percent = total > 0 ? Math.min(Math.round((value / total) * 100), 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-300">
          {format(value)} <span className="text-slate-600">/ {format(total)}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full', DOT_CLASSES[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** A definition list of facts, for detail pages. */
export function AdminKeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-1 truncate text-sm text-slate-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Server-rendered filter tabs: each is a link, so the filter lives in the URL and survives a
 * reload, a shared link and the back button.
 */
export function AdminFilterTabs({
  items,
  label,
}: {
  items: { label: string; href: string; active: boolean; count?: number }[];
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-lg bg-slate-900/70 p-1 ring-1 ring-inset ring-slate-800"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            item.active
              ? 'bg-slate-700/70 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="tabular-nums text-slate-500">{item.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function AdminPagination({
  summary,
  previousHref,
  nextHref,
  previousLabel,
  nextLabel,
}: {
  summary: string;
  previousHref: string | null;
  nextHref: string | null;
  previousLabel: string;
  nextLabel: string;
}) {
  const link =
    'rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800';
  const disabled =
    'cursor-not-allowed rounded-md border border-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-600';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 px-5 py-3 text-xs text-slate-500">
      <span>{summary}</span>
      <div className="flex gap-2">
        {previousHref ? (
          <Link href={previousHref} className={link}>
            {previousLabel}
          </Link>
        ) : (
          <span className={disabled}>{previousLabel}</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={link}>
            {nextLabel}
          </Link>
        ) : (
          <span className={disabled}>{nextLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const CONTROL_BASE =
  'w-full rounded-lg border border-slate-700/80 bg-console-field px-3 py-2 text-sm text-slate-100 shadow-sm placeholder:text-slate-600 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 disabled:opacity-50';

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
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-sky-600 text-white shadow-sm hover:bg-sky-500 disabled:bg-sky-900 disabled:text-slate-400',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50',
  outline:
    'border border-slate-700 bg-console-field text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50',
  ghost: 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500 disabled:opacity-50',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed [&_svg]:h-4 [&_svg]:w-4';

export function AdminButton({
  variant = 'secondary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} />;
}

/** A link styled as a button — navigation, not an action, so it stays an `<a>`. */
export function AdminLinkButton({
  href,
  variant = 'secondary',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}>
      {children}
    </Link>
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
        className="h-4 w-4 rounded border-slate-600 bg-console-field text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
      />
      {label}
    </label>
  );
}
