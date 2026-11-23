import { RouteLoading, CardGridSkeleton, HeroSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <CardGridSkeleton count={12} />
    </RouteLoading>
  );
}
