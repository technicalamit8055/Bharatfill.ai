/**
 * Date-time formatting for the console.
 *
 * Always Asia/Kolkata, never the server's zone: the console is rendered on a server whose clock
 * may be UTC, and "14:05" on an audit row has to mean the same minute to every reader.
 */
export function formatConsoleDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** "3 min ago" style, for activity feeds where the order matters more than the minute. */
export function formatRelative(iso: string, locale: string, now = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    numeric: 'auto',
  });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return format.format(Math.round(seconds / 86_400), 'day');
  return formatConsoleDateTime(iso, locale);
}
