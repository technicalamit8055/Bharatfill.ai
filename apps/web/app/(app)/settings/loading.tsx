import {
  RouteLoading,
  HeroSkeleton,
  CardGridSkeleton,
  PanelSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <PanelSkeleton rows={3} />
      <CardGridSkeleton count={4} />
    </RouteLoading>
  );
}
