import { RouteLoading, HeroSkeleton, PanelSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <PanelSkeleton rows={3} />
      <PanelSkeleton rows={4} />
    </RouteLoading>
  );
}
