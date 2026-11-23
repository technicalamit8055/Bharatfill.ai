import {
  RouteLoading,
  HeaderSkeleton,
  ListSkeleton,
  PanelSkeleton,
  StatGridSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeaderSkeleton />
      <StatGridSkeleton count={5} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <PanelSkeleton rows={5} />
          <ListSkeleton items={5} />
        </div>
        <div className="space-y-5">
          <ListSkeleton items={4} />
          <PanelSkeleton rows={3} />
        </div>
      </div>
    </RouteLoading>
  );
}
