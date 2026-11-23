import { LoadingRegion, Skeleton } from '@assistigo/ui';
import { getTranslations } from '@/lib/i18n/server';

/*
 * Shown inside the console shell while a console page fetches. Written dark-first like the rest
 * of the console (the `console` tone), so it follows the console's light theme automatically.
 * One shape for every console screen: they are almost all a title, a row of tiles and a table.
 */
const CARD = 'overflow-hidden rounded-xl border border-slate-800/80 bg-console-surface';

export default async function ConsoleLoading() {
  const { t } = await getTranslations();
  return (
    <LoadingRegion label={t('common.loading')} className="space-y-6">
      <div className="space-y-2">
        <Skeleton tone="console" className="h-6 w-56" />
        <Skeleton tone="console" className="h-3.5 w-80 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${CARD} space-y-3 p-4`}>
            <Skeleton tone="console" className="h-3 w-24" />
            <Skeleton tone="console" className="h-7 w-16" />
          </div>
        ))}
      </div>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-3.5">
          <Skeleton tone="console" className="h-4 w-40" />
          <Skeleton tone="console" className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex gap-6 border-b border-slate-800/80 bg-slate-900/40 px-4 py-2.5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} tone="console" className="h-2.5 flex-1" />
          ))}
        </div>
        <div className="divide-y divide-slate-800/60">
          {Array.from({ length: 8 }, (_, row) => (
            <div key={row} className="flex items-center gap-6 px-4 py-3.5">
              {Array.from({ length: 5 }, (_, cell) => (
                <Skeleton
                  key={cell}
                  tone="console"
                  className={cell === 0 ? 'h-3.5 flex-[1.5]' : 'h-3.5 flex-1'}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    </LoadingRegion>
  );
}
