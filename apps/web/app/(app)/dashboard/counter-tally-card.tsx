import Link from 'next/link';
import { formatRupees, type DayTally } from '@assistigo/core';
import type { Translator } from '@/lib/i18n';

/**
 * Today's counter on the home screen (migration 0050): the drawer, UPI and the udhar still
 * owed, so the first thing an operator sees in the morning is what came in and who still owes.
 */
export function CounterTallyCard({
  tally,
  udharTotal,
  udharCount,
  t,
}: {
  tally: DayTally;
  udharTotal: number;
  udharCount: number;
  t: Translator;
}) {
  const rows = [
    { key: 'cash', label: t('khata.tally.cash'), value: formatRupees(tally.cash) },
    { key: 'upi', label: t('khata.tally.upi'), value: formatRupees(tally.upi) },
    ...(tally.refunds > 0
      ? [
          {
            key: 'refunds',
            label: t('khata.tally.refunds'),
            value: `−${formatRupees(tally.refunds)}`,
          },
        ]
      : []),
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">{t('khata.dashboardTitle')}</h2>
        <Link href="/khata" className="text-xs font-medium text-brand-700 hover:underline">
          {t('khata.open')}
        </Link>
      </header>
      <div className="space-y-3 px-5 py-4">
        <div>
          <p className="text-xs text-slate-500">{t('khata.tally.net')}</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">
            {formatRupees(tally.net)}
          </p>
          <p className="text-xs text-slate-500">
            {t('khata.tally.entries', { payments: tally.payments, refunds: tally.refundCount })}
          </p>
        </div>
        <dl className="space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.key} className="flex justify-between gap-4">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="tabular-nums text-slate-800">{row.value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/khata"
          className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm hover:bg-amber-100"
        >
          <span className="text-amber-900">
            {t('khata.tally.udharCount', { count: udharCount })}
          </span>
          <span className="font-semibold tabular-nums text-amber-800">
            {formatRupees(udharTotal)}
          </span>
        </Link>
      </div>
    </section>
  );
}
