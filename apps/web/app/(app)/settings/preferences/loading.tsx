import { RouteLoading, FormSkeleton, HeroSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <FormSkeleton />
    </RouteLoading>
  );
}
