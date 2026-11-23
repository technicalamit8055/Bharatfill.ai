import {
  RouteLoading,
  HeroSkeleton,
  PanelSkeleton,
  StatGridSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <StatGridSkeleton count={3} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={4} />
      </div>
    </RouteLoading>
  );
}
