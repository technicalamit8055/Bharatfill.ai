import { RouteLoading, CardGridSkeleton, HeroSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton tall />
      <CardGridSkeleton count={8} />
    </RouteLoading>
  );
}
