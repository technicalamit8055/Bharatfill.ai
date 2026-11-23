import Link from 'next/link';
import type { Translator } from '@/lib/i18n';
import { AlertIcon, ArrowRightIcon, ClipboardIcon } from './icons';

type AttentionItem = {
  key: string;
  icon: React.ReactNode;
  message: string;
  action: string;
  href: string;
};

/**
 * Work waiting on the operator, each with the one click that clears it.
 *
 * Renders nothing on a quiet day: a permanent "all clear" banner would train the eye to skip
 * this spot, and the spot is only worth anything if it appears when there is something to do.
 * Amber with an icon and a sentence, never colour alone.
 */
export function AttentionStrip({
  reviewsPending,
  applicationsDueSoon,
  t,
}: {
  /** Extractions in `review_required`; null when the viewer cannot see documents. */
  reviewsPending: number | null;
  /** Open applications due within the window or already overdue; null without the permission. */
  applicationsDueSoon: number | null;
  t: Translator;
}) {
  const items: AttentionItem[] = [];

  if (reviewsPending && reviewsPending > 0) {
    items.push({
      key: 'reviews',
      icon: <AlertIcon className="h-4 w-4" />,
      message: t(
        reviewsPending === 1 ? 'dashboard.attention.reviewsOne' : 'dashboard.attention.reviews',
        { count: reviewsPending },
      ),
      action: t('dashboard.attention.reviewsAction'),
      href: '/documents',
    });
  }

  if (applicationsDueSoon && applicationsDueSoon > 0) {
    items.push({
      key: 'deadlines',
      icon: <ClipboardIcon className="h-4 w-4" />,
      message: t(
        applicationsDueSoon === 1
          ? 'dashboard.attention.deadlinesOne'
          : 'dashboard.attention.deadlines',
        { count: applicationsDueSoon },
      ),
      action: t('dashboard.attention.deadlinesAction'),
      href: '/applications?filter=open',
    });
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-label={t('dashboard.attention.title')}
      className="divide-y divide-amber-200/70 overflow-hidden rounded-lg border border-amber-200 bg-amber-50"
    >
      {items.map((item) => (
        <div key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span aria-hidden className="shrink-0 text-amber-700">
            {item.icon}
          </span>
          <p className="min-w-0 flex-1 text-sm text-amber-900">{item.message}</p>
          <Link
            href={item.href}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-100"
          >
            {item.action}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      ))}
    </section>
  );
}
