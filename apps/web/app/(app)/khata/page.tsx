import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import {
  formatBillNumber,
  formatRupees,
  istDayRange,
  istToday,
  khataDaySchema,
  shiftIstDay,
  tallyDay,
} from '@assistigo/core';
import { requirePagePermission } from '@/lib/auth/session';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isKhataSchemaMissing, loadDayLedger, loadOutstanding } from '@/lib/khata/service';

export const metadata = { title: 'Khata' };

/**
 * The counter's cash book (migration 0050): what came in on one IST day, split the way the
 * operator counts it at closing — the drawer, the UPI app, refunds — and the udhar still owed.
 * Read-only: money is recorded on the application it belongs to.
 */
export default async function KhataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission('application.view');
  const { t, locale } = await getTranslations();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const today = istToday();
  const requested = typeof params.date === 'string' ? params.date : today;
  const parsed = khataDaySchema.safeParse(requested);
  const day = parsed.success && requested <= today ? requested : today;
  const range = istDayRange(day) ?? istDayRange(today);
  if (!range) throw new Error('khata: no IST range for today');

  let entries: Awaited<ReturnType<typeof loadDayLedger>>;
  let outstanding: Awaited<ReturnType<typeof loadOutstanding>>;
  try {
    [entries, outstanding] = await Promise.all([
      loadDayLedger(supabase, session.organization.id, range),
      loadOutstanding(supabase, session.organization.id),
    ]);
  } catch (error) {
    // Migration 0050 not applied yet: say so instead of crashing the page.
    if (!isKhataSchemaMissing(error)) throw error;
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-slate-900">{t('khata.title')}</h1>
        <Alert tone="info">{t('khata.notReady')}</Alert>
      </div>
    );
  }

  const tally = tallyDay(entries);
  const udharTotal =
    outstanding.rows.reduce((sum, row) => sum + Math.round(row.due * 100), 0) / 100;
  const previous = shiftIstDay(day, -1);
  const next = day < today ? shiftIstDay(day, 1) : null;
  const intlLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const dayLabel = new Intl.DateTimeFormat(intlLocale, {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(range.start));
  const time = new Intl.DateTimeFormat(intlLocale, {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
  const shortDate = new Intl.DateTimeFormat(intlLocale, {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });

  const tiles: { key: string; label: string; value: string; hint?: string; tone?: string }[] = [
    { key: 'cash', label: t('khata.tally.cash'), value: formatRupees(tally.cash) },
    { key: 'upi', label: t('khata.tally.upi'), value: formatRupees(tally.upi) },
    ...(tally.other !== 0
      ? [{ key: 'other', label: t('khata.tally.other'), value: formatRupees(tally.other) }]
      : []),
    {
      key: 'net',
      label: t('khata.tally.net'),
      value: formatRupees(tally.net),
      hint: t('khata.tally.entries', { payments: tally.payments, refunds: tally.refundCount }),
      tone: 'text-emerald-700',
    },
    {
      key: 'refunds',
      label: t('khata.tally.refunds'),
      value: formatRupees(tally.refunds),
    },
    {
      key: 'udhar',
      label: t('khata.tally.udhar'),
      value: formatRupees(udharTotal),
      hint: t('khata.tally.udharCount', { count: outstanding.rows.length }),
      tone: udharTotal > 0 ? 'text-amber-700' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('khata.title')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('khata.subtitle')}</p>
        </div>
        <nav className="flex items-center gap-2 text-sm" aria-label={t('khata.dayNav')}>
          {previous ? (
            <Link
              href={`/khata?date=${previous}`}
              className="rounded-md px-2.5 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              ← {t('khata.previousDay')}
            </Link>
          ) : null}
          <form action="/khata" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={day}
              max={today}
              aria-label={t('khata.pickDay')}
              className="h-8 rounded-md border border-slate-300 px-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md px-2.5 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              {t('khata.go')}
            </button>
          </form>
          {next ? (
            <Link
              href={next === today ? '/khata' : `/khata?date=${next}`}
              className="rounded-md px-2.5 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              {t('khata.nextDay')} →
            </Link>
          ) : null}
        </nav>
      </div>

      <section aria-labelledby="khata-day">
        <h2 id="khata-day" className="mb-3 text-sm font-medium text-slate-700">
          {day === today ? t('khata.today', { date: dayLabel }) : dayLabel}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {tile.label}
              </p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${tile.tone ?? 'text-slate-900'}`}
              >
                {tile.value}
              </p>
              {tile.hint ? <p className="mt-0.5 text-xs text-slate-500">{tile.hint}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <Card title={t('khata.dayEntries')}>
        {entries.length === 0 ? (
          <EmptyState title={t('khata.dayEmpty')} description={t('khata.dayEmptyHint')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('khata.col.time')}</TH>
                <TH>{t('khata.col.customer')}</TH>
                <TH>{t('khata.col.application')}</TH>
                <TH>{t('khata.col.method')}</TH>
                <TH className="text-right">{t('khata.col.amount')}</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((entry) => (
                <TR key={entry.id}>
                  <TD className="whitespace-nowrap tabular-nums text-slate-500">
                    {time.format(new Date(entry.createdAt))}
                  </TD>
                  <TD>{entry.customerName ?? '—'}</TD>
                  <TD>
                    <Link
                      href={`/applications/${entry.applicationId}`}
                      className="text-brand-700 hover:underline"
                    >
                      {entry.applicationTitle ?? '—'}
                    </Link>
                    {entry.billNumber ? (
                      <span className="ml-1.5 text-xs text-slate-500">
                        {formatBillNumber(entry.billNumber)}
                      </span>
                    ) : null}
                    {entry.note ? <p className="text-xs text-slate-500">{entry.note}</p> : null}
                  </TD>
                  <TD>
                    <Badge tone={entry.kind === 'refund' ? 'danger' : 'neutral'}>
                      {entry.kind === 'refund' ? `${t('khata.refund')} · ` : ''}
                      {t(`khata.method.${entry.method}`)}
                    </Badge>
                  </TD>
                  <TD
                    className={`text-right tabular-nums ${entry.kind === 'refund' ? 'text-red-700' : 'text-slate-900'}`}
                  >
                    {entry.kind === 'refund' ? '−' : ''}
                    {formatRupees(entry.amount)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title={t('khata.outstandingTitle')} description={t('khata.outstandingHint')}>
        {outstanding.truncated ? (
          <div className="mb-3">
            <Alert tone="info">{t('khata.outstandingTruncated')}</Alert>
          </div>
        ) : null}
        {outstanding.rows.length === 0 ? (
          <EmptyState title={t('khata.outstandingEmpty')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('khata.col.since')}</TH>
                <TH>{t('khata.col.customer')}</TH>
                <TH>{t('khata.col.application')}</TH>
                <TH className="text-right">{t('khata.total')}</TH>
                <TH className="text-right">{t('khata.paid')}</TH>
                <TH className="text-right">{t('khata.balanceDue')}</TH>
              </TR>
            </THead>
            <TBody>
              {outstanding.rows.map((row) => (
                <TR key={row.applicationId}>
                  <TD className="whitespace-nowrap text-slate-500">
                    {shortDate.format(new Date(row.createdAt))}
                  </TD>
                  <TD>
                    <Link href={`/customers/${row.customerId}`} className="hover:underline">
                      {row.customerName ?? '—'}
                    </Link>
                  </TD>
                  <TD>
                    <Link
                      href={`/applications/${row.applicationId}`}
                      className="text-brand-700 hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.billNumber ? (
                      <span className="ml-1.5 text-xs text-slate-500">
                        {formatBillNumber(row.billNumber)}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-right tabular-nums">{formatRupees(row.total)}</TD>
                  <TD className="text-right tabular-nums">{formatRupees(row.paid)}</TD>
                  <TD className="text-right font-semibold tabular-nums text-amber-700">
                    {formatRupees(row.due)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
