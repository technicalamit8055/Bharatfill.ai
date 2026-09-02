import { z } from 'zod';
import { QUEUE_ITEM_STATUSES, formatIndianDate, type SchemeFieldDiff } from '@assistigo/core';
import { requirePlatformPagePermission } from '@/lib/admin/session';
import { getTranslations } from '@/lib/i18n/server';
import type { ScrapedSchemeQueueRow, ScraperSourceRow } from '@/lib/supabase/database.types';
import { AdminCard, AdminEmpty, AdminNote, AdminPageHeader } from '../ui';
import { ReviewCard } from './review-card';

export const metadata = { title: 'Review queue' };

/**
 * The staging inbox.
 *
 * Everything a scraper has produced and nobody has ruled on yet. Ordered dates-first: a window
 * that has moved is time-sensitive in a way a reworded benefits summary is not, and a queue
 * ordered purely by arrival buries the urgent item under the trivial ones.
 */

/** `proposed_changes` is jsonb, so it is parsed rather than trusted into the diff renderer. */
const changesSchema = z.array(
  z.object({
    path: z.string(),
    group: z.enum(['schedule', 'identity', 'content', 'eligibility', 'commercial']),
    before: z.unknown(),
    after: z.unknown(),
  }),
);

const payloadScheduleSchema = z.object({
  schedule: z.object({
    applicationStartDate: z.string().nullable(),
    applicationEndDate: z.string().nullable(),
    isAlwaysOpen: z.boolean(),
  }),
  title: z.object({ en: z.string() }).partial().optional(),
});

const KIND_ORDER: Record<string, number> = {
  deadline_only: 0,
  new: 1,
  update: 2,
  no_change: 3,
};

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPagePermission('platform.queue.view');
  const { t } = await getTranslations();
  const params = await searchParams;

  const requested = typeof params.status === 'string' ? params.status : 'pending';
  const status = (QUEUE_ITEM_STATUSES as readonly string[]).includes(requested)
    ? requested
    : 'pending';

  const [itemsResult, sourcesResult] = await Promise.all([
    session.supabase
      .from('scraped_schemes_queue')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100),
    session.supabase.from('scraper_sources').select('id, name'),
  ]);

  const items = (itemsResult.data ?? []) as ScrapedSchemeQueueRow[];
  const sourceNames = new Map(
    ((sourcesResult.data ?? []) as Pick<ScraperSourceRow, 'id' | 'name'>[]).map((source) => [
      source.id,
      source.name,
    ]),
  );

  const canReview = session.permissions.has('platform.queue.review');

  const cards = items
    .map((item) => {
      const changes = changesSchema.safeParse(item.proposed_changes);
      const payload = payloadScheduleSchema.safeParse(item.payload);

      return {
        id: item.id,
        slug: item.slug,
        title: payload.success ? (payload.data.title?.en ?? item.slug) : item.slug,
        sourceName: sourceNames.get(item.source_id) ?? t('admin.queue.unknownSource'),
        sourceUrl: item.source_url,
        changeKind: item.change_kind,
        changes: (changes.success ? changes.data : []) as SchemeFieldDiff[],
        confidence: item.confidence,
        fetcherNote: item.fetcher_note,
        createdAt: formatIndianDate(item.created_at) ?? '',
        isNew: item.change_kind === 'new',
        payloadSummary: {
          start: payload.success ? payload.data.schedule.applicationStartDate : null,
          end: payload.success ? payload.data.schedule.applicationEndDate : null,
          alwaysOpen: payload.success ? payload.data.schedule.isAlwaysOpen : false,
        },
      };
    })
    .sort((a, b) => (KIND_ORDER[a.changeKind] ?? 9) - (KIND_ORDER[b.changeKind] ?? 9));

  const tabs = QUEUE_ITEM_STATUSES.map((value) => ({
    value,
    label: t(`admin.queue.status.${value}`),
  }));

  return (
    <>
      <AdminPageHeader title={t('admin.queue.title')} description={t('admin.queue.subtitle')} />

      <AdminNote>{t('admin.queue.governanceNote')}</AdminNote>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <a
            key={tab.value}
            href={`/admin/queue?status=${tab.value}`}
            className={
              tab.value === status
                ? 'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700'
            }
          >
            {tab.label}
          </a>
        ))}
      </div>

      {cards.length === 0 ? (
        <AdminCard>
          <AdminEmpty
            title={t(status === 'pending' ? 'admin.queue.emptyInbox' : 'admin.queue.emptyFiltered')}
            description={status === 'pending' ? t('admin.queue.emptyInboxHelp') : undefined}
          />
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <ReviewCard
              key={card.id}
              item={card}
              canReview={canReview && status === 'pending'}
            />
          ))}
        </div>
      )}
    </>
  );
}
